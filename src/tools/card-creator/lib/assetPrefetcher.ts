const loaded = new Set<string>();

function canPrefetch(url: string | null | undefined) {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return false;
  if (trimmed.startsWith("<")) return false;
  return true;
}

export function prefetchImages(urls: Array<string | null | undefined>) {
  urls.forEach((url) => {
    if (!canPrefetch(url)) return;
    const normalized = url!;
    if (loaded.has(normalized)) return;

    loaded.add(normalized);
    const img = new Image();
    img.src = normalized;
  });
}
