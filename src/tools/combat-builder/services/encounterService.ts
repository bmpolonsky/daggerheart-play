import type { Adversary, EncounterEntry } from "@combat/lib/api";
import { buildEncounterSummary, type DifficultyMode } from "@combat/lib/mechanics";
import { clamp } from "@combat/lib/utils";
import {
  encounterStore,
  type EncounterBattleEntry,
  type EncounterUnitState,
} from "@combat/stores/encounter";
import {
  buildCombatBuilderEncounterFromCoreEncounter,
  buildCoreAdversariesFromCombatBuilder,
  type CombatBuilderEncounterEntry,
  type CombatBuilderEncounterSnapshot,
} from "../../../domain/combatBuilderBridge";
import type { EncounterDifficultyMode } from "../../../domain/rules/types";
import { nowIso } from "../../../core/utils/date";
import { encounterStore as coreEncounterStore } from "../../../stores/gameStores";

type BuilderEncounterSettings = {
  playerCount: number;
  difficultyMode: DifficultyMode;
  isDamageBoosted: boolean;
  isLowerTierUsed: boolean;
};

function createInstanceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createUnitState(hp = 0, stress = 0): EncounterUnitState {
  return {
    id: createInstanceId(),
    currentHp: hp,
    currentStress: stress,
  };
}

type HydratableEntry = EncounterEntry | EncounterBattleEntry | CombatBuilderEncounterEntry;

function hydrateEntry(entry: HydratableEntry): EncounterBattleEntry {
  const adversary = toLocalAdversary(entry.adversary);
  const legacyHp =
    typeof (entry as EncounterBattleEntry & { currentHp?: number }).currentHp === "number"
      ? clamp(
          (entry as EncounterBattleEntry & { currentHp?: number }).currentHp ?? 0,
          0,
          Math.max(0, adversary.hp)
        )
      : 0;
  const legacyStress =
    typeof (entry as EncounterBattleEntry & { currentStress?: number }).currentStress === "number"
      ? clamp(
          (entry as EncounterBattleEntry & { currentStress?: number }).currentStress ?? 0,
          0,
          Math.max(0, adversary.stress)
        )
      : 0;
  const rawInstances = Array.isArray((entry as EncounterBattleEntry).instances)
    ? (entry as EncounterBattleEntry).instances
    : [];
  const targetCount = Math.max(0, entry.count);
  const baseInstances =
    rawInstances.length > 0
      ? rawInstances.map((instance) => ({
          id: instance.id || createInstanceId(),
          currentHp: clamp(instance.currentHp, 0, Math.max(0, adversary.hp)),
          currentStress: clamp(instance.currentStress, 0, Math.max(0, adversary.stress)),
        }))
      : Array.from({ length: targetCount }, () => createUnitState(legacyHp, legacyStress));
  const instances =
    baseInstances.length >= targetCount
      ? baseInstances.slice(0, targetCount)
      : [
          ...baseInstances,
          ...Array.from({ length: targetCount - baseInstances.length }, () => createUnitState()),
        ];

  return {
    ...entry,
    adversary,
    count: instances.length,
    instances,
  };
}

function normalizeEntries(entries: HydratableEntry[]) {
  return entries
    .map(hydrateEntry)
    .filter((entry) => entry.count > 0)
    .sort((left, right) => {
      if (left.adversary.tier !== right.adversary.tier) {
        return left.adversary.tier - right.adversary.tier;
      }
      return left.adversary.name.localeCompare(right.adversary.name, "ru");
    });
}

