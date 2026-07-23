import { cleanMarkdownText } from '../../core/utils/markdownText';
import type {
  GenericLibraryItem,
  LibraryAdversary,
  LibraryBeastform,
  LibraryClassItem,
  LibraryEnvironment,
  LibraryEquipmentItem,
  LibraryRuleEntry
} from './types';

export interface ContentSearchDocument {
  title: string;
  metadata?: Array<string | null | undefined>;
  summary?: string | null;
  body?: Array<string | null | undefined>;
}

export interface ContentSearchMatch<T> {
  item: T;
  score: number;
  preview: string;
}

export const contentSearchDocuments = {
  adversary(item: LibraryAdversary): ContentSearchDocument {
    return {
      title: item.name,
      metadata: [item.roleName, item.weaponName],
      summary: item.summary,
      body: [item.motives, item.experiencesText, item.mainBody, rawFeaturesText(item.raw.features)]
    };
  },
  classItem(item: LibraryClassItem): ContentSearchDocument {
    return {
      title: item.name,
      metadata: item.domains,
      summary: item.body,
      body: [item.classItems.join(' '), rawFeaturesText(item.raw.features)]
    };
  },
  generic(item: GenericLibraryItem): ContentSearchDocument {
    return {
      title: item.name,
      metadata: [item.subtitle],
      summary: item.body,
      body: [rawFeaturesText([
        ...(item.raw.features ?? []),
        ...(item.raw.foundation_features ?? []),
        ...(item.raw.specialization_features ?? []),
        ...(item.raw.mastery_features ?? [])
      ])]
    };
  },
  equipment(item: LibraryEquipmentItem): ContentSearchDocument {
    return {
      title: item.name,
      metadata: [item.typeName, item.damageFormula, item.range],
      summary: item.featureText
    };
  },
  rule(item: LibraryRuleEntry): ContentSearchDocument {
    return {
      title: item.name,
      metadata: [item.frameName],
      summary: item.summary,
      body: [item.body]
    };
  },
  environment(item: LibraryEnvironment): ContentSearchDocument {
    return {
      title: item.name,
      metadata: [item.typeName],
      summary: item.summary,
      body: [item.body, item.featureText, item.impulses, item.potentialAdversaries]
    };
  },
  beastform(item: LibraryBeastform): ContentSearchDocument {
    return {
      title: item.name,
      summary: item.summary,
      body: [item.examples, item.advantages, item.featureText]
    };
  }
} as const;

export function rankContentSearch<T>(
  items: T[],
  query: string,
  documentFor: (item: T) => ContentSearchDocument
): ContentSearchMatch<T>[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return items.map((item) => ({ item, score: 0, preview: '' }));
  }

  const queryTokens = tokenize(normalizedQuery);
  if (queryTokens.length === 0) return [];

  return items
    .map((item, originalIndex) => {
      const document = documentFor(item);
      const score = scoreDocument(document, normalizedQuery, queryTokens);
      return score > 0
        ? {
          item,
          originalIndex,
          score,
          preview: buildSearchPreview(document, queryTokens)
        }
        : null;
    })
    .filter((match): match is ContentSearchMatch<T> & { originalIndex: number } => Boolean(match))
    .sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex)
    .map(({ originalIndex: _originalIndex, ...match }) => match);
}

