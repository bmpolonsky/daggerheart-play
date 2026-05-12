import { clamp, toSafeInteger } from '../core/utils/clamp';
import { nowIso } from '../core/utils/date';
import { removeFromRecord, replaceInRecord } from '../core/utils/object';
import { beastformToActiveState, beastformToSheetCard, beastformToWeapon } from '../domain/content/beastforms';
import { DEFAULT_ACTION_TOKENS, DEFAULT_MAX_HOPE, CLASS_DOMAINS, CLASS_STARTING_STATS } from '../domain/rules/constants';
import {
  calculateThresholds,
  createDeathMoveState,
  ensureCharacterCondition,
  removeCharacterConditionByName,
  syncCharacterDeathMoveState
} from '../domain/rules/characterDamage';
import {
  buildAvoidDeathRoll,
  clampHopeToEffectiveMax,
  createCharacterScar,
  retirementForDeathMove,
  retirementForLastHopeScar,
  rollHopeDie,
  rollRiskItAll
} from '../domain/rules/deathMoves';
import { buildEffectiveCharacterStats } from '../domain/rules/effects';
import { buildEquipmentAttachmentPlan } from '../domain/rules/equipment';
import { createCharacter, createDomainCard, createExperience, createInventoryItem, createSheetCard, createWeapon } from '../domain/rules/factories';
import type { CharacterAdvancementChoiceId } from '../domain/rules/levelUp';
import { createDefaultRangerCompanion, normalizeRangerCompanion } from '../domain/rules/rangerCompanion';
import type { LongRestRecoveryMove } from '../domain/rules/rest';
import { starterDomainCardsFromLibrary } from '../domain/characterBuilder/index';
import type { GenericLibraryItem, LibraryBeastform, LibraryEquipmentItem } from '../domain/content/types';
import type {
  ArmorState,
  Character,
  CharacterCompanionState,
  CharacterDeathMoveState,
  CharacterInventoryItem,
  DeathMoveRollResult,
  CharacterSheetCard,
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

export interface EquipmentApplicationResult {
  characterId: string;
  itemId: string;
  itemName: string;
  kind: 'armor' | 'weapon' | 'inventory';
  warnings: string[];
}

export interface CharacterLevelUpInput {
  level: number;
  proficiency?: number;
  experiences?: Array<Partial<Experience>>;
  domainCards?: Array<Partial<DomainCardRecord>>;
  thresholdBonus?: Partial<Thresholds>;
  advancementChoices?: CharacterAdvancementChoiceId[];
  traitBonuses?: Partial<Record<TraitId, number>>;
  hpMax?: number;
  stressMax?: number;
  evasion?: number;
  notes?: string;
}

export class CharacterService {
  readonly charactersStore = charactersStore;

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

  updateClass(id: string, className: DaggerheartClass): void {
    this.patchCharacter(id, (character) => {
      const stats = CLASS_STARTING_STATS[className];
      return {
        ...character,
        className,
        domains: CLASS_DOMAINS[className],
        evasion: stats.evasion,
        hp: { ...character.hp, max: stats.hp, marked: Math.min(character.hp.marked, stats.hp) }
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

  applyLevelUp(id: string, input: CharacterLevelUpInput): boolean {
    const character = this.getCharacter(id);
    if (!character) return false;
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
      return {
        ...current,
        level,
        proficiency,
        evasion,
        traits,
        hp: { ...current.hp, max: hpMax, marked: Math.min(current.hp.marked, hpMax) },
        stress: { ...current.stress, max: stressMax, marked: Math.min(current.stress.marked, stressMax) },
        thresholds: {
          major: clamp(toSafeInteger(thresholdBonus.major ?? current.thresholds.major + Math.max(0, level - current.level), current.thresholds.major), 0, 999),
          severe: clamp(toSafeInteger(thresholdBonus.severe ?? current.thresholds.severe + Math.max(0, level - current.level), current.thresholds.severe), 0, 999)
        },
        experiences: [
          ...current.experiences,
          ...(input.experiences ?? []).map((experience) => ({ ...createExperience(), ...experience }))
        ],
        domainCards: [
          ...current.domainCards,
          ...(input.domainCards ?? []).map((card) => createDomainCard(card))
        ],
        notes: input.notes ? [current.notes, input.notes].filter(Boolean).join('\n') : current.notes
      };
    });
    return true;
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
      const armor = {
        ...character.armor,
        ...armorPatch,
        markedSlots: clamp(
          toSafeInteger(armorPatch.markedSlots ?? character.armor.markedSlots),
          0,
          score
        ),
        score,
        baseMajor: clamp(toSafeInteger(armorPatch.baseMajor ?? character.armor.baseMajor), 0, 999),
        baseSevere: clamp(toSafeInteger(armorPatch.baseSevere ?? character.armor.baseSevere), 0, 999)
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
    }));
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
    }));
  }

  updateResourceMax(id: string, resource: 'hp' | 'stress' | 'hope', max: number): void {
    const safeMax = clamp(toSafeInteger(max, 1), 0, resource === 'hope' ? DEFAULT_MAX_HOPE : 12);
    this.patchCharacter(id, (character) => {
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
      return {
        ...character,
        [resource]: {
          marked: Math.min(character[resource].marked, safeMax),
          max: safeMax
        }
      };
    });
  }

  markSlots(id: string, resource: 'hp' | 'stress', delta: number): void {
    this.patchCharacter(id, (character) => {
      const track = character[resource];
      const effective = buildEffectiveCharacterStats(character);
      const effectiveMax = effective[resource].max;
      const marked = clamp(track.marked + delta, 0, effectiveMax);
      const nextConditions = resource === 'stress'
        ? (effectiveMax > 0 && marked >= effectiveMax ? ensureCharacterCondition(character.conditions, 'Уязвим') : removeCharacterConditionByName(character.conditions, 'Уязвим'))
        : (delta < 0 && character.hp.marked > marked
          ? removeCharacterConditionByName(character.conditions, 'Пал')
          : character.conditions);
      const updated = {
        ...character,
        [resource]: { ...track, marked },
        activeBeastform: resource === 'hp' && marked >= effectiveMax ? null : character.activeBeastform ?? null,
        conditions: nextConditions
      };
      return resource === 'hp' ? syncCharacterDeathMoveState(updated) : updated;
    });
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
    charactersStore.update((state) => ({
      ...state,
      entities: Object.fromEntries(
        Object.entries(state.entities).map(([id, character]) => [id, { ...character, actionTokens: tokens, updatedAt: nowIso() }])
      ),
      updatedAt: nowIso()
    }));
  }

  applyLongRestGroupRecovery(move: LongRestRecoveryMove): number {
    let changedCount = 0;
    const updatedAt = nowIso();
    charactersStore.update((state) => {
      changedCount = 0;
      const entities = Object.fromEntries(
        Object.entries(state.entities).map(([id, character]) => {
          const recovered = recoverLongRestCharacter(character, move);
          if (recovered === character) {
            return [id, character];
          }
          changedCount += 1;
          return [id, { ...recovered, updatedAt }];
        })
      );
      if (changedCount === 0) {
        return state;
      }
      return { ...state, entities, updatedAt };
    });
    return changedCount;
  }

  spendActionToken(id: string): void {
    this.patchCharacter(id, (character) => ({ ...character, actionTokens: Math.max(0, character.actionTokens - 1) }));
  }

  setActionTokens(id: string, value: number): void {
    this.patchCharacter(id, (character) => ({ ...character, actionTokens: clamp(toSafeInteger(value, 0), 0, 12) }));
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
      domainCards: [...character.domainCards, createDomainCard(input)]
    }));
  }

  ensureStarterDomainCardsFromLibrary(id: string, libraryCards: GenericLibraryItem[], count = 2): boolean {
    const character = this.getCharacter(id);
    if (!character || character.domainCards.length > 0 || libraryCards.length === 0) return false;

    const cards = starterDomainCardsFromLibrary(libraryCards, character.domains, count);
    if (cards.length === 0) return false;

    this.patchCharacter(id, (current) => ({
      ...current,
      domainCards: cards
    }));
    return true;
  }

  updateDomainCard(id: string, cardId: string, patch: Partial<DomainCardRecord>): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      domainCards: character.domainCards.map((card) => (card.id === cardId ? { ...card, ...patch } : card))
    }));
  }

  removeDomainCard(id: string, cardId: string): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      domainCards: character.domainCards.filter((card) => card.id !== cardId)
    }));
  }

  updateDomainCardTokens(id: string, cardId: string, value: number): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      domainCards: character.domainCards.map((card) => (
        card.id === cardId ? { ...card, tokens: { ...card.tokens, value: clamp(value, 0, card.tokens?.max ?? 0) } } : card
      ))
    }));
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
      sheetCards: (character.sheetCards ?? []).filter((card) => card.id !== cardId)
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

  addCondition(id: string, name = 'Condition'): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      conditions: ensureCharacterCondition(character.conditions, name)
    }));
  }

  removeCondition(id: string, conditionId: string): void {
    this.patchCharacter(id, (character) => ({
      ...character,
      conditions: character.conditions.filter((condition) => condition.id !== conditionId)
    }));
  }

  chooseDeathMove(id: string, status: Exclude<CharacterDeathMoveState['status'], 'pending'>, notes = ''): boolean {
    if (!this.getCharacter(id)) return false;
    this.patchCharacter(id, (character) => ({
      ...character,
      deathMove: createDeathMoveState(status, notes),
      conditions: removeCharacterConditionByName(character.conditions, 'Ход смерти')
    }));
    return true;
  }

  chooseBlazeOfGlory(id: string, notes = ''): boolean {
    return this.chooseDeathMove(id, 'blazeOfGlory', notes);
  }

  chooseAvoidDeath(id: string, hopeDie = rollHopeDie(), notes = ''): DeathMoveRollResult | null {
    const character = this.getCharacter(id);
    if (!character) return null;
    const roll = buildAvoidDeathRoll(character, hopeDie);
    this.patchCharacter(id, (current) => {
      const scar = roll.scarGained ? createCharacterScar('Избежать смерти') : null;
      const nextScars = scar ? [...(current.scars ?? []), scar] : current.scars ?? [];
      const withScar = clampHopeToEffectiveMax({
        ...current,
        scars: nextScars,
        deathMove: {
          status: 'avoidDeath',
          notes,
          roll,
          updatedAt: nowIso()
        },
        conditions: removeCharacterConditionByName(current.conditions, 'Ход смерти')
      });
      return {
        ...withScar,
        retirement: withScar.retirement ?? (roll.scarGained && buildEffectiveCharacterStats(withScar).hope.max <= 0
          ? retirementForLastHopeScar('Избежать смерти добавило шрам в последний слот Надежды.')
          : current.retirement ?? null)
      };
    });
    return roll;
  }

  chooseRiskItAll(id: string, roll: DeathMoveRollResult = rollRiskItAll(), notes = ''): DeathMoveRollResult | null {
    const character = this.getCharacter(id);
    if (!character || roll.kind !== 'riskItAll') return null;
    this.patchCharacter(id, (current) => {
      const base = {
        ...current,
        deathMove: {
          status: roll.outcome === 'fear' ? 'dead' as const : 'riskItAll' as const,
          notes,
          roll,
          updatedAt: nowIso()
        },
        conditions: removeCharacterConditionByName(current.conditions, 'Ход смерти')
      };
      if (roll.outcome === 'critical') {
        return {
          ...base,
          hp: { ...base.hp, marked: 0 },
          stress: { ...base.stress, marked: 0 },
          conditions: removeCharacterConditionByName(removeCharacterConditionByName(base.conditions, 'Пал'), 'Уязвим')
        };
      }
      if (roll.outcome === 'fear') {
        return {
          ...base,
          retirement: base.retirement ?? retirementForDeathMove()
        };
      }
      return base;
    });
    return roll;
  }

  resolveRiskItAllAllocation(id: string, hpCleared: number, stressCleared: number): boolean {
    const character = this.getCharacter(id);
    const roll = character?.deathMove?.roll;
    if (!character || character.deathMove?.status !== 'riskItAll' || roll?.kind !== 'riskItAll' || roll.outcome !== 'hope') {
      return false;
    }
    const budget = Math.max(0, roll.hopeDie);
    const safeHpCleared = clamp(toSafeInteger(hpCleared, 0), 0, budget);
    const safeStressCleared = clamp(toSafeInteger(stressCleared, 0), 0, budget - safeHpCleared);
    this.patchCharacter(id, (current) => {
      const hpMarked = clamp(current.hp.marked - safeHpCleared, 0, current.hp.max);
      const stressMarked = clamp(current.stress.marked - safeStressCleared, 0, current.stress.max);
      const effective = buildEffectiveCharacterStats({ ...current, hp: { ...current.hp, marked: hpMarked }, stress: { ...current.stress, marked: stressMarked } });
      let conditions = current.conditions;
      if (hpMarked < effective.hp.max) {
        conditions = removeCharacterConditionByName(conditions, 'Пал');
      }
      if (stressMarked < effective.stress.max) {
        conditions = removeCharacterConditionByName(conditions, 'Уязвим');
      }
      return {
        ...current,
        hp: { ...current.hp, marked: hpMarked },
        stress: { ...current.stress, marked: stressMarked },
        deathMove: current.deathMove ? {
          ...current.deathMove,
          roll: {
            ...roll,
            hpCleared: safeHpCleared,
            stressCleared: safeStressCleared
          },
          updatedAt: nowIso()
        } : current.deathMove,
        conditions
      };
    });
    return true;
  }

  addScar(id: string, description = 'Шрам'): boolean {
    if (!this.getCharacter(id)) return false;
    this.patchCharacter(id, (character) => {
      const withScar = clampHopeToEffectiveMax({
        ...character,
        scars: [...(character.scars ?? []), createCharacterScar(description)]
      });
      return {
        ...withScar,
        retirement: withScar.retirement ?? (buildEffectiveCharacterStats(withScar).hope.max <= 0
          ? retirementForLastHopeScar()
          : character.retirement ?? null)
      };
    });
    return true;
  }

  healScar(id: string, scarId: string): boolean {
    if (!this.getCharacter(id)) return false;
    this.patchCharacter(id, (character) => {
      const next = {
        ...character,
        scars: (character.scars ?? []).filter((scar) => scar.id !== scarId)
      };
      return {
        ...next,
        retirement: next.retirement?.reason === 'lastHopeScar' && buildEffectiveCharacterStats(next).hope.max > 0
          ? null
          : next.retirement ?? null
      };
    });
    return true;
  }

  getCharacter(id: string | null | undefined): Character | null {
    if (!id) {
      return null;
    }
    return charactersStore.getSnapshot().entities[id] ?? null;
  }

  getSelectedCharacter(): Character | null {
    return this.getCharacter(charactersStore.getSnapshot().selectedId);
  }

  private patchCharacter(id: string, updater: (character: Character) => Character): void {
    charactersStore.update((state: CharactersState) => {
      const current = state.entities[id];
      if (!current) {
        return state;
      }
      const updated = { ...updater(current), updatedAt: nowIso() };
      return {
        ...state,
        entities: replaceInRecord(state.entities, updated),
        updatedAt: nowIso()
      };
    });
  }
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
      conditions: removeCharacterConditionByName(character.conditions, 'Пал'),
      companion
    };
  }
  if (move === 'clearStress') {
    const conditions = removeCharacterConditionByName(character.conditions, 'Уязвим');
    if (character.stress.marked <= 0 && conditions.length === character.conditions.length && companion === character.companion) return character;
    return { ...character, stress: { ...character.stress, marked: 0 }, conditions, companion };
  }
  if (character.armor.markedSlots <= 0 && companion === character.companion) return character;
  return { ...character, armor: { ...character.armor, markedSlots: 0 }, companion };
}