function toLocalAdversary(adversary: HydratableEntry["adversary"]): Adversary {
  return {
    ...adversary,
    slug: adversary.slug ?? String(adversary.id),
    roleId: adversary.roleId ?? "standard",
    roleName: adversary.roleName ?? "Standard",
    summary: adversary.summary ?? "",
    image: adversary.image ?? null,
    features: (adversary.features ?? []).map((feature) => ({
      id: feature.id,
      name: feature.name,
      text: feature.text ?? "",
    })),
    attackBonus: adversary.attackBonus ?? "0",
    attackRange: adversary.attackRange ?? "",
    damageType: adversary.damageType ?? "",
    damageBonus: adversary.damageBonus ?? 0,
    damageDieSize: adversary.damageDieSize ?? 0,
    damageDieCount: adversary.damageDieCount ?? 0,
    stress: adversary.stress ?? 0,
    hp: adversary.hp ?? 0,
    difficulty: adversary.difficulty ?? 0,
    damageThresholds: adversary.damageThresholds ?? null,
    motives: adversary.motives ?? "",
    experiences: adversary.experiences ?? "",
    weaponName: adversary.weaponName ?? "",
    sourceSlugs: "sourceSlugs" in adversary && Array.isArray(adversary.sourceSlugs) ? adversary.sourceSlugs : [],
    campaignFrameSlugs: "campaignFrameSlugs" in adversary && Array.isArray(adversary.campaignFrameSlugs) ? adversary.campaignFrameSlugs : [],
    hordePerHp: "hordePerHp" in adversary ? adversary.hordePerHp ?? null : null,
    mainBody: adversary.mainBody ?? "",
  };
}

function normalizeDifficultyMode(value: unknown): EncounterDifficultyMode {
  return value === "easy" || value === "hard" ? value : "standard";
}

function builderSnapshotFromStore(): CombatBuilderEncounterSnapshot {
  const { entries, playerCount, difficultyMode, isDamageBoosted, isLowerTierUsed } =
    encounterStore.get();

  return {
    entries,
    playerCount,
    difficultyMode,
    isDamageBoosted,
    isLowerTierUsed,
    updatedAt: Date.now(),
  };
}

function builderSettingsFromSnapshot(snapshot: CombatBuilderEncounterSnapshot): BuilderEncounterSettings {
  return {
    playerCount: clamp(Number(snapshot.playerCount ?? 4), 1, 8),
    difficultyMode: normalizeDifficultyMode(snapshot.difficultyMode),
    isDamageBoosted: snapshot.isDamageBoosted === true,
    isLowerTierUsed: snapshot.isLowerTierUsed === true,
  };
}

function finalBudget(entries: EncounterBattleEntry[], settings: BuilderEncounterSettings): number {
  return buildEncounterSummary(entries, settings).finalBudget;
}

export class EncounterService {
  readonly encounter$ = encounterStore.toStream();
  private bootstrapped = false;
  private unsubscribeCoreEncounter: (() => void) | null = null;

  ensureHydrated() {
    if (this.bootstrapped) return;
    this.bootstrapped = true;
    this.applyCoreEncounter();
    this.unsubscribeCoreEncounter = coreEncounterStore.subscribe(() => this.applyCoreEncounter());
  }

  dispose() {
    this.unsubscribeCoreEncounter?.();
    this.unsubscribeCoreEncounter = null;
    this.bootstrapped = false;
  }

  private applyCoreEncounter() {
    const snapshot = buildCombatBuilderEncounterFromCoreEncounter(coreEncounterStore.get());
    const settings = builderSettingsFromSnapshot(snapshot);
    encounterStore.update((state) => ({
      ...state,
      entries: normalizeEntries(snapshot.entries),
      ...settings,
    }));
  }

  private commitToCore(snapshot = builderSnapshotFromStore()) {
    const settings = builderSettingsFromSnapshot(snapshot);
    const entries = normalizeEntries(snapshot.entries);
    const result = buildCoreAdversariesFromCombatBuilder({ ...snapshot, entries });
    const adversaries = Object.fromEntries(result.adversaries.map((adversary) => [adversary.id, adversary]));
    const order = result.adversaries.map((adversary) => adversary.id);

    coreEncounterStore.update((state) => ({
      ...state,
      adversaries,
      order,
      activeAdversaryId: order.includes(state.activeAdversaryId ?? "")
        ? state.activeAdversaryId
        : order[0] ?? null,
      playerCount: settings.playerCount,
      difficultyMode: settings.difficultyMode,
      isDamageBoosted: settings.isDamageBoosted,
      isLowerTierUsed: settings.isLowerTierUsed,
      battlePointBudget: finalBudget(entries, settings),
      updatedAt: nowIso(),
    }));
  }

