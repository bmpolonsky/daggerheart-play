import type { EncounterEntry } from "@combat/lib/api";

export const ROLE_COSTS: Record<string, number> = {
  minion: 1,
  social: 1,
  support: 1,
  horde: 2,
  ranged: 2,
  skulk: 2,
  standard: 2,
  leader: 3,
  bruiser: 4,
  solo: 5,
};

export type DifficultyMode = "easy" | "standard" | "hard";

export interface ModifierBreakdown {
  id: string;
  label: string;
  value: number;
  active: boolean;
}

export interface EncounterSummary {
  totalCost: number;
  baseBudget: number;
  totalModifiers: number;
  finalBudget: number;
  totalUnits: number;
  totalEntries: number;
  difficulty: {
    label: string;
    tone: "quiet" | "good" | "balanced" | "warning" | "danger" | "extreme";
  };
  modifiers: ModifierBreakdown[];
}

export function calculateAdversaryCost(roleId: string) {
  return ROLE_COSTS[roleId.toLowerCase()] ?? 2;
}

export function calculateBudget(playerCount: number) {
  return playerCount * 3 + 2;
}

function resolveDifficulty(finalBudget: number, totalCost: number) {
  const delta = totalCost - finalBudget;

  if (delta <= -4) return { label: "Тривиально", tone: "quiet" as const };
  if (delta <= -2) return { label: "Легко", tone: "good" as const };
  if (delta <= 1) return { label: "Стандарт", tone: "balanced" as const };
  if (delta <= 4) return { label: "Сложно", tone: "warning" as const };
  if (delta <= 8) return { label: "Экстремально", tone: "danger" as const };
  return { label: "Смертельно", tone: "extreme" as const };
}

export function buildEncounterSummary(
  entries: EncounterEntry[],
  options: {
    playerCount: number;
    difficultyMode: DifficultyMode;
    isDamageBoosted: boolean;
    isLowerTierUsed: boolean;
  }
): EncounterSummary {
  const totalCost = entries.reduce(
    (sum, entry) => sum + calculateAdversaryCost(entry.adversary.roleId) * entry.count,
    0
  );
  const totalUnits = entries.reduce((sum, entry) => sum + entry.count, 0);
  const totalEntries = entries.length;
  const baseBudget = calculateBudget(options.playerCount);

  const soloCount = entries.reduce(
    (sum, entry) => sum + (entry.adversary.roleId === "solo" ? entry.count : 0),
    0
  );
  const heavyTypes = new Set(["bruiser", "horde", "leader", "solo"]);
  const hasHeavies = entries.some((entry) => heavyTypes.has(entry.adversary.roleId));

  const modifiers: ModifierBreakdown[] = [
    {
      id: "difficulty-easy",
      label: "Лёгкая сцена",
      value: -1,
      active: options.difficultyMode === "easy",
    },
    {
      id: "difficulty-hard",
      label: "Сложная сцена",
      value: 2,
      active: options.difficultyMode === "hard",
    },
    {
      id: "damage-boosted",
      label: "Усиленный урон врагов",
      value: -2,
      active: options.isDamageBoosted,
    },
    {
      id: "lower-tier",
      label: "Враги ниже ранга группы",
      value: 1,
      active: options.isLowerTierUsed,
    },
    {
      id: "multiple-solos",
      label: "Две и более одиночки",
      value: -2,
      active: soloCount >= 2,
    },
    {
      id: "no-heavies",
      label: "В сцене нет тяжёлых ролей",
      value: 1,
      active: entries.length > 0 && !hasHeavies,
    },
  ];

  const totalModifiers = modifiers.reduce(
    (sum, modifier) => sum + (modifier.active ? modifier.value : 0),
    0
  );
  const finalBudget = Math.max(1, baseBudget + totalModifiers);

  return {
    totalCost,
    baseBudget,
    totalModifiers,
    finalBudget,
    totalUnits,
    totalEntries,
    difficulty: resolveDifficulty(finalBudget, totalCost),
    modifiers,
  };
}
