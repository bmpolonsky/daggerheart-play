import { clamp, toSafeInteger } from '../core/utils/clamp';
import { nowIso } from '../core/utils/date';
import { createId } from '../core/utils/id';
import { removeFromRecord, replaceInRecord } from '../core/utils/object';
import { beastformToActiveState, beastformToSheetCard, beastformToWeapon } from '../domain/content/beastforms';
import { DEFAULT_ACTION_TOKENS, DEFAULT_MAX_HOPE, CLASS_DOMAINS, CLASS_STARTING_STATS } from '../domain/rules/constants';
import {
  calculateThresholds,
  ensureCharacterCondition,
  removeCharacterConditionByName,
  syncCharacterDefeatedCondition
} from '../domain/rules/characterDamage';
import {
  buildAvoidDeathRoll,
  clampHopeToEffectiveMax,
  createCharacterScar,
  rollHopeDie,
  rollRiskItAll
} from '../domain/rules/deathMoves';
import { buildEffectiveCharacterStats } from '../domain/rules/effects';
import { resolveDomainCardTokenMax } from '../domain/rules/domainCards';
import { buildEquipmentAttachmentPlan } from '../domain/rules/equipment';
import { createCharacter, createDomainCard, createExperience, createInventoryItem, createSheetCard, createWeapon, sanitizeWealth } from '../domain/rules/factories';
import {
  applyDomainCardMove,
  enforceCharacterHandLimit,
  placeAcquiredDomainCards,
  permanentlyVaultDomainCard,
  type DomainCardMoveRequest,
  type DomainCardMoveResult
} from '../domain/rules/cardLoadout';
import {
  appendCharacterChangeHistory,
  applySafeCharacterUndo,
  createCharacterChangeRecord,
  SYSTEM_CHARACTER_ACTOR,
  type CharacterMutationContext,
  type CharacterUndoResult
} from '../domain/rules/characterHistory';
import {
  nextCharacterAdvancementState,
  validateCharacterLevelUp,
  type CharacterLevelUpApplicationInput,
  type CharacterLevelUpValidation
} from '../domain/rules/levelUp';
import { createDefaultRangerCompanion, normalizeRangerCompanion } from '../domain/rules/rangerCompanion';
import type { LongRestRecoveryMove } from '../domain/rules/rest';
import { ActorStatus, normalizeStatusTag } from '../domain/rules/statuses';
import { starterDomainCardsFromLibrary } from '../domain/characterBuilder/index';
import {
  characterBuilderRuleModifiersForSubclass,
  normalizeCharacterRuleModifiers,
  startingDomainCardCount,
  type CharacterRuleModifier
} from '../domain/rules/characterRuleModifiers';
import {
  createCharacterUsageTracker,
  removeCharacterUsageTracker,
  resetCharacterUsageTrackers,
  updateCharacterUsageTracker,
  type CharacterUsageTrackerInput
} from '../domain/rules/usageTrackers';
import type { GenericLibraryItem, LibraryBeastform, LibraryEquipmentItem } from '../domain/content/types';
import type {
  ArmorState,
  Character,
  CharacterChangeActor,
  CharacterCompanionState,
  CharacterInventoryItem,
  CharacterWealth,
  DeathMoveRollResult,
  CharacterSheetCard,
  CharacterUsageTracker,
  CharactersState,
  DaggerheartClass,
  DomainCardRecord,
  Experience,
  Thresholds,
  TraitId,
  Weapon
} from '../domain/rules/types';
import { charactersStore } from '../stores/gameStores';

const MAX_ARMOR_SCORE = 12;

export type DeathMoveStatusTransition = 'defeatedAdded' | 'defeatedRemoved';
export type DeathMoveRequestHandler = (character: Pick<Character, 'id' | 'name'>, transition: DeathMoveStatusTransition) => void;

export interface EquipmentApplicationResult {
  characterId: string;
  itemId: string;
  itemName: string;
  kind: 'armor' | 'weapon' | 'inventory';
  warnings: string[];
}

export type CharacterLevelUpInput = CharacterLevelUpApplicationInput;

export interface CharacterLevelUpApplyResult {
  applied: boolean;
  validation: CharacterLevelUpValidation;
}

export class CharacterService {
  readonly characters$ = charactersStore.toStream();
  private deathMoveRequestHandler: DeathMoveRequestHandler | null = null;
  private mutationActorProvider: () => CharacterChangeActor = () => SYSTEM_CHARACTER_ACTOR;
  private readonly activeHistoryGroups = new Map<string, { id: string; actor?: CharacterChangeActor }>();

  beginHistoryGroup(characterId: string, actor?: CharacterChangeActor): string {
    const id = createId('character-edit-session');
    this.activeHistoryGroups.set(characterId, { id, actor });
    return id;
  }

  endHistoryGroup(characterId: string): void {
    this.activeHistoryGroups.delete(characterId);
  }

  setDeathMoveRequestHandler(handler: DeathMoveRequestHandler | null): void {
    this.deathMoveRequestHandler = handler;
  }

  setMutationActorProvider(provider: (() => CharacterChangeActor) | null): void {
    this.mutationActorProvider = provider ?? (() => SYSTEM_CHARACTER_ACTOR);
  }

