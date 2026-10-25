import { cleanMarkdownText } from '../../core/utils/markdownText';

/** Converts known content markup to text; it never interprets or renders HTML. */
export function cleanLibraryHtmlText(value: string): string {
  const entities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    hellip: '…', mdash: '—', ndash: '–', times: '×', le: '≤', ge: '≥'
  };
  return value
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|hellip|mdash|ndash|times|le|ge);/gi, (match, entity: string) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? match;
      const hexadecimal = entity[1].toLowerCase() === 'x';
      const code = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
    })
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style|iframe|object)(?=[\s/>])[^>]*>[^]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/?(?:p|div|section|article|blockquote|pre|h[1-6]|ul|ol|table|tr)(?=[\s/>])[^>]*>/gi, '\n\n')
    .replace(/<li(?=[\s/>])[^>]*>/gi, '\n- ')
    .replace(/<\/?(?:li|td|th|thead|tbody|span|strong|em|b|i|u|s|a|small|sup|sub|code|img|hr)(?=[\s/>])[^>]*>/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function libraryPreviewText(...candidates: Array<string | null | undefined>): string {
  return candidates.find((text) => Boolean(text && cleanMarkdownText(cleanLibraryHtmlText(text), { stripEmphasis: true }).trim())) ?? '';
}

export function compactLibraryText(value: string): string {
  const normalized = cleanMarkdownText(cleanLibraryHtmlText(value), { stripEmphasis: true })
    .replace(/^#+\s*/gm, '').replace(/\|{2,}/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Без описания.';
  return normalized.length > 190 ? `${normalized.slice(0, 187).trim()}...` : normalized;
}

export function shouldRecoverLibraryFilters(input: {
  selectedSlug?: string | null;
  visibleSlugs: Array<string | undefined>;
  editorOpen: boolean;
  savedSlug: string | null;
}): boolean {
  return Boolean(input.selectedSlug && !input.editorOpen && input.selectedSlug !== input.savedSlug && !input.visibleSlugs.includes(input.selectedSlug));
}
