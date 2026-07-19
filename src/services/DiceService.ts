import { clamp, toSafeInteger } from '../core/utils/clamp';
import { nowIso } from '../core/utils/date';
import { createId } from '../core/utils/id';
import { describeFormulaRoll, parseDiceFormula, rollDie, rollFormula } from '../domain/rules/diceFormula';
import { buildEffectiveCharacterStats } from '../domain/rules/effects';
import { removeCharacterConditionByName } from '../domain/rules/characterDamage';
import { TRAIT_LABELS } from '../domain/rules/constants';
import { resolveActionOutcome } from '../domain/rules/rollOutcomes';
import { ActorStatus } from '../domain/rules/statuses';
import type {
  ActionRollEntry,
  Character,
  DamageRollEntry,
  DamageType,
  DiceVisualTone,
  ManualDiceRollEntry,
  ModifierPart,
  ReactionRollEntry,
  RollPublication,
  RollLogEntry,
  TraitId
} from '../domain/rules/types';
import type { TableVisibility } from '../domain/tabletop/types';
import { legacyVisibilityForPublication, normalizeRollPublication } from '../domain/tabletop/rollPublication';
import { gameStore, charactersStore, encounterStore, rollLogStore } from '../stores/gameStores';
import { FeedService } from './FeedService';

export interface ActionRollRequest {
  actorId?: string | null;
  actorName?: string;
  trait?: TraitId | null;
  difficulty: number;
  manualModifier?: number;
  advantageCount?: number;
  disadvantageCount?: number;
  experienceIds?: string[];
  spendHopeForExperiences?: boolean;
  applyConsequences?: boolean;
  publication?: RollPublication;
  notes?: string;
}

export type ReactionRollRequest = Omit<ActionRollRequest, 'applyConsequences'>;

export interface DamageRollRequest {
  actorId?: string | null;
  actorName?: string;
  formula: string;
  critical?: boolean;
  damageType?: DamageType;
  publication?: RollPublication;
  notes?: string;
}

export interface GmAttackCheckRequest {
  adversaryId: string;
  experienceIds?: string[];
  spendFearForExperiences?: boolean;
  advantageCount?: number;
  disadvantageCount?: number;
  publication?: RollPublication;
  notes?: string;
}

export interface ManualDiceRollRequest {
  actorId?: string | null;
  actorName?: string;
  formula: string;
  label?: string;
  advantageCount?: number;
  disadvantageCount?: number;
  diceTones?: DiceVisualTone[];
  visibility?: TableVisibility;
  publication?: RollPublication;
  notes?: string;
}

type ManualDiceRollResult = ReturnType<typeof rollFormula> & { diceTones?: DiceVisualTone[] };

export class DiceService {
  readonly rollLog$ = rollLogStore.toStream();
  private feedService = new FeedService();