  /**
   * Authority-side replacement for a full player snapshot. Client-provided audit
   * fields and immutable identity timestamps are ignored; one local audit record
   * is produced from the authoritative before/after values.
   */
  applyTrustedPlayerUpdate(
    id: string,
    next: Character,
    actor: CharacterChangeActor,
    syncRevision?: { participantId: string; revision: number }
  ): boolean {
    const current = this.getCharacter(id);
    if (!current || actor.role !== 'player' || next.id !== id) return false;
    if (syncRevision) {
      const currentRevision = current.playerSyncRevision;
      if (
        currentRevision?.participantId === syncRevision.participantId
        && syncRevision.revision <= currentRevision.revision
      ) {
        return false;
      }
    }
    const normalized = createCharacter({
      ...next,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      ruleModifiers: current.ruleModifiers,
      changeHistory: current.changeHistory ?? [],
      playerSyncRevision: syncRevision ?? current.playerSyncRevision
    });
    const isLevelUp = normalized.level === current.level + 1;
    this.patchCharacter(id, () => normalized, {
      actor,
      kind: isLevelUp ? 'levelUp' : 'edit',
      summary: isLevelUp ? `Повышение до ${normalized.level} уровня` : 'Изменения игрока'
    });
    return true;
  }

  createCharacter(input?: Partial<Character> & { className?: DaggerheartClass }): Character {
    const character = createCharacter(input);
    charactersStore.update((state) => ({
      ...state,
      entities: { ...state.entities, [character.id]: character },
      order: [...state.order, character.id],
      selectedId: character.id,
      updatedAt: nowIso()
    }));
    return character;
  }

  duplicateCharacter(id: string): Character | null {
    const original = this.getCharacter(id);
    if (!original) {
      return null;
    }
    return this.createCharacter({
      ...original,
      id: undefined,
      name: `${original.name} (копия)`,
      changeHistory: [],
      createdAt: undefined,
      updatedAt: undefined
    });
  }

  deleteCharacter(id: string): void {
    charactersStore.update((state) => {
      const order = state.order.filter((item) => item !== id);
      return {
        ...state,
        entities: removeFromRecord(state.entities, id),
        order,
        selectedId: state.selectedId === id ? order[0] ?? null : state.selectedId,
        updatedAt: nowIso()
      };
    });
  }

  selectCharacter(id: string | null): void {
    charactersStore.update((state) => ({
      ...state,
      selectedId: id && state.entities[id] ? id : null,
      updatedAt: nowIso()
    }));
  }

  updateIdentity(id: string, patch: Partial<Pick<Character, 'name' | 'playerName' | 'pronouns' | 'portraitUrl' | 'subclassName' | 'ancestry' | 'community' | 'notes'>>): void {
    this.patchCharacter(id, (character) => ({ ...character, ...patch }));
  }

  updateSubclassFromLibrary(id: string, subclass: GenericLibraryItem | null): void {
    this.patchCharacter(id, (character) => {
      const ruleModifiers = normalizeCharacterRuleModifiers([
        ...character.ruleModifiers.filter((modifier) => modifier.source !== 'subclass'),
        ...characterBuilderRuleModifiersForSubclass(subclass)
      ]);
      return {
        ...character,
        subclassName: subclass?.name ?? '',
        subclassSlug: subclass?.slug ?? '',
        ruleModifiers,
        domainCards: enforceCharacterHandLimit(character.domainCards, ruleModifiers)
      };
    }, { summary: 'Изменён подкласс и его правила' });
  }

  updateClass(id: string, className: DaggerheartClass): void {
    this.patchCharacter(id, (character) => {
      const stats = CLASS_STARTING_STATS[className];
      const nextCharacter = {
        ...character,
        className,
        domains: CLASS_DOMAINS[className],
        evasion: stats.evasion,
        hp: { ...character.hp, max: stats.hp }
      };
      return {
        ...nextCharacter,
        hp: { ...nextCharacter.hp, marked: Math.min(character.hp.marked, buildEffectiveCharacterStats(nextCharacter).hp.max) }
      };
    });
  }

  updateLevel(id: string, level: number): void {
    const safeLevel = clamp(toSafeInteger(level, 1), 1, 10);
    this.patchCharacter(id, (character) => ({
      ...character,
      level: safeLevel,
      thresholds: calculateThresholds(character.armor, safeLevel)
    }));
  }

  validateLevelUp(id: string, input: CharacterLevelUpInput): CharacterLevelUpValidation | null {
    const character = this.getCharacter(id);
    return character ? validateCharacterLevelUp(character, { ...input, ruleModifiers: character.ruleModifiers }) : null;
  }

