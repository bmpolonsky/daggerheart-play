export function cn(...values: Array<unknown>) {
  return values.filter((value): value is string => typeof value === "string" && value.length > 0).join(" ");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatDateTime(value: string | null) {
  if (!value) return null;

  try {
    return new Date(value).toLocaleString("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

export function formatDamageRoll(params: {
  damageDieCount: number;
  damageDieSize: number;
  damageBonus: number;
}, options?: {
  flatSuffix?: string;
}) {
  const { damageDieCount, damageDieSize, damageBonus } = params;
  const hasDice = damageDieCount > 0 && damageDieSize > 0;

  if (!hasDice) {
    return `${damageBonus}${options?.flatSuffix ?? ""}`;
  }

  const bonus =
    damageBonus > 0 ? `+${damageBonus}` : damageBonus < 0 ? `${damageBonus}` : "";

  return `${damageDieCount}d${damageDieSize}${bonus}`;
}
