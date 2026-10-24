/** Persisted availability; legacy booleans remain accepted at domain API boundaries. */
export type ContentAccess = 'core' | 'hope-and-fear' | 'all';
export type ContentAccessInput = ContentAccess | boolean;

export function normalizeContentAccess(value: unknown, legacyIncludeVoid?: boolean): ContentAccess {
  if (value === 'core' || value === 'hope-and-fear' || value === 'all') return value;
  if (typeof value === 'boolean') return value ? 'all' : 'core';
  return legacyIncludeVoid === false ? 'core' : 'all';
}

export function contentAccessForGame(game: { contentAccess?: unknown; includeVoidContent?: boolean }): ContentAccess {
  return normalizeContentAccess(game.contentAccess, game.includeVoidContent);
}

export function contentSourceAllowed(sourceSlugs: unknown, access: ContentAccessInput = false): boolean {
  const mode = normalizeContentAccess(access);
  if (mode === 'all') return true;
  if (!Array.isArray(sourceSlugs)) return true;
  if (sourceSlugs.some(source => source === 'core' || source === 'srd' || source === 'custom')) return true;
  return mode === 'hope-and-fear' && sourceSlugs.includes('hope-and-fear');
}
