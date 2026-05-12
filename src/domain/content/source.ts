import type { ApiPayload, ContentCollectionKey, ContentManifest, ContentManifestCollection } from './types';

export type ContentSourceKind = 'api' | 'cache' | 'empty';
export type ContentSourceMode = 'api' | 'cache' | 'mixed' | 'empty';

export interface ContentCollectionConfig {
  key: ContentCollectionKey;
  endpoint: string;
  file: string;
}

export interface LoadedContentPayload<T> {
  payload: ApiPayload<T>;
  source: ContentSourceKind;
  sourceUrl: string;
  error?: string;
}

export interface ContentSourceSummary {
  mode: ContentSourceMode;
  warnings: string[];
}

export const CONTENT_COLLECTIONS: ContentCollectionConfig[] = [
  { key: 'adversaries', endpoint: 'adversary', file: 'adversaries.json' },
  { key: 'classes', endpoint: 'class', file: 'classes.json' },
  { key: 'rules', endpoint: 'rule', file: 'rules.json' },
  { key: 'environments', endpoint: 'environment', file: 'environments.json' },
  { key: 'beastforms', endpoint: 'beastform', file: 'beastforms.json' },
  { key: 'ancestries', endpoint: 'ancestry', file: 'ancestries.json' },
  { key: 'communities', endpoint: 'community', file: 'communities.json' },
  { key: 'subclasses', endpoint: 'subclass', file: 'subclasses.json' },
  { key: 'domainCards', endpoint: 'domain-card', file: 'domain-cards.json' },
  { key: 'equipment', endpoint: 'equipment', file: 'equipment.json' }
];

export function normalizeContentSourceUrl(value: string | undefined | null): string {
  return (value?.trim() || 'https://daggerheart.su').replace(/\/+$/, '');
}

export function normalizeContentLanguage(value: string | undefined | null): string {
  return value?.trim() || 'ru';
}

export function buildApiCollectionUrl(baseUrl: string, endpoint: string, language: string): string {
  return `${normalizeContentSourceUrl(baseUrl)}/api/${endpoint}?lang=${encodeURIComponent(normalizeContentLanguage(language))}`;
}

export function summarizeContentSources(collections: Array<LoadedContentPayload<unknown>>): ContentSourceSummary {
  const sources = new Set(collections.map((collection) => collection.source));
  const warnings = collections
    .filter((collection) => collection.source === 'cache' && collection.error)
    .map((collection) => collection.error as string);

  if (!collections.length || sources.size === 0 || (sources.size === 1 && sources.has('empty'))) {
    return { mode: 'empty', warnings };
  }
  if (sources.size === 1 && sources.has('api')) return { mode: 'api', warnings };
  if (sources.size === 1 && sources.has('cache')) return { mode: 'cache', warnings };
  return { mode: 'mixed', warnings };
}

export function createContentManifest(
  baseUrl: string,
  language: string,
  collections: Array<{ config: ContentCollectionConfig; loaded: LoadedContentPayload<unknown> }>
): ContentManifest {
  return {
    source: normalizeContentSourceUrl(baseUrl),
    language: normalizeContentLanguage(language),
    generatedAt: new Date().toISOString(),
    collections: collections.map(({ config, loaded }): ContentManifestCollection => ({
      key: config.key,
      endpoint: config.endpoint,
      file: config.file,
      count: Array.isArray(loaded.payload.data) ? loaded.payload.data.length : 0,
      sourceUrl: loaded.sourceUrl,
      source: loaded.source
    }))
  };
}
