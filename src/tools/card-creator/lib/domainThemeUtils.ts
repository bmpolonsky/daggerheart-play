const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function normalizeHex(color: string) {
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#6b7280";
}

export function shadeColor(hex: string, amount: number) {
  const normalized = normalizeHex(hex).slice(1);
  const num = parseInt(normalized, 16);
  const r = clamp(((num >> 16) & 0xff) + amount, 0, 255);
  const g = clamp(((num >> 8) & 0xff) + amount, 0, 255);
  const b = clamp((num & 0xff) + amount, 0, 255);
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function resolveBannerColors(primary: string, secondary?: string) {
  const primaryHex = normalizeHex(primary);
  if (secondary) {
    return {
      primary: primaryHex,
      secondary: normalizeHex(secondary),
      hasSecondary: true,
    } as const;
  }
  return {
    primary: primaryHex,
    secondary: shadeColor(primaryHex, -36),
    hasSecondary: false,
  } as const;
}
