import { clamp, toSafeInteger } from '../core/utils/clamp';
import { nowIso } from '../core/utils/date';
import { removeFromRecord, replaceInRecord } from '../core/utils/object';
import { createAdversary, createCountdown } from '../domain/rules/factories';
import { buildCoreAdversariesFromCombatBuilder, isCombatBuilderEncounterSnapshot, type CombatBuilderEncounterSnapshot } from '../domain/combatBuilderBridge/index';
import type { Adversary, AdversaryExperience, AdversaryFeature, Countdown, EncounterState } from '../domain/rules/types';
import { gameStore, encounterStore } from '../stores/gameStores';

export interface CombatBuilderEncounterImportReport {
  imported: number;
  warnings: string[];
}

export class EncounterService {
  readonly encounterStore = encounterStore;

  updateEncounter(patch: Partial<Pick<EncounterState, 'name' | 'status' | 'battlePointBudget' | 'environmentNotes'>>): void {
    encounterStore.update((state) => ({ ...state, ...patch, updatedAt: nowIso() }));
  }

  startEncounter(): void {
    encounterStore.update((state) => ({ ...state, status: 'active', updatedAt: nowIso() }));
  }

  pauseEncounter(): void {
    encounterStore.update((state) => ({ ...state, status: 'paused', updatedAt: nowIso() }));
  }

  completeEncounter(): void {
    encounterStore.update((state) => ({ ...state, status: 'completed', updatedAt: nowIso() }));
  }

  createAdversary(input?: Partial<Adversary>): Adversary {
    const adversary = createAdversary(input);
    encounterStore.update((state) => ({
      ...state,
      adversaries: { ...state.adversaries, [adversary.id]: adversary },
      order: [...state.order, adversary.id],
      activeAdversaryId: adversary.id,
      updatedAt: nowIso()
    }));
    return adversary;
  }

  importCombatBuilderEncounter(snapshot: CombatBuilderEncounterSnapshot, replace = true): CombatBuilderEncounterImportReport {
    const result = buildCoreAdversariesFromCombatBuilder(snapshot);
    const imported = result.adversaries.length;
    if (imported === 0) {
      return { imported: 0, warnings: result.warnings };
    }

    encounterStore.update((state) => {
      const importedEntities = Object.fromEntries(result.adversaries.map((adversary) => [adversary.id, adversary]));
      const importedOrder = result.adversaries.map((adversary) => adversary.id);
      return {
        ...state,
        name: 'Бой из конструктора',
        status: 'prep',
        battlePointBudget: result.battlePointBudget,
        adversaries: replace ? importedEntities : { ...state.adversaries, ...importedEntities },
        order: replace ? importedOrder : [...state.order, ...importedOrder],
        activeAdversaryId: importedOrder[0] ?? state.activeAdversaryId,
        updatedAt: nowIso()
      };
    });

    return { imported, warnings: result.warnings };
  }

  importCombatBuilderJson(json: string, replace = true): CombatBuilderEncounterImportReport {
    try {
      const parsed = JSON.parse(json) as unknown;
      const snapshot = unwrapCombatBuilderSnapshot(parsed);
      if (!snapshot) {
        return { imported: 0, warnings: ['Файл не похож на экспорт конструктора боя.'] };
      }
      return this.importCombatBuilderEncounter(snapshot, replace);
    } catch (error) {
      return { imported: 0, warnings: [error instanceof Error ? error.message : 'Не удалось прочитать JSON боя.'] };
    }
  }

  duplicateAdversary(id: string): Adversary | null {
    const adversary = this.getAdversary(id);
    if (!adversary) {
      return null;
    }
    return this.createAdversary({
      ...adversary,
      id: undefined,
      name: `${adversary.name} (копия)`,
      createdAt: undefined,
      updatedAt: undefined
    });
  }

  deleteAdversary(id: string): void {
    encounterStore.update((state) => {
      const order = state.order.filter((item) => item !== id);
      return {
        ...state,
        adversaries: removeFromRecord(state.adversaries, id),
        order,
        activeAdversaryId: state.activeAdversaryId === id ? order[0] ?? null : state.activeAdversaryId,
        updatedAt: nowIso()
      };
    });
  }

  selectAdversary(id: string | null): void {
    encounterStore.update((state) => ({
      ...state,
      activeAdversaryId: id && state.adversaries[id] ? id : null,
      updatedAt: nowIso()
    }));
  }

  updateAdversary(id: string, patch: Partial<Adversary>): void {
    this.patchAdversary(id, (adversary) => ({ ...adversary, ...patch }));
  }

  updateAdversaryNumber(id: string, key: 'tier' | 'difficulty' | 'attackModifier', value: number): void {
    this.patchAdversary(id, (adversary) => ({ ...adversary, [key]: toSafeInteger(value, adversary[key]) }));
  }

  updateAdversaryThreshold(id: string, key: 'major' | 'severe', value: number): void {
    this.patchAdversary(id, (adversary) => ({
      ...adversary,
      thresholds: { ...adversary.thresholds, [key]: Math.max(0, toSafeInteger(value, adversary.thresholds[key])) }
    }));
  }