  rollAction(request: ActionRollRequest): ActionRollEntry {
    const charactersState = charactersStore.get();
    const actor = request.actorId ? charactersState.entities[request.actorId] : null;
    const difficulty = Math.max(0, toSafeInteger(request.difficulty, 12));
    const hopeDie = rollDie(12);
    const fearDie = rollDie(12);
    const modifiers: ModifierPart[] = [];
    const warnings: string[] = [];

    const actorStats = actor ? buildEffectiveCharacterStats(actor) : null;
    if (actorStats && request.trait) {
      modifiers.push({ label: TRAIT_LABELS[request.trait], value: actorStats.traits[request.trait] ?? 0 });
    }

    const selectedExperiences = actor
      ? actor.experiences.filter((experience) => request.experienceIds?.includes(experience.id))
      : [];

    if (selectedExperiences.length > 0) {
      if (request.spendHopeForExperiences !== false) {
        const totalCost = selectedExperiences.length;
        if (actor && actor.hope.value >= totalCost) {
          this.patchActor(actor.id, (character) => ({
            ...character,
            hope: { ...character.hope, value: character.hope.value - totalCost }
          }));
        } else {
          warnings.push('Недостаточно Надежды для применения всех выбранных Опытов. Модификаторы оставлены как ручная подсказка, Надежда не списана.');
        }
      }
      for (const experience of selectedExperiences) {
        modifiers.push({ label: request.spendHopeForExperiences === false ? `Опыт без списания: ${experience.name}` : `Опыт: ${experience.name}`, value: experience.modifier });
      }
    }

    const manualModifier = toSafeInteger(request.manualModifier, 0);
    if (manualModifier !== 0) {
      modifiers.push({ label: 'Вручную', value: manualModifier });
    }

    const advantageCount = clamp(toSafeInteger(request.advantageCount, 0), 0, 20);
    const disadvantageCount = clamp(toSafeInteger(request.disadvantageCount, 0), 0, 20);
    const advantageRolls: number[] = [];
    const disadvantageRolls: number[] = [];
    const effectiveExtraDice = advantageCount - disadvantageCount;
    let keptExtraDie = 0;

    if (effectiveExtraDice > 0) {
      for (let index = 0; index < effectiveExtraDice; index += 1) {
        advantageRolls.push(rollDie(6));
      }
      keptExtraDie = Math.max(...advantageRolls);
      modifiers.push({ label: 'Преимущество', value: keptExtraDie });
    }

    if (effectiveExtraDice < 0) {
      for (let index = 0; index < Math.abs(effectiveExtraDice); index += 1) {
        disadvantageRolls.push(rollDie(6));
      }
      keptExtraDie = -Math.max(...disadvantageRolls);
      modifiers.push({ label: 'Помеха', value: keptExtraDie });
    }

    const modifierTotal = modifiers.reduce((sum, item) => sum + item.value, 0);
    const total = hopeDie + fearDie + modifierTotal;
    const outcome = resolveActionOutcome({ hopeDie, fearDie, total, difficulty });

    const shouldApplyConsequences = request.applyConsequences === true;
    if (shouldApplyConsequences) {
      this.applyActionConsequences(request.actorId ?? null, outcome.tone, outcome.isCritical, outcome.success);
    }

    const entry: ActionRollEntry = {
      id: createId('roll'),
      type: 'action',
      createdAt: nowIso(),
      actorId: actor?.id,
      actorName: actor?.name ?? request.actorName ?? 'Неизвестный актёр',
      trait: request.trait ?? undefined,
      difficulty,
      hopeDie,
      fearDie,
      advantageRolls,
      disadvantageRolls,
      keptExtraDie,
      modifiers,
      total,
      success: outcome.success,
      isCritical: outcome.isCritical,
      outcome: outcome.outcome,
      consequenceApplied: shouldApplyConsequences,
      publication: normalizeRollPublication(request.publication),
      notes: request.notes,
      warnings
    };

    this.appendLog(entry);
    return entry;
  }

  rollReaction(request: ReactionRollRequest): ReactionRollEntry {
    const charactersState = charactersStore.get();
    const actor = request.actorId ? charactersState.entities[request.actorId] : null;
    const difficulty = Math.max(0, toSafeInteger(request.difficulty, 12));
    const hopeDie = rollDie(12);
    const fearDie = rollDie(12);
    const modifiers: ModifierPart[] = [];
    const warnings: string[] = [];

    const actorStats = actor ? buildEffectiveCharacterStats(actor) : null;
    if (actorStats && request.trait) {
      modifiers.push({ label: TRAIT_LABELS[request.trait], value: actorStats.traits[request.trait] ?? 0 });
    }

    const selectedExperiences = actor
      ? actor.experiences.filter((experience) => request.experienceIds?.includes(experience.id))
      : [];

    if (selectedExperiences.length > 0) {
      if (request.spendHopeForExperiences !== false) {
        const totalCost = selectedExperiences.length;
        if (actor && actor.hope.value >= totalCost) {
          this.patchActor(actor.id, (character) => ({
            ...character,
            hope: { ...character.hope, value: character.hope.value - totalCost }
          }));
        } else {
          warnings.push('Недостаточно Надежды для применения всех выбранных Опытов. Модификаторы оставлены как ручная подсказка, Надежда не списана.');
        }
      }
      for (const experience of selectedExperiences) {
        modifiers.push({ label: request.spendHopeForExperiences === false ? `Опыт без списания: ${experience.name}` : `Опыт: ${experience.name}`, value: experience.modifier });
      }
    }

    const manualModifier = toSafeInteger(request.manualModifier, 0);
    if (manualModifier !== 0) {
      modifiers.push({ label: 'Вручную', value: manualModifier });
    }

    const advantageCount = clamp(toSafeInteger(request.advantageCount, 0), 0, 20);
    const disadvantageCount = clamp(toSafeInteger(request.disadvantageCount, 0), 0, 20);
    const advantageRolls: number[] = [];
    const disadvantageRolls: number[] = [];
    const effectiveExtraDice = advantageCount - disadvantageCount;
    let keptExtraDie = 0;

    if (effectiveExtraDice > 0) {
      for (let index = 0; index < effectiveExtraDice; index += 1) {
        advantageRolls.push(rollDie(6));
      }
      keptExtraDie = Math.max(...advantageRolls);
      modifiers.push({ label: 'Преимущество', value: keptExtraDie });
    }

    if (effectiveExtraDice < 0) {
      for (let index = 0; index < Math.abs(effectiveExtraDice); index += 1) {
        disadvantageRolls.push(rollDie(6));
      }
      keptExtraDie = -Math.max(...disadvantageRolls);
      modifiers.push({ label: 'Помеха', value: keptExtraDie });
    }

    const modifierTotal = modifiers.reduce((sum, item) => sum + item.value, 0);
    const total = hopeDie + fearDie + modifierTotal;
    const outcome = resolveActionOutcome({ hopeDie, fearDie, total, difficulty });

    const entry: ReactionRollEntry = {
      id: createId('reaction'),
      type: 'reaction',
      createdAt: nowIso(),
      actorId: actor?.id,
      actorName: actor?.name ?? request.actorName ?? 'Неизвестный актёр',
      trait: request.trait ?? undefined,
      difficulty,
      hopeDie,
      fearDie,
      advantageRolls,
      disadvantageRolls,
      keptExtraDie,
      modifiers,
      total,
      success: outcome.success,
      isCritical: outcome.isCritical,
      outcome: outcome.outcome,
      consequenceApplied: false,
      publication: normalizeRollPublication(request.publication),
      notes: request.notes,
      warnings
    };

    this.appendLog(entry);
    return entry;
  }

