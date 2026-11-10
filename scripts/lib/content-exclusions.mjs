// Deferred beta additions. Existing class reference records stay in the library;
// playable class support remains governed by the application's explicit mappings.
// A promotion to another source must be reviewed, not silently hidden here.
const DEFERRED_CLASS_SLUGS = new Set(['blood-hunter', 'summoner']);

export function applyContentExclusions(collectionKey, payload) {
  const exclusions = [];
  if (!Array.isArray(payload?.data)) return { payload, exclusions };
  const data = payload.data.filter((item) => {
    const sources = item?.source_slugs;
    const voidOnly = Array.isArray(sources) && sources.length > 0 && sources.every((source) => source === 'playtest-the-void');
    if (!voidOnly) return true;
    const domainSlug = normalizeSlug(item?.domain_slug);
    const classSlug = normalizeSlug(item?.class_slug);
    let reason;
    if (collectionKey === 'domainCards' && domainSlug === 'blood') {
      reason = 'Blood domain beta cards are deferred until supported.';
    } else if (collectionKey === 'subclasses' && DEFERRED_CLASS_SLUGS.has(classSlug)) {
      reason = 'Blood Hunter and Summoner beta subclasses are deferred until supported.';
    }
    if (!reason) return true;
    exclusions.push({ key: `${collectionKey}/${item.slug ?? '<missing-slug>'}`, label: item.name ?? '', reason });
    return false;
  });
  return { payload: exclusions.length ? { ...payload, data } : payload, exclusions };
}

function normalizeSlug(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/^playtest-/, '') : '';
}