  applyLevelUpDetailed(id: string, input: CharacterLevelUpInput): CharacterLevelUpApplyResult {
    const character = this.getCharacter(id);
    const validation = character
      ? validateCharacterLevelUp(character, { ...input, ruleModifiers: character.ruleModifiers })
      : { canApply: false, strictlyValid: false, overridden: false, issues: [{ code: 'level.nextRequired' as const, message: 'Персонаж не найден.' }] };
    if (!character || !validation.canApply) return { applied: false, validation };
    const override = validation.overridden ? input.freeformOverride : undefined;
    this.patchCharacter(id, (current) => {
      const level = clamp(toSafeInteger(input.level, current.level), 1, 10);
      const proficiency = input.proficiency === undefined
        ? current.proficiency
        : clamp(toSafeInteger(input.proficiency, current.proficiency), 1, 6);
      const thresholdBonus = input.thresholdBonus ?? {};
      const hpMax = input.hpMax === undefined ? current.hp.max : clamp(toSafeInteger(input.hpMax, current.hp.max), 1, 12);
      const stressMax = input.stressMax === undefined ? current.stress.max : clamp(toSafeInteger(input.stressMax, current.stress.max), 1, 12);
      const evasion = input.evasion === undefined ? current.evasion : clamp(toSafeInteger(input.evasion, current.evasion), 0, 99);
      const traitBonuses = input.traitBonuses ?? {};
      const traits = Object.entries(traitBonuses).reduce<Character['traits']>((nextTraits, [trait, bonus]) => ({
        ...nextTraits,
        [trait]: clamp(toSafeInteger(nextTraits[trait as TraitId], 0) + toSafeInteger(bonus, 0), -10, 20)
      }), current.traits);
      const increasedExperienceIds = new Set((input.experienceIncreases ?? []).map((item) => item.experienceId));
      const newDomainCards = (input.domainCards ?? []).map((card) => createDomainCard(card));
      const exchangedDomainCards = input.domainCardExchange
        ? current.domainCards.map((card) => card.id === input.domainCardExchange?.removeCardId
          ? createDomainCard({
              ...input.domainCardExchange.replacement,
              inLoadout: card.inLoadout,
              permanentlyVaulted: false,
              loadoutChoicePending: false
            })
          : card)
        : current.domainCards;
      const nextDomainCards = placeAcquiredDomainCards(exchangedDomainCards, newDomainCards, current.ruleModifiers);
      const nextSheetCards = [
        ...current.sheetCards,
        ...(input.multiclassClassCards ?? []).map((card) => createSheetCard({ ...card, kind: 'classFeature' })),
        ...(input.subclassCards ?? []).map((card) => createSheetCard({ ...card, kind: 'subclassFeature' }))
      ];
      const nextCharacter: Character = {
        ...current,
        level,
        proficiency,
        evasion,
        traits,
        hp: { ...current.hp, max: hpMax },
        stress: { ...current.stress, max: stressMax },
        thresholds: {
          major: clamp(toSafeInteger(thresholdBonus.major ?? current.thresholds.major + Math.max(0, level - current.level), current.thresholds.major), 0, 999),
          severe: clamp(toSafeInteger(thresholdBonus.severe ?? current.thresholds.severe + Math.max(0, level - current.level), current.thresholds.severe), 0, 999)
        },
        experiences: [
          ...current.experiences.map((experience) => increasedExperienceIds.has(experience.id)
            ? { ...experience, modifier: experience.modifier + 1 }
            : experience),
          ...(input.experiences ?? []).map((experience) => ({ ...createExperience(), ...experience }))
        ],
        domainCards: nextDomainCards,
        sheetCards: nextSheetCards,
        advancement: nextCharacterAdvancementState(current, input),
        notes: input.notes ? [current.notes, input.notes].filter(Boolean).join('\n') : current.notes
      };
      const effective = buildEffectiveCharacterStats(nextCharacter);
      return {
        ...nextCharacter,
        hp: { ...nextCharacter.hp, marked: Math.min(current.hp.marked, effective.hp.max) },
        stress: { ...nextCharacter.stress, marked: Math.min(current.stress.marked, effective.stress.max) }
      };
    }, {
      actor: override?.actor ?? input.actor,
      kind: override ? 'freeform' : 'levelUp',
      summary: override ? 'Свободное повышение уровня Мастером' : `Повышение до ${input.level} уровня`,
      overrideReason: override?.reason
    });
    return { applied: true, validation };
  }

  applyLevelUp(id: string, input: CharacterLevelUpInput): boolean {
    return this.applyLevelUpDetailed(id, input).applied;
  }

  updateProficiency(id: string, proficiency: number): void {
    this.patchCharacter(id, (character) => ({ ...character, proficiency: clamp(toSafeInteger(proficiency, 1), 1, 6) }));
  }