  rollDamage(request: DamageRollRequest): DamageRollEntry {
    const actor = request.actorId ? charactersStore.get().entities[request.actorId] : null;
    const damageType = request.damageType ?? 'physical';
    const rolled = rollFormula(request.formula, { critical: request.critical });
    const entry: DamageRollEntry = {
      id: createId('damage'),
      type: 'damage',
      createdAt: nowIso(),
      actorId: actor?.id ?? request.actorId ?? undefined,
      actorName: actor?.name ?? request.actorName ?? 'Урон',
      formula: request.formula,
      terms: rolled.terms,
      critical: Boolean(request.critical),
      criticalBonus: rolled.criticalBonus,
      total: rolled.total,
      damageType,
      publication: normalizeRollPublication(request.publication),
      notes: request.notes
    };

    this.appendLog(entry);
    return entry;
  }

  rollManualDice(request: ManualDiceRollRequest): ManualDiceRollEntry {
    this.assertManualDiceFormula(request.formula);
    const actor = request.actorId ? charactersStore.get().entities[request.actorId] : null;
    const rolled = this.rollManualDiceFormula(request);
    const label = request.label?.trim() || undefined;
    const actorName = actor?.name ?? request.actorName?.trim() ?? 'Бросок';
    const title = label ?? actorName;
    const detail = describeFormulaRoll(rolled.terms);
    const notes = request.notes?.trim() || undefined;
    const publication = normalizeRollPublication(request.publication, request.visibility);
    const entry: ManualDiceRollEntry = {
      id: createId('manualroll'),
      type: 'manual',
      createdAt: nowIso(),
      title,
      text: notes ? `${detail} — ${notes}` : detail,
      actorId: actor?.id ?? request.actorId ?? undefined,
      actorName,
      formula: request.formula,
      label,
      terms: rolled.terms,
      diceTones: rolled.diceTones,
      total: rolled.total,
      visibility: legacyVisibilityForPublication(publication),
      publication,
      notes
    };

    this.appendLog(entry);
    return entry;
  }