  updateAdversarySlots(id: string, resource: 'hp' | 'stress', patch: Partial<{ marked: number; max: number }>): void {
    this.patchAdversary(id, (adversary) => {
      const track = adversary[resource];
      const max = clamp(toSafeInteger(patch.max ?? track.max, track.max), 0, 99);
      return {
        ...adversary,
        [resource]: {
          max,
          marked: clamp(toSafeInteger(patch.marked ?? track.marked, track.marked), 0, max)
        },
        isDefeated: resource === 'hp' ? clamp(toSafeInteger(patch.marked ?? track.marked, track.marked), 0, max) >= max : adversary.isDefeated
      };
    });
  }

  markAdversarySlots(id: string, resource: 'hp' | 'stress', delta: number): void {
    this.patchAdversary(id, (adversary) => {
      const track = adversary[resource];
      const marked = clamp(track.marked + delta, 0, track.max);
      return {
        ...adversary,
        [resource]: { ...track, marked },
        isDefeated: resource === 'hp' ? marked >= track.max : adversary.isDefeated
      };
    });
  }

  addExperience(id: string, input?: Partial<AdversaryExperience>): void {
    this.patchAdversary(id, (adversary) => ({
      ...adversary,
      experiences: [
        ...adversary.experiences,
        {
          id: input?.id ?? `advexp_${Date.now()}`,
          name: input?.name ?? 'Новый опыт',
          modifier: input?.modifier ?? 2
        }
      ]
    }));
  }

  updateExperience(id: string, experienceId: string, patch: Partial<AdversaryExperience>): void {
    this.patchAdversary(id, (adversary) => ({
      ...adversary,
      experiences: adversary.experiences.map((experience) => (experience.id === experienceId ? { ...experience, ...patch } : experience))
    }));
  }

  removeExperience(id: string, experienceId: string): void {
    this.patchAdversary(id, (adversary) => ({
      ...adversary,
      experiences: adversary.experiences.filter((experience) => experience.id !== experienceId)
    }));
  }

  addFeature(id: string, input?: Partial<AdversaryFeature>): void {
    this.patchAdversary(id, (adversary) => ({
      ...adversary,
      features: [
        ...adversary.features,
        {
          id: input?.id ?? `feature_${Date.now()}`,
          name: input?.name ?? 'Feature',
          kind: input?.kind ?? 'action',
          cost: input?.cost ?? '',
          text: input?.text ?? ''
        }
      ]
    }));
  }

  updateFeature(id: string, featureId: string, patch: Partial<AdversaryFeature>): void {
    this.patchAdversary(id, (adversary) => ({
      ...adversary,
      features: adversary.features.map((feature) => (feature.id === featureId ? { ...feature, ...patch } : feature))
    }));
  }

  removeFeature(id: string, featureId: string): void {
    this.patchAdversary(id, (adversary) => ({
      ...adversary,
      features: adversary.features.filter((feature) => feature.id !== featureId)
    }));
  }

  spotlightAdversary(id: string, spendFear = false): boolean {
    if (spendFear) {
      const game = gameStore.getSnapshot();
      if (game.fear <= 0) {
        return false;
      }
      gameStore.update((state) => ({ ...state, fear: Math.max(0, state.fear - 1), spotlight: 'gm', updatedAt: nowIso() }));
    } else {
      gameStore.update((state) => ({ ...state, spotlight: 'gm', updatedAt: nowIso() }));
    }
    this.selectAdversary(id);
    return true;
  }

  addCountdown(input?: Partial<Countdown>): void {
    encounterStore.update((state) => ({
      ...state,
      countdowns: [...state.countdowns, createCountdown(input)],
      updatedAt: nowIso()
    }));
  }

  updateCountdown(id: string, patch: Partial<Countdown>): void {
    encounterStore.update((state) => ({
      ...state,
      countdowns: state.countdowns.map((countdown) => (countdown.id === id ? { ...countdown, ...patch } : countdown)),
      updatedAt: nowIso()
    }));
  }

  tickCountdown(id: string, amount = 1): void {
    encounterStore.update((state) => ({
      ...state,
      countdowns: state.countdowns.map((countdown) => {
        if (countdown.id !== id) {
          return countdown;
        }
        const delta = countdown.direction === 'up' ? amount : -amount;
        return { ...countdown, current: clamp(countdown.current + delta, 0, countdown.max) };
      }),
      updatedAt: nowIso()
    }));
  }

  removeCountdown(id: string): void {
    encounterStore.update((state) => ({
      ...state,
      countdowns: state.countdowns.filter((countdown) => countdown.id !== id),
      updatedAt: nowIso()
    }));
  }

  getAdversary(id: string | null | undefined): Adversary | null {
    if (!id) {
      return null;
    }
    return encounterStore.getSnapshot().adversaries[id] ?? null;
  }

  private patchAdversary(id: string, updater: (adversary: Adversary) => Adversary): void {
    encounterStore.update((state) => {
      const current = state.adversaries[id];
      if (!current) {
        return state;
      }
      const updated = { ...updater(current), updatedAt: nowIso() };
      return {
        ...state,
        adversaries: replaceInRecord(state.adversaries, updated),
        updatedAt: nowIso()
      };
    });
  }
}

function unwrapCombatBuilderSnapshot(value: unknown): CombatBuilderEncounterSnapshot | null {
  if (isCombatBuilderEncounterSnapshot(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (isCombatBuilderEncounterSnapshot(record.encounter)) return record.encounter;
  if (isCombatBuilderEncounterSnapshot(record.combatEncounter)) return record.combatEncounter;
  if (isCombatBuilderEncounterSnapshot(record.combatBuilder)) return record.combatBuilder;
  return null;
}
