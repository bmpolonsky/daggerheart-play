export function publicAssetUrl(input: string, basePath = configuredBasePath()): string {
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

function configuredBasePath(): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  if (!base || base === '/' || base === './') return '';
  return base.replace(/\/+$/, '');
}

function normalizeSameOriginPublicImageUrl(input: string, basePath: string): string {
  const url = new URL(input);
  const normalizedBase = basePath.replace(/\/+$/, '');
  if (typeof window === 'undefined') {
    const baseImageRoot = normalizedBase ? `${normalizedBase}/image/` : '';
    return baseImageRoot && url.pathname.startsWith(baseImageRoot) ? normalizePublicImageUrl(url).href : input;
  }
  if (url.origin !== window.location.origin) return input;
  const imageRoot = normalizedBase ? `${normalizedBase}/image/` : '/image/';
  const isPublicImage = url.pathname.startsWith(imageRoot) || (!normalizedBase && url.pathname.includes('/image/'));
  return isPublicImage ? normalizePublicImageUrl(url).href : input;
}

function normalizePublicImageUrl(url: URL): URL {
  url.pathname = url.pathname.replace(/(\/image\/.+)\.(?:avif|jpe?g|png)$/i, '$1.webp');
  return url;
}