  private rollManualDiceFormula(request: ManualDiceRollRequest): ManualDiceRollResult {
    const advantageCount = clamp(toSafeInteger(request.advantageCount, 0), 0, 20);
    const disadvantageCount = clamp(toSafeInteger(request.disadvantageCount, 0), 0, 20);
    const effectiveExtraDice = advantageCount - disadvantageCount;
    const parsed = parseDiceFormula(request.formula);
    const d20Terms = parsed.filter((term) => term.kind === 'dice' && term.sign > 0 && term.count === 1 && term.sides === 20);
    const nonFlatTerms = parsed.filter((term) => term.kind === 'dice' && !(term.sign > 0 && term.count === 1 && term.sides === 20));
    if (d20Terms.length !== 1 || nonFlatTerms.length > 0 || effectiveExtraDice === 0) {
      const base = rollFormula(request.formula);
      const diceTones = normalizeDiceTones(request.diceTones, countRolledDice(base.terms));
      if (effectiveExtraDice === 0) return { ...base, diceTones };
      const bonusCount = Math.abs(effectiveExtraDice);
      const bonusRolls = Array.from({ length: bonusCount }, () => rollDie(6));
      const bonusValue = Math.max(...bonusRolls);
      const bonusTerm = {
        sign: effectiveExtraDice > 0 ? 1 as const : -1 as const,
        count: bonusCount,
        sides: 6,
        rolls: bonusRolls,
        subtotal: effectiveExtraDice > 0 ? bonusValue : -bonusValue
      };
      const terms = [...base.terms, bonusTerm];
      return {
        ...base,
        terms,
        diceTones: [
          ...diceTones,
          ...Array.from({ length: bonusCount }, () => effectiveExtraDice > 0 ? 'advantage' as const : 'disadvantage' as const)
        ],
        total: base.total + bonusTerm.subtotal
      };
    }

    const d20Result = this.rollD20Advantage(rollDie(20), advantageCount, disadvantageCount);
    const flatTerms = parsed
      .filter((term) => term.kind === 'flat')
      .map((term) => ({
        sign: term.sign,
        value: term.value,
        subtotal: term.sign * term.value
      }));
    const d20Term = {
      sign: 1 as const,
      count: d20Result.rolls.length,
      sides: 20,
      rolls: d20Result.rolls,
      subtotal: d20Result.kept
    };
    const terms = [d20Term, ...flatTerms];
    return {
      formula: request.formula,
      terms,
      diceTones: normalizeDiceTones(request.diceTones, countRolledDice(terms)),
      total: terms.reduce((sum, term) => sum + term.subtotal, 0),
      criticalBonus: 0
    };
  }

  rollGmAttackCheck(request: GmAttackCheckRequest): ManualDiceRollEntry | null {
    const encounter = encounterStore.get();
    const adversary = encounter.adversaries[request.adversaryId];
    if (!adversary) return null;

    const modifiers: ModifierPart[] = [{ label: 'Атака', value: adversary.attackModifier }];
    const selectedExperienceIds = new Set(request.experienceIds ?? []);
    const selectedExperiences = adversary.experiences.filter((experience) => selectedExperienceIds.has(experience.id));
    if (selectedExperiences.length > 0) {
      if (request.spendFearForExperiences !== false) {
        const game = gameStore.get();
        if (game.fear >= selectedExperiences.length) {
          gameStore.update((state) => ({ ...state, fear: Math.max(0, state.fear - selectedExperiences.length), updatedAt: nowIso() }));
          selectedExperiences.forEach((experience) => modifiers.push({ label: `Опыт: ${experience.name}`, value: experience.modifier }));
        } else {
          selectedExperiences.forEach((experience) => modifiers.push({ label: `Опыт пропущен: ${experience.name}`, value: 0 }));
        }
      } else {
        selectedExperiences.forEach((experience) => modifiers.push({ label: `Опыт без списания: ${experience.name}`, value: experience.modifier }));
      }
    }

    const d20Result = this.rollD20Advantage(rollDie(20), request.advantageCount ?? 0, request.disadvantageCount ?? 0);
    if (d20Result.label) {
      modifiers.push({ label: d20Result.label, value: 0 });
    }
    const modifierTotal = modifiers.reduce((sum, modifier) => sum + modifier.value, 0);
    const total = d20Result.kept + modifierTotal;
    const formula = `1d20${modifierTotal === 0 ? '' : modifierTotal > 0 ? `+${modifierTotal}` : modifierTotal}`;
    const modifierText = modifiers
      .filter((modifier) => modifier.value !== 0 || modifier.label.startsWith('Опыт пропущен') || modifier.label.startsWith('Преимущество') || modifier.label.startsWith('Помеха'))
      .map((modifier) => `${modifier.label}${modifier.value === 0 ? '' : ` ${modifier.value > 0 ? '+' : ''}${modifier.value}`}`)
      .join(' / ');
    const rollText = d20Result.rolls.length > 1 ? `d20[${d20Result.rolls.join(',')}] -> ${d20Result.kept}` : `d20[${d20Result.kept}]`;
    const notes = [adversary.standardAttack.name, modifierText, request.notes?.trim()].filter(Boolean).join(' / ');
    const publication = normalizeRollPublication(request.publication);
    const entry: ManualDiceRollEntry = {
      id: createId('gmattack'),
      type: 'manual',
      createdAt: nowIso(),
      title: adversary.name,
      text: `${rollText}${notes ? ` — ${notes}` : ''}`,
      actorId: adversary.id,
      actorName: adversary.name,
      formula,
      label: 'Атака',
      terms: [
        { sign: 1, count: d20Result.rolls.length, sides: 20, rolls: d20Result.rolls, subtotal: d20Result.kept },
        ...(modifierTotal === 0 ? [] : [{ sign: modifierTotal > 0 ? 1 : -1, value: Math.abs(modifierTotal), subtotal: modifierTotal } as const])
      ],
      total,
      visibility: legacyVisibilityForPublication(publication),
      publication,
      notes
    };

    this.appendLog(entry);
    return entry;
  }