export function normalizeSearchText(value: string): string {
  return plainText(value)
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreDocument(document: ContentSearchDocument, normalizedQuery: string, queryTokens: string[]): number {
  const title = normalizeSearchText(document.title);
  const metadata = normalizeSearchText((document.metadata ?? []).filter(Boolean).join(' '));
  const summary = normalizeSearchText(document.summary ?? '');
  const body = normalizeSearchText((document.body ?? []).filter(Boolean).join(' '));
  const titleTokens = tokenize(title);
  const metadataTokens = tokenize(metadata);
  const summaryTokens = tokenize(summary);
  const bodyTokens = tokenize(body);

  let score = 0;
  if (title === normalizedQuery) score += 12_000;
  else if (title.startsWith(normalizedQuery)) score += 7_000;
  else if (title.includes(normalizedQuery)) score += 4_000;

  for (const queryToken of queryTokens) {
    const tokenScore = Math.max(
      bestTokenScore(queryToken, titleTokens, 1_200, true),
      bestTokenScore(queryToken, metadataTokens, 320, false),
      bestTokenScore(queryToken, summaryTokens, 140, false),
      bestTokenScore(queryToken, bodyTokens, 35, false)
    );
    if (tokenScore === 0) return 0;
    score += tokenScore;
  }

  if (metadata.includes(normalizedQuery)) score += 240;
  if (summary.includes(normalizedQuery)) score += 100;
  if (body.includes(normalizedQuery)) score += 20;
  return score;
}

function bestTokenScore(queryToken: string, fieldTokens: string[], weight: number, allowTypos: boolean): number {
  let quality = 0;
  for (const fieldToken of fieldTokens) {
    if (fieldToken === queryToken) {
      quality = Math.max(quality, 1);
      continue;
    }
    if (allowTypos && queryToken.length >= 2 && fieldToken.startsWith(queryToken)) {
      quality = Math.max(quality, 0.82);
      continue;
    }
    if (wordsAreRelated(queryToken, fieldToken)) {
      quality = Math.max(quality, 0.78);
      continue;
    }
    if (allowTypos && isLightTypo(queryToken, fieldToken)) {
      quality = Math.max(quality, 0.58);
    }
  }
  return Math.round(weight * quality);
}

function wordsAreRelated(left: string, right: string): boolean {
  const shortest = Math.min(left.length, right.length);
  if (shortest < 4) return false;
  if (left.startsWith(right) || right.startsWith(left)) return true;

  const requiredPrefix = Math.max(4, Math.ceil(shortest * 0.67));
  let commonPrefix = 0;
  while (commonPrefix < shortest && left[commonPrefix] === right[commonPrefix]) commonPrefix += 1;
  return commonPrefix >= requiredPrefix;
}

function isLightTypo(left: string, right: string): boolean {
  const shortest = Math.min(left.length, right.length);
  if (shortest < 5 || Math.abs(left.length - right.length) > 2) return false;
  const allowedDistance = shortest >= 9 ? 2 : 1;
  return damerauLevenshtein(left, right, allowedDistance) <= allowedDistance;
}

function damerauLevenshtein(left: string, right: string, limit: number): number {
  const matrix = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= left.length; row += 1) {
    let rowMinimum = limit + 1;
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
      if (
        row > 1
        && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
      rowMinimum = Math.min(rowMinimum, matrix[row][column]);
    }
    if (rowMinimum > limit && row > limit) return limit + 1;
  }
  return matrix[left.length][right.length];
}

function buildSearchPreview(document: ContentSearchDocument, queryTokens: string[]): string {
  const candidates = [
    document.summary,
    ...(document.body ?? []),
    ...(document.metadata ?? [])
  ].map((value) => plainText(value ?? '')).filter(Boolean);
  const matchingCandidate = candidates.find((candidate) => findMatchingWord(candidate, queryTokens) !== null);
  const candidate = matchingCandidate ?? candidates[0] ?? '';
  if (!candidate) return '';

  const matchIndex = findMatchingWord(candidate, queryTokens) ?? 0;
  const start = matchIndex > 62 ? findSnippetStart(candidate, matchIndex - 62) : 0;
  const end = findSnippetEnd(candidate, Math.min(candidate.length, start + 190));
  const prefix = start > 0 ? '…' : '';
  const suffix = end < candidate.length ? '…' : '';
  return `${prefix}${candidate.slice(start, end).trim()}${suffix}`;
}

function findMatchingWord(value: string, queryTokens: string[]): number | null {
  const normalizedTokens = Array.from(value.matchAll(/[\p{L}\p{N}]+/gu));
  for (const match of normalizedTokens) {
    const token = normalizeSearchText(match[0]);
    if (queryTokens.some((queryToken) => token === queryToken || wordsAreRelated(queryToken, token))) {
      return match.index ?? 0;
    }
  }
  return null;
}

function findSnippetStart(value: string, preferredStart: number): number {
  const nextSpace = value.indexOf(' ', preferredStart);
  return nextSpace === -1 ? preferredStart : nextSpace + 1;
}

function findSnippetEnd(value: string, preferredEnd: number): number {
  if (preferredEnd >= value.length) return value.length;
  const previousSpace = value.lastIndexOf(' ', preferredEnd);
  return previousSpace <= 0 ? preferredEnd : previousSpace;
}

function plainText(value: string): string {
  return cleanMarkdownText(value, { stripEmphasis: true, stripCodeTicks: true })
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\|{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return Array.from(new Set(value.split(' ').filter(Boolean)));
}

function rawFeaturesText(features: Array<{ name?: unknown; main_body?: unknown; text?: unknown }> | undefined): string {
  if (!Array.isArray(features)) return '';
  return features
    .map((feature) => [feature.name, feature.main_body ?? feature.text]
      .filter((value) => typeof value === 'string')
      .join(' '))
    .join(' ');
}