  addAdversary(adversary: Adversary) {
    encounterStore.update((state) => {
      const existing = state.entries.find((entry) => entry.adversary.id === adversary.id);
      const entries = existing
        ? state.entries.map((entry) =>
            entry.adversary.id === adversary.id
              ? {
                  ...entry,
                  instances: [...entry.instances, createUnitState()],
                  count: entry.instances.length + 1,
                }
              : entry
          )
        : [
            ...state.entries,
            {
              adversary,
              count: 1,
              instances: [createUnitState()],
            },
          ];

      return {
        ...state,
        entries: normalizeEntries(entries),
        isSidebarOpen:
          typeof window !== "undefined" ? window.innerWidth < 1100 : state.isSidebarOpen,
      };
    });

    this.commitToCore();
  }

  syncAdversary(adversary: Adversary) {
    encounterStore.update((state) => ({
      ...state,
      entries: normalizeEntries(
        state.entries.map((entry) =>
          entry.adversary.id === adversary.id ? { ...entry, adversary } : entry
        )
      ),
    }));

    this.commitToCore();
  }

  updateCount(id: number, delta: number) {
    encounterStore.update((state) => ({
      ...state,
      entries: normalizeEntries(
        state.entries
          .map((entry) =>
            entry.adversary.id === id
              ? (() => {
                  const nextCount = Math.max(0, entry.count + delta);
                  const instances =
                    nextCount <= entry.instances.length
                      ? entry.instances.slice(0, nextCount)
                      : [
                          ...entry.instances,
                          ...Array.from(
                            { length: nextCount - entry.instances.length },
                            () => createUnitState()
                          ),
                        ];

                  return {
                    ...entry,
                    count: instances.length,
                    instances,
                  };
                })()
              : entry
          )
          .filter((entry) => entry.count > 0)
      ),
    }));

    this.commitToCore();
  }

  adjustHp(id: number, unitId: string, delta: number) {
    encounterStore.update((state) => ({
      ...state,
      entries: normalizeEntries(
        state.entries.map((entry) =>
          entry.adversary.id === id
            ? {
                ...entry,
                instances: entry.instances.map((instance) =>
                  instance.id === unitId
                    ? {
                        ...instance,
                        currentHp: clamp(instance.currentHp + delta, 0, entry.adversary.hp),
                      }
                    : instance
                ),
              }
            : entry
        )
      ),
    }));

    this.commitToCore();
  }

  adjustStress(id: number, unitId: string, delta: number) {
    encounterStore.update((state) => ({
      ...state,
      entries: normalizeEntries(
        state.entries.map((entry) =>
          entry.adversary.id === id
            ? {
                ...entry,
                instances: entry.instances.map((instance) =>
                  instance.id === unitId
                    ? {
                        ...instance,
                        currentStress: clamp(
                          instance.currentStress + delta,
                          0,
                          entry.adversary.stress
                        ),
                      }
                    : instance
                ),
              }
            : entry
        )
      ),
    }));

    this.commitToCore();
  }

  resetEntryState(id: number) {
    encounterStore.update((state) => ({
      ...state,
      entries: normalizeEntries(
        state.entries.map((entry) =>
          entry.adversary.id === id
            ? {
                ...entry,
                instances: entry.instances.map((instance) => ({
                  ...instance,
                  currentHp: 0,
                  currentStress: 0,
                })),
              }
            : entry
        )
      ),
    }));

    this.commitToCore();
  }

  clear() {
    encounterStore.update((state) => ({
      ...state,
      entries: [],
    }));
    this.commitToCore();
  }

  setPlayerCount(playerCount: number) {
    encounterStore.update((state) => ({
      ...state,
      playerCount: clamp(playerCount, 1, 8),
    }));
    this.commitToCore();
  }

  setDifficultyMode(difficultyMode: DifficultyMode) {
    encounterStore.update((state) => ({
      ...state,
      difficultyMode,
    }));
    this.commitToCore();
  }

  toggleDamageBoosted() {
    encounterStore.update((state) => ({
      ...state,
      isDamageBoosted: !state.isDamageBoosted,
    }));
    this.commitToCore();
  }

  toggleLowerTierUsed() {
    encounterStore.update((state) => ({
      ...state,
      isLowerTierUsed: !state.isLowerTierUsed,
    }));
    this.commitToCore();
  }

  setSidebarOpen(isSidebarOpen: boolean) {
    encounterStore.update((state) => ({
      ...state,
      isSidebarOpen,
    }));
  }
}

export const encounterService = new EncounterService();