  private rollD20Advantage(baseRoll: number, advantageCount: number, disadvantageCount: number): { label: string; kept: number; rolls: number[] } {
    const effective = clamp(toSafeInteger(advantageCount, 0), 0, 20) - clamp(toSafeInteger(disadvantageCount, 0), 0, 20);
    if (effective === 0) {
      return { label: '', kept: baseRoll, rolls: [baseRoll] };
    }
    const rolls = [baseRoll, ...Array.from({ length: Math.abs(effective) }, () => rollDie(20))];
    const kept = effective > 0 ? Math.max(...rolls) : Math.min(...rolls);
    return effective > 0
      ? { label: `Преимущество d20 [${rolls.join(',')}] -> ${kept}`, kept, rolls }
      : { label: `Помеха d20 [${rolls.join(',')}] -> ${kept}`, kept, rolls };
  }

  private applyActionConsequences(actorId: string | null, tone: 'hope' | 'fear' | 'critical', isCritical: boolean, success: boolean): void {
    if (tone === 'fear') {
      gameStore.update((state) => ({ ...state, fear: clamp(state.fear + 1, 0, state.maxFear), updatedAt: nowIso() }));
    }

    if (tone === 'hope' || tone === 'critical') {
      if (actorId) {
        this.patchActor(actorId, (character) => {
          const stress = isCritical ? { ...character.stress, marked: Math.max(0, character.stress.marked - 1) } : character.stress;
          const effective = buildEffectiveCharacterStats(character);
          return {
            ...character,
            hope: { ...character.hope, value: clamp(character.hope.value + 1, 0, effective.hope.max) },
            stress,
            conditions: isCritical && stress.marked < effective.stress.max
              ? removeCharacterConditionByName(character.conditions, ActorStatus.Vulnerable)
              : character.conditions
          };
        });
      }
    }

    if (!success) {
      gameStore.update((state) => ({ ...state, spotlight: 'gm', updatedAt: nowIso() }));
    }
  }

  private patchActor(actorId: string, updater: (character: Character) => Character): void {
    charactersStore.update((state) => {
      const actor = state.entities[actorId];
      if (!actor) {
        return state;
      }
      const updated = { ...updater(actor), updatedAt: nowIso() };
      return {
        ...state,
        entities: { ...state.entities, [actorId]: updated },
        updatedAt: nowIso()
      };
    });
  }

  private assertManualDiceFormula(formula: string): void {
    const allowedSides = new Set([4, 6, 8, 10, 12, 20]);
    const parsed = parseDiceFormula(formula);
    const diceTerms = parsed.filter((term) => term.kind === 'dice');
    if (diceTerms.length === 0) {
      throw new Error('Для ручного броска нужна хотя бы одна кость.');
    }
    const unsupported = diceTerms.find((term) => !allowedSides.has(term.sides));
    if (unsupported) {
      throw new Error(`Unsupported manual die: d${unsupported.sides}. Use d4, d6, d8, d10, d12, or d20.`);
    }
  }

  private appendLog(entry: RollLogEntry): void {
    rollLogStore.update((log) => [entry, ...log].slice(0, 200));
    this.feedService.addRoll(entry);
  }
}

function countRolledDice(terms: ReturnType<typeof rollFormula>['terms']): number {
  return terms.reduce((sum, term) => sum + ('rolls' in term ? term.rolls.length : 0), 0);
}

function normalizeDiceTones(tones: DiceVisualTone[] | undefined, diceCount: number): DiceVisualTone[] {
  return Array.from({ length: diceCount }, (_, index) => tones?.[index] ?? 'neutral');
}
