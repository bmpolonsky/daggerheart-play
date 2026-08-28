const INLINE_MARKER_REGEX = /#\{([^}]*)\}#/g;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\([^)]+\)/g;
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\([^)]+\)/g;
const MARKDOWN_EMPHASIS_REGEX = /\*\*\*|\*\*|\*/g;
const SPLIT_EMPHASIZED_LINK_REGEX = /(\*{2,3})([^*\n]+)\1\s+\[([^\]]+)\]\([^)]+\)\1([^*\n]+)\1/g;
const REDUNDANT_EMPHASIZED_LINK_REGEX = /(?<![\p{L}\p{N}])(\*{1,3})\s*\[\1([^*\]]+)\1\s*\]\([^)]+\)\s*\1/gu;

export function stripInlineMarkers(value: string) {
  if (!value) return '';
  return value.replace(INLINE_MARKER_REGEX, '$1');
}

export function stripMarkdownLinks(value: string, options: { emphasizeLabels?: boolean } = {}) {
  if (!value) return '';
  const joined = value.replace(SPLIT_EMPHASIZED_LINK_REGEX, (_match, marker: string, before: string, label: string, after: string) => (
    `${marker}${before.trimEnd()} ${label.trim()}${after.trimStart()}${marker}`
  ));
  const normalized = joined.replace(REDUNDANT_EMPHASIZED_LINK_REGEX, (match, marker: string, label: string, offset: number) => {
    const prefix = /[,;:!?]/.test(joined[offset - 1] ?? '') ? ' ' : '';
    const next = joined[offset + match.length] ?? '';
    const suffix = /[\p{L}\p{N}—–]/u.test(next) ? ' ' : '';
    if (!hasOpenEmphasis(joined, offset)) return `${prefix}${marker}${label.trim()}${marker}${suffix}`;
    const lineEnd = joined.indexOf('\n', offset + match.length);
    const remainder = joined.slice(offset + match.length, lineEnd < 0 ? joined.length : lineEnd);
    if (!/(?<!\\)\*/.test(remainder)) return `${prefix}${label.trim()}${marker}${suffix}`;
    return `${prefix}${label.trim()}${suffix}`;
  });
  return normalized.replace(MARKDOWN_LINK_REGEX, (_match, label: string, offset: number) => {
    const text = label.trim();
    if (!options.emphasizeLabels || !text || /^\*{1,3}[^*]/.test(text) || hasOpenEmphasis(normalized, offset)) return text;
    return `**${text}**`;
  });
}

export function stripMarkdownImages(value: string) {
  if (!value) return '';
  // Image URLs have nowhere to render in compact sheets and feed cards. An
  // authored alt label is still useful copy, while decorative `![](...)` is
  // deliberately removed.
  return value
    .replace(MARKDOWN_IMAGE_REGEX, (_match, alt: string) => alt.trim())
    .replace(/[ \t]{2,}/g, ' ');
}

export function stripMarkdownEmphasis(value: string): string {
  if (!value) return '';
  return value.replace(MARKDOWN_EMPHASIS_REGEX, '');
}

export function normalizeMarkdownLineBreaks(value: string): string {
  if (!value) return '';
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function cleanMarkdownText(value: string, options: {
  emphasizeLinks?: boolean;
  stripEmphasis?: boolean;
  stripCodeTicks?: boolean;
  normalizeLineBreaks?: boolean;
  trim?: boolean;
} = {}): string {
  let text = stripMarkdownLinks(stripMarkdownImages(stripInlineMarkers(value)), { emphasizeLabels: options.emphasizeLinks });
  if (options.stripCodeTicks) text = text.replace(/`([^`]+)`/g, '$1');
  if (options.stripEmphasis) text = stripMarkdownEmphasis(text);
  if (options.normalizeLineBreaks) text = normalizeMarkdownLineBreaks(text);
  return options.trim === false ? text : text.trim();
}

export function cleanMarkdownValue<T>(value: T): T {
  if (typeof value === 'string') return cleanMarkdownText(value, { emphasizeLinks: true }) as T;
  if (Array.isArray(value)) return value.map(cleanMarkdownValue) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanMarkdownValue(item)])) as T;
  }
  return value;
}

function hasOpenEmphasis(value: string, offset: number): boolean {
  const line = value.slice(value.lastIndexOf('\n', offset - 1) + 1, offset).replace(/^\s*(?:>\s*)?\*\s+/, '');
  let italic = false;
  let strong = false;
  for (const marker of line.match(/(?<!\\)\*{1,3}/g) ?? []) {
    if (marker.length !== 2) italic = !italic;
    if (marker.length >= 2) strong = !strong;
  }
  return italic || strong;
}