  updateTrait(id: string, trait: TraitId, value: number): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      traits: { ...character.traits, [trait]: clamp(toSafeInteger(value, 0), -10, 20) }
    }));
  }

  updateEvasion(id: string, value: number): void {
    this.patchCharacter(id, (character) => ({ ...character, evasion: clamp(toSafeInteger(value, 10), 0, 99) }));
  }

  updateThresholds(id: string, thresholds: Partial<Thresholds>): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      thresholds: {
        major: clamp(toSafeInteger(thresholds.major ?? character.thresholds.major), 0, 999),
        severe: clamp(toSafeInteger(thresholds.severe ?? character.thresholds.severe), 0, 999)
      }
    }));
  }

  updateArmor(id: string, armorPatch: Partial<ArmorState>, recalculate = true): void {
    this.patchCharacter(id, (character) => {
      const score = clamp(toSafeInteger(armorPatch.score ?? character.armor.score), 0, MAX_ARMOR_SCORE);
      const armorBase = {
        ...character.armor,
        ...armorPatch,
        score,
        baseMajor: clamp(toSafeInteger(armorPatch.baseMajor ?? character.armor.baseMajor), 0, 999),
        baseSevere: clamp(toSafeInteger(armorPatch.baseSevere ?? character.armor.baseSevere), 0, 999)
      };
      const effectiveScore = buildEffectiveCharacterStats({ ...character, armor: armorBase }).armorScore;
      const armor = {
        ...armorBase,
        markedSlots: clamp(toSafeInteger(armorPatch.markedSlots ?? character.armor.markedSlots), 0, effectiveScore)
      };
      return {
        ...character,
        armor,
        thresholds: recalculate ? calculateThresholds(armor, character.level) : character.thresholds
      };
    });
  }

  adjustHope(id: string, delta: number): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      hope: {
        ...character.hope,
        value: clamp(character.hope.value + delta, 0, buildEffectiveCharacterStats(character).hope.max)
      }
    }), { audit: false });
  }

  spendHope(id: string, amount: number): boolean {
    const character = this.getCharacter(id);
    const safeAmount = Math.max(0, toSafeInteger(amount, 0));
    if (!character || character.hope.value < safeAmount) {
      return false;
    }
    this.adjustHope(id, -safeAmount);
    return true;
  }

  setHope(id: string, value: number): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      hope: { ...character.hope, value: clamp(toSafeInteger(value, 0), 0, buildEffectiveCharacterStats(character).hope.max) }
    }), { audit: false });
  }

  updateResourceMax(id: string, resource: 'hp' | 'stress' | 'hope', max: number): void {
    const safeMax = clamp(toSafeInteger(max, 1), 0, resource === 'hope' ? DEFAULT_MAX_HOPE : 12);
    const patch = this.patchCharacter(id, (character) => {
      if (resource === 'hope') {
        const nextCharacter = { ...character, hope: { ...character.hope, max: safeMax } };
        return {
          ...nextCharacter,
          hope: {
            ...nextCharacter.hope,
            value: Math.min(nextCharacter.hope.value, buildEffectiveCharacterStats(nextCharacter).hope.max)
          }
        };
      }
      const nextCharacter = {
        ...character,
        [resource]: {
          marked: character[resource].marked,
          max: safeMax
        }
      };
      const effective = buildEffectiveCharacterStats(nextCharacter);
      const clampedCharacter = {
        ...nextCharacter,
        [resource]: {
          ...nextCharacter[resource],
          marked: Math.min(nextCharacter[resource].marked, effective[resource].max)
        }
      };
      if (resource === 'hp') {
        return syncCharacterDefeatedCondition(clampedCharacter);
      }
      return {
        ...clampedCharacter,
        conditions: effective.stress.max > 0 && clampedCharacter.stress.marked >= effective.stress.max
          ? ensureCharacterCondition(clampedCharacter.conditions, ActorStatus.Vulnerable)
          : removeCharacterConditionByName(clampedCharacter.conditions, ActorStatus.Vulnerable)
      };
    });
    if (resource === 'hp') {
      this.requestDeathMoveOnDefeatedTransition(patch);
    }
  }

  markSlots(id: string, resource: 'hp' | 'stress', delta: number): void {
    const patch = this.patchCharacter(id, (character) => {
      const track = character[resource];
      const effective = buildEffectiveCharacterStats(character);
      const effectiveMax = effective[resource].max;
      const marked = clamp(track.marked + delta, 0, effectiveMax);
      const nextConditions = resource === 'stress'
        ? (effectiveMax > 0 && marked >= effectiveMax ? ensureCharacterCondition(character.conditions, ActorStatus.Vulnerable) : removeCharacterConditionByName(character.conditions, ActorStatus.Vulnerable))
        : (delta < 0 && character.hp.marked > marked
          ? removeCharacterConditionByName(character.conditions, ActorStatus.Defeated)
          : character.conditions);
      const updated = {
        ...character,
        [resource]: { ...track, marked },
        activeBeastform: resource === 'hp' && marked >= effectiveMax ? null : character.activeBeastform ?? null,
        conditions: nextConditions
      };
      return resource === 'hp' ? syncCharacterDefeatedCondition(updated) : updated;
    }, { audit: false });
    if (resource === 'hp') {
      this.requestDeathMoveOnDefeatedTransition(patch);
    }
  }

  markStress(id: string, amount = 1): void {
    const character = this.getCharacter(id);
    if (!character) {
      return;
    }
    const effective = buildEffectiveCharacterStats(character);
    const availableStress = Math.max(0, effective.stress.max - effective.stress.marked);
    if (availableStress <= 0) {
      this.markSlots(id, 'hp', 1);
      return;
    }
    const stressToMark = Math.min(Math.max(0, amount), availableStress);
    const overflow = Math.max(0, amount - stressToMark);
    this.markSlots(id, 'stress', stressToMark);
    if (overflow > 0) {
      this.markSlots(id, 'hp', 1);
    }
  }

  clearStress(id: string, amount = 1): void {
    this.markSlots(id, 'stress', -Math.max(0, amount));
  }

  clearHp(id: string, amount = 1): void {
    this.markSlots(id, 'hp', -Math.max(0, amount));
  }

  resetActionTokens(tokens = DEFAULT_ACTION_TOKENS): void {
    for (const id of charactersStore.get().order) {
      this.patchCharacter(id, (character) => ({ ...character, actionTokens: tokens }), {
        audit: false,
        summary: 'Сброшены жетоны действий'
      });
    }
  }

  applyLongRestGroupRecovery(move: LongRestRecoveryMove): number {
    let changedCount = 0;
    for (const id of charactersStore.get().order) {
      const character = this.getCharacter(id);
      if (!character) continue;
      const recovered = recoverLongRestCharacter(character, move);
      if (recovered === character) continue;
      changedCount += 1;
      this.patchCharacter(id, () => recovered, { audit: false, summary: 'Восстановление после продолжительного отдыха' });
    }
    return changedCount;
  }

  spendActionToken(id: string): void {
    this.patchCharacter(id, (character) => ({ ...character, actionTokens: Math.max(0, character.actionTokens - 1) }), { audit: false });
  }

  setActionTokens(id: string, value: number): void {
    this.patchCharacter(id, (character) => ({ ...character, actionTokens: clamp(toSafeInteger(value, 0), 0, 12) }), { audit: false });
  }

  addExperience(id: string, input?: Partial<Experience>): void {
    this.patchCharacter(id, (character) => {
      const base = createExperience();
      return {
        ...character,
        experiences: [...character.experiences, { ...base, ...input, id: input?.id ?? base.id }]
      };
    });
  }

  updateExperience(id: string, experienceId: string, patch: Partial<Experience>): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      experiences: character.experiences.map((experience) => (experience.id === experienceId ? { ...experience, ...patch } : experience))
    }));
  }

  removeExperience(id: string, experienceId: string): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      experiences: character.experiences.filter((experience) => experience.id !== experienceId)
    }));
  }

  addWeapon(id: string, input?: Partial<Weapon>): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      weapons: [...character.weapons, createWeapon(input)]
    }));
  }

  updateWeapon(id: string, weaponId: string, patch: Partial<Weapon>): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      weapons: character.weapons.map((weapon) => (weapon.id === weaponId ? { ...weapon, ...patch } : weapon))
    }));
  }

  removeWeapon(id: string, weaponId: string): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      weapons: character.weapons.filter((weapon) => weapon.id !== weaponId)
    }));
  }

  addDomainCard(id: string, input?: Partial<DomainCardRecord>): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      domainCards: placeAcquiredDomainCards(character.domainCards, [createDomainCard(input)], character.ruleModifiers)
    }));
  }

  ensureStarterDomainCardsFromLibrary(
    id: string,
    libraryCards: GenericLibraryItem[],
    count?: number,
    subclass?: GenericLibraryItem | null
  ): boolean {
    const character = this.getCharacter(id);
    if (!character || character.domainCards.length > 0 || libraryCards.length === 0) return false;

    const subclassModifiers = characterBuilderRuleModifiersForSubclass(subclass);
    const resolvedCount = count ?? startingDomainCardCount(subclassModifiers);
    const cards = starterDomainCardsFromLibrary(libraryCards, character.domains, resolvedCount);
    if (cards.length === 0) return false;

    this.patchCharacter(id, (current) => {
      const ruleModifiers = normalizeCharacterRuleModifiers([
        ...current.ruleModifiers,
        ...subclassModifiers.filter((modifier) => !current.ruleModifiers.some((item) => item.id === modifier.id))
      ]);
      return {
        ...current,
        domainCards: enforceCharacterHandLimit(cards, ruleModifiers),
        ruleModifiers
      };
    });
    return true;
  }

  updateDomainCard(id: string, cardId: string, patch: Partial<DomainCardRecord>): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      domainCards: enforceCharacterHandLimit(character.domainCards.map((card) => (
        card.id === cardId
          ? createDomainCard({ ...card, ...patch, id: card.id, permanentlyVaulted: card.permanentlyVaulted || patch.permanentlyVaulted })
          : card
      )), character.ruleModifiers)
    }));
  }

  updateRuleModifiers(id: string, modifiers: readonly CharacterRuleModifier[]): boolean {
    const character = this.getCharacter(id);
    if (!character) return false;
    const ruleModifiers = normalizeCharacterRuleModifiers(modifiers);
    this.patchCharacter(id, (current) => ({
      ...current,
      ruleModifiers,
      domainCards: enforceCharacterHandLimit(current.domainCards, ruleModifiers)
    }), {
      kind: 'edit',
      summary: 'Изменены модификаторы правил'
    });
    return true;
  }

  moveDomainCard(
    id: string,
    request: DomainCardMoveRequest,
    context: CharacterMutationContext = {}
  ): DomainCardMoveResult | null {
    const character = this.getCharacter(id);
    if (!character) return null;
    const result = applyDomainCardMove(character, { ...request, modifiers: character.ruleModifiers });
    if (!result.applied) return result;
    this.patchCharacter(id, () => result.character, {
      ...context,
      kind: 'cardMove',
      summary: request.to === 'hand'
        ? 'Карта перемещена в Руку'
        : character.domainCards.find((card) => card.id === request.cardId)?.loadoutChoicePending
          ? 'Новая карта оставлена в Хранилище'
          : 'Карта перемещена в Хранилище'
    });
    return { ...result, character: this.getCharacter(id) ?? result.character };
  }

  permanentlyVaultDomainCard(id: string, cardId: string, context: CharacterMutationContext = {}): boolean {
    const character = this.getCharacter(id);
    if (!character || !character.domainCards.some((card) => card.id === cardId)) return false;
    this.patchCharacter(id, (current) => permanentlyVaultDomainCard(current, cardId), {
      ...context,
      kind: 'cardMove',
      summary: 'Карта навсегда помещена в Хранилище'
    });
    return true;
  }

  removeDomainCard(id: string, cardId: string): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      domainCards: character.domainCards.filter((card) => card.id !== cardId)
    }));
  }

  updateDomainCardTokens(id: string, cardId: string, value: number): void {
    this.patchCharacter(id, (character) => {
      const traits = buildEffectiveCharacterStats(character).traits;
      return {
        ...character,
        domainCards: character.domainCards.map((card) => {
          if (card.id !== cardId) return card;
          const max = resolveDomainCardTokenMax(card, traits);
          return { ...card, tokens: { ...card.tokens, value: clamp(value, 0, max), max } };
        })
      };
    }, { audit: false });
  }

  configureUsageTracker(
    id: string,
    input: CharacterUsageTrackerInput,
    context: CharacterMutationContext = {}
  ): CharacterUsageTracker | null {
    const character = this.getCharacter(id);
    if (!character || !usageTrackerTargetExists(character, input.targetKind, input.targetId)) return null;
    const tracker = createCharacterUsageTracker(input);
    this.patchCharacter(id, (current) => ({
      ...current,
      usageTrackers: [...(current.usageTrackers ?? []).filter((item) => item.id !== tracker.id), tracker]
    }), { ...context, kind: 'tracker', summary: `Настроен трекер «${tracker.label}»` });
    return tracker;
  }

  updateUsageTracker(
    id: string,
    trackerId: string,
    patch: Partial<Pick<CharacterUsageTracker, 'label' | 'current' | 'max' | 'reset'>>,
    context: CharacterMutationContext = {}
  ): boolean {
    const character = this.getCharacter(id);
    if (!character?.usageTrackers?.some((tracker) => tracker.id === trackerId)) return false;
    this.patchCharacter(id, (current) => ({
      ...current,
      usageTrackers: updateCharacterUsageTracker(current.usageTrackers ?? [], trackerId, patch)
    }), {
      ...context,
      audit: patch.label !== undefined || patch.max !== undefined || patch.reset !== undefined,
      kind: 'tracker',
      summary: 'Изменён трекер использования'
    });
    return true;
  }

  removeUsageTracker(id: string, trackerId: string, context: CharacterMutationContext = {}): boolean {
    const character = this.getCharacter(id);
    if (!character?.usageTrackers?.some((tracker) => tracker.id === trackerId)) return false;
    this.patchCharacter(id, (current) => ({
      ...current,
      usageTrackers: removeCharacterUsageTracker(current.usageTrackers ?? [], trackerId)
    }), { ...context, kind: 'tracker', summary: 'Удалён трекер использования' });
    return true;
  }

  resetUsageTrackersForRest(
    id: string,
    rest: 'short' | 'long',
    context: CharacterMutationContext = {}
  ): number {
    const character = this.getCharacter(id);
    if (!character) return 0;
    const previous = character.usageTrackers ?? [];
    const next = resetCharacterUsageTrackers(previous, rest);
    const resetCount = next.filter((tracker, index) => tracker.current !== previous[index]?.current).length;
    if (resetCount === 0) return 0;
    this.patchCharacter(id, (current) => ({ ...current, usageTrackers: next }), {
      ...context,
      audit: false,
      kind: 'tracker',
      summary: rest === 'long' ? 'Сброс трекеров после продолжительного отдыха' : 'Сброс трекеров после короткого отдыха'
    });
    return resetCount;
  }

  addSheetCard(id: string, input?: Partial<CharacterSheetCard>): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      sheetCards: [...(character.sheetCards ?? []), createSheetCard(input)]
    }));
  }

  updateSheetCard(id: string, cardId: string, patch: Partial<CharacterSheetCard>): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      sheetCards: (character.sheetCards ?? []).map((card) => (card.id === cardId ? { ...card, ...patch } : card))
    }));
  }

  removeSheetCard(id: string, cardId: string): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      sheetCards: (character.sheetCards ?? []).filter((card) => card.id !== cardId),
      usageTrackers: (character.usageTrackers ?? []).filter((tracker) => (
        tracker.targetKind !== 'feature' || tracker.targetId !== cardId
      ))
    }));
  }

  addInventoryItem(id: string, item: string | Partial<CharacterInventoryItem> = ''): void {
    const record = typeof item === 'string'
      ? createInventoryItem({ name: item || 'Новый предмет' })
      : createInventoryItem(item);
    this.patchCharacter(id, (character) => ({ ...character, inventory: [...character.inventory, record] }));
  }

  addEquipmentItem(id: string, item: LibraryEquipmentItem): EquipmentApplicationResult | null {
    if (!this.getCharacter(id)) {
      return null;
    }

    const plan = buildEquipmentAttachmentPlan(item);
    if (plan.kind === 'armor' && plan.armor) {
      this.updateArmor(id, plan.armor, true);
    } else if (plan.kind === 'weapon' && plan.weapon) {
      this.addWeapon(id, plan.weapon);
    } else {
      this.addInventoryItem(id, plan.inventoryItem ?? { name: plan.name });
      if (plan.sheetCard && (plan.sheetCard.text || plan.sheetCard.imageUrl)) {
        this.addSheetCard(id, plan.sheetCard);
      }
    }

    return {
      characterId: id,
      itemId: item.id,
      itemName: plan.name,
      kind: plan.kind,
      warnings: plan.warnings
    };
  }

  addBeastform(id: string, beastform: LibraryBeastform): boolean {
    if (!this.getCharacter(id)) return false;
    this.addSheetCard(id, beastformToSheetCard(beastform));
    const weapon = beastformToWeapon(beastform);
    if (weapon) {
      this.addWeapon(id, weapon);
    }
    return true;
  }

  enterBeastform(id: string, beastform: LibraryBeastform, options: { mode?: 'stress' | 'evolution'; evolutionTrait?: TraitId | null } = {}): boolean {
    const character = this.getCharacter(id);
    if (!character) return false;
    if (options.mode === 'evolution') {
      if (!this.spendHope(id, 3)) return false;
    } else {
      this.markStress(id, 1);
    }
    this.patchCharacter(id, (current) => ({
      ...current,
      activeBeastform: beastformToActiveState(beastform, options.mode === 'evolution' ? options.evolutionTrait ?? null : null)
    }));
    return true;
  }

  exitBeastform(id: string): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      activeBeastform: null
    }));
  }

  ensureRangerCompanion(id: string, input?: Partial<CharacterCompanionState>): boolean {
    if (!this.getCharacter(id)) return false;
    this.patchCharacter(id, (character) => ({
      ...character,
      companion: character.companion ? normalizeRangerCompanion({ ...character.companion, ...input }) : createDefaultRangerCompanion(input)
    }));
    return true;
  }

  updateRangerCompanion(id: string, patch: Partial<CharacterCompanionState>): boolean {
    const character = this.getCharacter(id);
    if (!character?.companion) return false;
    this.patchCharacter(id, (current) => ({
      ...current,
      companion: current.companion ? normalizeRangerCompanion({ ...current.companion, ...patch }) : null
    }));
    return true;
  }

  markCompanionStress(id: string, delta = 1): boolean {
    const character = this.getCharacter(id);
    if (!character?.companion) return false;
    this.patchCharacter(id, (current) => {
      if (!current.companion) return current;
      const stress = current.companion.stress;
      const marked = clamp(stress.marked + delta, 0, stress.max);
      return {
        ...current,
        companion: normalizeRangerCompanion({
          ...current.companion,
          stress: { ...stress, marked },
          unavailableUntilLongRest: stress.max > 0 && marked >= stress.max
        })
      };
    });
    return true;
  }

  markRangerTarget(id: string, target: { targetKind: 'character' | 'adversary'; targetId: string; targetName: string }): boolean {
    if (!this.spendHope(id, 1)) return false;
    this.patchCharacter(id, (character) => ({
      ...character,
      rangerMark: {
        targetKind: target.targetKind,
        targetId: target.targetId,
        targetName: target.targetName,
        markedAt: nowIso()
      }
    }));
    return true;
  }

  clearRangerMark(id: string): void {
    this.patchCharacter(id, (character) => ({ ...character, rangerMark: null }));
  }

  updateInventoryItem(id: string, itemId: string, patch: Partial<CharacterInventoryItem>): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      inventory: character.inventory.map((item) => (item.id === itemId ? createInventoryItem({ ...item, ...patch, id: item.id }) : item))
    }));
  }

  updateWealth(id: string, patch: Partial<CharacterWealth>): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      wealth: sanitizeWealth({ ...character.wealth, ...patch })
    }));
  }

  removeInventoryItem(id: string, itemId: string): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      inventory: character.inventory.filter((item) => item.id !== itemId)
    }));
  }

  adjustInventoryQuantity(id: string, itemId: string, delta: number): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      inventory: character.inventory.map((item) => item.id === itemId
        ? createInventoryItem({ ...item, id: item.id, quantity: Math.max(0, item.quantity + delta) })
        : item)
    }));
  }

  adjustInventoryUses(id: string, itemId: string, delta: number): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      inventory: character.inventory.map((item) => {
        if (item.id !== itemId || !item.uses) return item;
        const current = clamp(item.uses.current + delta, 0, item.uses.max);
        return createInventoryItem({ ...item, id: item.id, uses: { ...item.uses, current } });
      })
    }));
  }

  useInventoryItem(id: string, itemId: string): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      inventory: character.inventory.map((item) => {
        if (item.id !== itemId || item.quantity <= 0) return item;
        if (!item.uses) {
          return createInventoryItem({ ...item, id: item.id, quantity: item.quantity - 1 });
        }
        if (item.uses.current > 1) {
          return createInventoryItem({ ...item, id: item.id, uses: { ...item.uses, current: item.uses.current - 1 } });
        }
        if (item.quantity > 1) {
          return createInventoryItem({
            ...item,
            id: item.id,
            quantity: item.quantity - 1,
            uses: { ...item.uses, current: item.uses.max }
          });
        }
        return createInventoryItem({ ...item, id: item.id, uses: { ...item.uses, current: 0 } });
      })
    }));
  }

  addCondition(id: string, name: string = ActorStatus.Vulnerable): void {
    const patch = this.patchCharacter(id, (character) => ({
      ...character,
      conditions: ensureCharacterCondition(character.conditions, name)
    }));
    this.requestDeathMoveOnDefeatedTransition(patch);
  }

  removeCondition(id: string, conditionId: string): void {
    const patch = this.patchCharacter(id, (character) => ({
      ...character,
      conditions: character.conditions.filter((condition) => condition.id !== conditionId)
    }));
    this.requestDeathMoveOnDefeatedTransition(patch);
  }

  chooseAvoidDeath(id: string, hopeDie = rollHopeDie()): DeathMoveRollResult | null {
    const character = this.getCharacter(id);
    if (!character) return null;
    const roll = buildAvoidDeathRoll(character, hopeDie);
    this.patchCharacter(id, (current) => {
      const scar = roll.scarGained ? createCharacterScar('Избежать смерти') : null;
      const nextScars = scar ? [...(current.scars ?? []), scar] : current.scars ?? [];
      return clampHopeToEffectiveMax({
        ...current,
        scars: nextScars
      });
    });
    return roll;
  }

  chooseRiskItAll(id: string, roll: DeathMoveRollResult = rollRiskItAll()): DeathMoveRollResult | null {
    const character = this.getCharacter(id);
    if (!character || roll.kind !== 'riskItAll') return null;
    return roll;
  }

  addScar(id: string, description = 'Шрам'): boolean {
    if (!this.getCharacter(id)) return false;
    this.patchCharacter(id, (character) => (
      clampHopeToEffectiveMax({
        ...character,
        scars: [...(character.scars ?? []), createCharacterScar(description)]
      })
    ));
    return true;
  }

  healScar(id: string, scarId: string): boolean {
    if (!this.getCharacter(id)) return false;
    this.patchCharacter(id, (character) => {
      return clampHopeToEffectiveMax({
        ...character,
        scars: (character.scars ?? []).filter((scar) => scar.id !== scarId)
      });
    });
    return true;
  }

  getCharacter(id: string | null | undefined): Character | null {
    if (!id) {
      return null;
    }
    return charactersStore.get().entities[id] ?? null;
  }

  getSelectedCharacter(): Character | null {
    return this.getCharacter(charactersStore.get().selectedId);
  }

  undoChange(id: string, changeId: string, actor: CharacterChangeActor): CharacterUndoResult | null {
    const character = this.getCharacter(id);
    if (!character) return null;
    const result = applySafeCharacterUndo(character, changeId);
    if (result.status !== 'applied' || !result.target) return result;
    this.patchCharacter(id, () => result.character, {
      actor,
      kind: 'undo',
      summary: `Отменено: ${result.target.summary}`,
      undoesChangeId: result.target.id
    });
    return { ...result, character: this.getCharacter(id) ?? result.character };
  }

  private patchCharacter(
    id: string,
    updater: (character: Character) => Character,
    context: CharacterMutationContext = {}
  ): { previous: Character; current: Character } | null {
    let patched: { previous: Character; current: Character } | null = null;
    charactersStore.update((state: CharactersState) => {
      const current = state.entities[id];
      if (!current) {
        return state;
      }
      const activeGroup = this.activeHistoryGroups.get(id);
      const effectiveContext: CharacterMutationContext = {
        ...context,
        actor: context.actor ?? activeGroup?.actor,
        historyGroupId: context.historyGroupId ?? activeGroup?.id
      };
      const changedAt = effectiveContext.changedAt ?? nowIso();
      const candidate = { ...updater(current), updatedAt: changedAt };
      const record = createCharacterChangeRecord(current, candidate, {
        ...effectiveContext,
        actor: effectiveContext.actor ?? this.mutationActorProvider(),
        changedAt
      });
      const updated = appendCharacterChangeHistory(candidate, record);
      patched = { previous: current, current: updated };
      return {
        ...state,
        entities: replaceInRecord(state.entities, updated),
        updatedAt: changedAt
      };
    });
    return patched;
  }

  private requestDeathMoveOnDefeatedTransition(patch: { previous: Character; current: Character } | null): void {
    if (!patch) return;
    const hadDefeated = hasConditionTag(patch.previous, ActorStatus.Defeated);
    const hasDefeated = hasConditionTag(patch.current, ActorStatus.Defeated);
    if (!hadDefeated && hasDefeated) {
      this.deathMoveRequestHandler?.({ id: patch.current.id, name: patch.current.name }, 'defeatedAdded');
    }
    if (hadDefeated && !hasDefeated) {
      this.deathMoveRequestHandler?.({ id: patch.current.id, name: patch.current.name }, 'defeatedRemoved');
    }
  }
}

