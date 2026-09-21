export function assetReference(assetId: string): string {
  return `asset:${assetId}`;
}

export function assetIdFromReference(value: string): string | null {
  return /^asset:([a-zA-Z0-9_-]+)$/.exec(value)?.[1] ?? null;
}

/** Includes references retained by character history, so undo keeps its images. */
export function assetReferenceIds(value: unknown): string[] {
  if (typeof value === 'string') {
    const id = assetIdFromReference(value);
    return id ? [id] : [];
  }
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(assetReferenceIds);
}

export function remapAssetReferences<T>(value: T, ids: Record<string, string>): T {
  if (typeof value === 'string') {
    const id = assetIdFromReference(value);
    return (id && ids[id] ? assetReference(ids[id]) : value) as T;
  }
  if (Array.isArray(value)) return value.map((item) => remapAssetReferences(item, ids)) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapAssetReferences(item, ids)])) as T;
}
