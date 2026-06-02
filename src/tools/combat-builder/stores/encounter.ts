import type { EncounterEntry } from "@combat/lib/api";
import type { DifficultyMode } from "@combat/lib/mechanics";
import { Store } from "../../../core/store/Store";

export interface EncounterUnitState {
  id: string;
  currentHp: number;
  currentStress: number;
}

export type EncounterBattleEntry = EncounterEntry & {
  instances: EncounterUnitState[];
};

export interface EncounterState {
  entries: EncounterBattleEntry[];
  playerCount: number;
  difficultyMode: DifficultyMode;
  isDamageBoosted: boolean;
  isLowerTierUsed: boolean;
  isSidebarOpen: boolean;
}

const initialState: EncounterState = {
  entries: [],
  playerCount: 4,
  difficultyMode: "standard",
  isDamageBoosted: false,
  isLowerTierUsed: false,
  isSidebarOpen: false,
};

export const encounterStore = new Store<EncounterState>(initialState);