function usageTrackerTargetExists(
  character: Character,
  targetKind: CharacterUsageTracker['targetKind'],
  targetId: string
): boolean {
  return targetKind === 'card'
    ? character.domainCards.some((card) => card.id === targetId)
    : character.sheetCards.some((card) => card.id === targetId);
}

function hasConditionTag(character: Pick<Character, 'conditions'>, tag: ActorStatus): boolean {
  return character.conditions.some((condition) => normalizeStatusTag(condition.name) === tag);
}

function recoverLongRestCharacter(character: Character, move: LongRestRecoveryMove): Character {
  const companion = move === 'clearStress' && character.companion
    ? normalizeRangerCompanion({
        ...character.companion,
        stress: {
          ...character.companion.stress,
          marked: Math.max(0, character.companion.stress.marked - character.stress.marked)
        },
        unavailableUntilLongRest: false
      })
    : character.companion ?? null;
  if (move === 'clearHp') {
    if (character.hp.marked <= 0 && companion === character.companion) return character;
    return {
      ...character,
      hp: { ...character.hp, marked: 0 },
      conditions: removeCharacterConditionByName(character.conditions, ActorStatus.Defeated),
      companion
    };
  }
  if (move === 'clearStress') {
    const conditions = removeCharacterConditionByName(character.conditions, ActorStatus.Vulnerable);
    if (character.stress.marked <= 0 && conditions.length === character.conditions.length && companion === character.companion) return character;
    return { ...character, stress: { ...character.stress, marked: 0 }, conditions, companion };
  }
  if (character.armor.markedSlots <= 0 && companion === character.companion) return character;
  return { ...character, armor: { ...character.armor, markedSlots: 0 }, companion };
}
