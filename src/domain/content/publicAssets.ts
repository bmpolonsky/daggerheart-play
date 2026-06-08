export function publicAssetUrl(input: string, basePath = currentBasePath()): string {
  if (!input || /^(blob:|data:)/i.test(input)) return input;
  if (/^https?:\/\//i.test(input)) return normalizeSameOriginPublicImageUrl(input, basePath);
  const normalizedBase = basePath.replace(/\/+$/, '');
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const cleanedPath = input.replace(/^\.\//, '');
  const baseSegment = normalizedBase.replace(/^\/+/, '');
  if (baseSegment && (cleanedPath.startsWith(`${normalizedBase}/`) || cleanedPath.startsWith(`${baseSegment}/`))) {
    return normalizePublicImageUrl(new URL(cleanedPath.startsWith('/') ? cleanedPath : `/${cleanedPath}`, origin)).href;
  }
  const relativePath = cleanedPath.startsWith('/') ? cleanedPath.slice(1) : cleanedPath;
  const baseHref = `${origin}${normalizedBase}/`;
  return normalizePublicImageUrl(new URL(relativePath, baseHref)).href;
}

function currentBasePath(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname
    .replace(/\/(?:gm|player|join|calls)(?:\/[^/]+)?\/?$/, '')
    .replace(/\/$/, '');
}

function normalizeSameOriginPublicImageUrl(input: string, basePath: string): string {
  if (typeof window === 'undefined') return input;
  const url = new URL(input);
  if (url.origin !== window.location.origin) return input;
  const normalizedBase = basePath.replace(/\/+$/, '');
  const imageRoot = normalizedBase ? `${normalizedBase}/image/` : '/image/';
  return url.pathname.startsWith(imageRoot) ? normalizePublicImageUrl(url).href : input;
}

function normalizePublicImageUrl(url: URL): URL {
  url.pathname = url.pathname.replace(/(\/image\/.+)\.(?:jpe?g|png)$/i, '$1.webp');
  return url;
}
