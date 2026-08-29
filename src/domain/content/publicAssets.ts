export function publicAssetUrl(input: string, basePath = configuredBasePath()): string {
  if (!input || /^(blob:|data:)/i.test(input)) return input;
  const portablePath = portablePublicAssetPath(input, basePath);
  if (/^https?:\/\//i.test(portablePath)) return portablePath;
  const normalizedBase = basePath.replace(/\/+$/, '');
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const cleanedPath = portablePath.replace(/^\.\//, '');
  const baseSegment = normalizedBase.replace(/^\/+/, '');
  if (baseSegment && (cleanedPath.startsWith(`${normalizedBase}/`) || cleanedPath.startsWith(`${baseSegment}/`))) {
    return normalizePublicImageUrl(new URL(cleanedPath.startsWith('/') ? cleanedPath : `/${cleanedPath}`, origin)).href;
  }
  const relativePath = cleanedPath.startsWith('/') ? cleanedPath.slice(1) : cleanedPath;
  const baseHref = `${origin}${normalizedBase}/`;
  return normalizePublicImageUrl(new URL(relativePath, baseHref)).href;
}

export function portablePublicAssetPath(input: string, basePath = configuredBasePath()): string {
  if (!input || /^(blob:|data:|asset:)/i.test(input)) return input;
  const normalizedBase = basePath.replace(/\/+$/, '');
  const absolute = /^https?:\/\//i.test(input);
  const url = absolute ? new URL(input) : null;
  const pathname = url?.pathname ?? input.split(/[?#]/, 1)[0];
  const suffix = publicImageSuffix(
    pathname,
    normalizedBase,
    !url || url.origin === currentOrigin(),
    url?.hostname === 'bmpolonsky.github.io'
  );
  if (!suffix) return input;
  const trailing = url ? `${url.search}${url.hash}` : input.slice(pathname.length);
  return normalizePublicImageExtension(`.${suffix}${trailing}`);
}

function configuredBasePath(): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  if (!base || base === '/' || base === './') return '';
  return base.replace(/\/+$/, '');
}

function currentOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
}

function publicImageSuffix(pathname: string, basePath: string, sameOrigin: boolean, legacyDeployment: boolean): string | null {
  const normalizedPath = `/${pathname.replace(/^\.?\/+/, '')}`;
  const roots = ['/image/', ...(basePath ? [`${basePath}/image/`] : [])];
  const root = (sameOrigin ? roots.find((candidate) => normalizedPath.startsWith(candidate)) : null) ??
    ((sameOrigin || legacyDeployment) && normalizedPath.startsWith('/daggerheart-play/image/') ? '/daggerheart-play/image/' : null);
  if (!root) return null;
  return `/image/${normalizedPath.slice(root.length)}`;
}

function normalizePublicImageUrl(url: URL): URL {
  url.pathname = normalizePublicImageExtension(url.pathname);
  return url;
}

function normalizePublicImageExtension(value: string): string {
  return value.replace(/(\/image\/.+)\.(?:avif|jpe?g|png)([?#].*)?$/i, '$1.webp$2');
}
