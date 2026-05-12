export const SVG_COLOR_TOKENS = {
  primary: "#EB4789",
  secondary: "#28292B",
} as const;

const PRIMARY_REGEX = new RegExp(SVG_COLOR_TOKENS.primary, "gi");
const SECONDARY_REGEX = new RegExp(SVG_COLOR_TOKENS.secondary, "gi");

type SvgTemplateOptions = {
  removeText?: boolean;
  stripFilterGroups?: boolean;
  stripFilterAttributes?: boolean;
};

export type SvgTemplate = {
  raw: string;
  size: { width: number; height: number };
};

export function applyColorTokens(svg: string, primary: string, secondary?: string) {
  let next = svg.replace(PRIMARY_REGEX, primary);
  if (secondary) {
    next = next.replace(SECONDARY_REGEX, secondary);
  }
  return next;
}

export function insertSvgMarkup(svg: string, markup: string) {
  if (!markup) return svg;
  return svg.replace(/<\/svg>/i, `${markup}</svg>`);
}

export function parseSvgSize(svg: string) {
  const widthMatch = svg.match(/<svg[^>]*\bwidth="([0-9.]+)"/i);
  const heightMatch = svg.match(/<svg[^>]*\bheight="([0-9.]+)"/i);
  const width = widthMatch ? Number(widthMatch[1]) : null;
  const height = heightMatch ? Number(heightMatch[1]) : null;
  if (width && height) return { width, height };

  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
      return { width: parts[2], height: parts[3] };
    }
  }
  return null;
}

export function sanitizeSvg(svg: string, options: SvgTemplateOptions = {}) {
  let next = svg.trim();
  if (options.stripFilterGroups) {
    next = next.replace(/<g[^>]*filter="[^"]*"[^>]*>[\s\S]*?<\/g>/gi, "");
  }
  if (options.stripFilterAttributes) {
    next = next.replace(/\sfilter="[^"]*"/gi, "");
  }
  if (options.removeText) {
    next = next.replace(/<text[\s\S]*?<\/text>/gi, "");
  }
  return next;
}

export function createSvgTemplate(svg: string, options?: SvgTemplateOptions): SvgTemplate {
  const sanitized = sanitizeSvg(svg, options);
  const size = parseSvgSize(sanitized) ?? { width: 0, height: 0 };
  return { raw: sanitized, size };
}
