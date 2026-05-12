const INLINE_MARKER_REGEX = /#\{([^}]*)\}#/g;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\([^)]+\)/g;
const MARKDOWN_EMPHASIS_REGEX = /\*\*\*|\*\*|\*/g;

export function stripInlineMarkers(value: string) {
  if (!value) return '';
  return value.replace(INLINE_MARKER_REGEX, '$1');
}

export function stripMarkdownLinks(value: string, options: { emphasizeLabels?: boolean } = {}) {
  if (!value) return '';
  return value.replace(MARKDOWN_LINK_REGEX, (_match, label: string) => {
    const text = label.trim();
    if (!options.emphasizeLabels || !text) return text;
    if (text.startsWith('**') || text.startsWith('***')) return text;
    return `**${text}**`;
  });
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
  let text = stripMarkdownLinks(stripInlineMarkers(value), { emphasizeLabels: options.emphasizeLinks });
  if (options.stripCodeTicks) text = text.replace(/`([^`]+)`/g, '$1');
  if (options.stripEmphasis) text = stripMarkdownEmphasis(text);
  if (options.normalizeLineBreaks) text = normalizeMarkdownLineBreaks(text);
  return options.trim === false ? text : text.trim();
}
