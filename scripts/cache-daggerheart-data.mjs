import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const BASE_URL = (process.env.CONTENT_SOURCE ?? 'https://daggerheart.su').replace(/\/+$/, '');
const LANGUAGE = process.env.CONTENT_LANG ?? 'ru';
const SHOULD_REFRESH = process.env.CONTENT_REFRESH === '1';
const CACHE_TTL_HOURS = Number(process.env.CONTENT_CACHE_TTL_HOURS ?? '24');
const WEBP_QUALITY = clampNumber(Number(process.env.CONTENT_WEBP_QUALITY ?? '85'), 1, 100);
const WEBP_MAX_SIDE = clampNumber(Number(process.env.CONTENT_WEBP_MAX_SIDE ?? '1200'), 1, 10000);
const PUBLIC_DIR = resolve('public');
const DATA_DIR = resolve(PUBLIC_DIR, 'data');
const CSS_FILES = [];

const COLLECTIONS = [
  { key: 'adversaries', endpoint: 'adversary', file: 'adversaries.json', required: true, assets: true },
  { key: 'classes', endpoint: 'class', file: 'classes.json', required: false, assets: true },
  { key: 'rules', endpoint: 'rule', file: 'rules.json', required: false, assets: false },
  { key: 'environments', endpoint: 'environment', file: 'environments.json', required: false, assets: true },
  { key: 'beastforms', endpoint: 'beastform', file: 'beastforms.json', required: false, assets: false },
  { key: 'ancestries', endpoint: 'ancestry', file: 'ancestries.json', required: false, assets: true },
  { key: 'communities', endpoint: 'community', file: 'communities.json', required: false, assets: true },
  { key: 'subclasses', endpoint: 'subclass', file: 'subclasses.json', required: false, assets: true },
  { key: 'domainCards', endpoint: 'domain-card', file: 'domain-cards.json', required: false, assets: true },
  { key: 'equipment', endpoint: 'equipment', file: 'equipment.json', required: false, assets: true }
];

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  if (!(await fileExists(path))) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function isUsablePayload(payload) {
  return payload?.result === 'ok' && Array.isArray(payload?.data) && payload.data.length > 0;
}

function isFreshPayload(payload) {
  if (SHOULD_REFRESH) return false;
  if (!Number.isFinite(CACHE_TTL_HOURS) || CACHE_TTL_HOURS <= 0) return true;
  const generatedAt = payload?.meta?.generatedAt;
  if (typeof generatedAt !== 'string') return false;
  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp < CACHE_TTL_HOURS * 60 * 60 * 1000;
}

function buildEndpointUrl(endpoint) {
  return `${BASE_URL}/api/${endpoint}?lang=${encodeURIComponent(LANGUAGE)}`;
}

function normalizeAssetPath(pathname) {
  if (!pathname || typeof pathname !== 'string') return null;
  if (/^https?:\/\//i.test(pathname)) {
    const url = new URL(pathname);
    return url.pathname;
  }
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function resolveDownloadUrl(pathname) {
  if (/^https?:\/\//i.test(pathname)) return pathname;
  const normalized = normalizeAssetPath(pathname);
  return normalized ? `${BASE_URL}${normalized}` : null;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return max;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isWebpConvertibleAsset(pathname) {
  return /\.(avif|png|jpe?g)$/i.test(pathname);
}

function webpAssetPath(pathname) {
  return pathname.replace(/\.(avif|png|jpe?g)$/i, '.webp');
}

function publicAssetPath(pathname) {
  const normalized = normalizeAssetPath(pathname);
  if (!normalized) return null;
  return isWebpConvertibleAsset(normalized) ? webpAssetPath(normalized) : normalized;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return await response.json();
}

async function downloadAsset(pathname) {
  const normalized = normalizeAssetPath(pathname);
  const url = resolveDownloadUrl(pathname);
  if (!normalized || !url) return;

  const targetNormalized = publicAssetPath(normalized);
  if (!targetNormalized) return;
  const targetPath = resolve(PUBLIC_DIR, `.${targetNormalized}`);
  const hasCachedTarget = await fileExists(targetPath);
  if (!SHOULD_REFRESH && hasCachedTarget) return;

  await ensureDir(dirname(targetPath));
  let response;
  try {
    response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ${url} (${response.status})`);
    }
  } catch (error) {
    if (hasCachedTarget) {
      console.warn(`Using cached asset ${targetNormalized}: ${String(error)}`);
      return;
    }
    throw error;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (isWebpConvertibleAsset(normalized)) {
    const webpBuffer = await sharp(buffer)
      .resize({ width: WEBP_MAX_SIDE, height: WEBP_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 6 })
      .toBuffer();
    await writeFile(targetPath, webpBuffer);
    return;
  }
  await writeFile(targetPath, buffer);
}

function rewriteCssUrls(cssText) {
  return cssText.replace(/url\((['"]?)\/(?!\/)/g, 'url($1./');
}

function collectUrlsFromCss(cssText) {
  const urls = new Set();
  const matches = cssText.matchAll(/url\(([^)]+)\)/g);
  for (const match of matches) {
    const raw = match[1].trim().replace(/^['"]|['"]$/g, '');
    if (!raw || raw.startsWith('data:') || /^https?:\/\//i.test(raw)) continue;
    urls.add(raw.startsWith('./') ? `/${raw.slice(2)}` : raw);
  }
  return urls;
}

async function cacheCssFiles() {
  for (const file of CSS_FILES) {
    const targetPath = resolve(PUBLIC_DIR, `.${file}`);
    let cssText = '';

    if (!SHOULD_REFRESH && (await fileExists(targetPath))) {
      cssText = await readFile(targetPath, 'utf8');
    } else {
      const response = await fetch(`${BASE_URL}${file}`);
      if (!response.ok) {
        throw new Error(`Failed to download ${BASE_URL}${file} (${response.status})`);
      }
      cssText = await response.text();
    }

    for (const assetUrl of collectUrlsFromCss(cssText)) {
      // eslint-disable-next-line no-await-in-loop
      await downloadAsset(assetUrl);
    }

    const rewrittenCss = rewriteCssUrls(cssText);
    if (SHOULD_REFRESH || !(await fileExists(targetPath)) || rewrittenCss !== cssText) {
      await ensureDir(PUBLIC_DIR);
      await writeFile(targetPath, rewrittenCss);
    }
  }
}

function collectAssetUrls(payload) {
  const items = Array.isArray(payload?.data) ? payload.data : [];
  const urls = new Set();

  for (const item of items) {
    if (typeof item?.image_url === 'string' && item.image_url.trim()) {
      urls.add(item.image_url);
    }
    if (typeof item?.image === 'string' && item.image.trim()) {
      urls.add(item.image);
    }
    if (typeof item?.domain_image_url === 'string' && item.domain_image_url.trim()) {
      urls.add(item.domain_image_url);
    }
    if (typeof item?.class_slug === 'string' && item.class_slug.trim()) {
      const classSlug = item.class_slug.replace(/^playtest-/, '');
      urls.add(`/image/class/divider/${classSlug}.avif`);
      urls.add(`/image/class/banner/${classSlug}.avif`);
    }
    if (typeof item?.domain_slug === 'string' && item.domain_slug.trim()) {
      const domainSlug = item.domain_slug.replace(/^playtest-/, '');
      urls.add(`/image/domain/divider/${domainSlug}.avif`);
      urls.add(`/image/domain/banner/${domainSlug}.avif`);
      urls.add(`/image/domain/emblems/${domainSlug}.svg`);
    }
    if (Array.isArray(item?.domain_slugs)) {
      for (const domainSlug of item.domain_slugs) {
        if (typeof domainSlug !== 'string' || !domainSlug.trim()) continue;
        urls.add(`/image/domain/emblems/${domainSlug.replace(/^playtest-/, '')}.svg`);
      }
    }
  }

  return urls;
}

function rewritePayloadAssetReferences(payload) {
  const items = Array.isArray(payload?.data) ? payload.data : [];
  return {
    ...payload,
    data: items.map((item) => {
      const nextItem = { ...item };
      if (typeof nextItem.image_url === 'string' && nextItem.image_url.trim()) {
        nextItem.image_url = publicAssetPath(nextItem.image_url) ?? nextItem.image_url;
      }
      if (typeof nextItem.image === 'string' && nextItem.image.trim()) {
        nextItem.image = publicAssetPath(nextItem.image) ?? nextItem.image;
      }
      if (typeof nextItem.domain_image_url === 'string' && nextItem.domain_image_url.trim()) {
        nextItem.domain_image_url = publicAssetPath(nextItem.domain_image_url) ?? nextItem.domain_image_url;
      }
      return nextItem;
    })
  };
}

async function loadCollection(collection) {
  const targetPath = resolve(DATA_DIR, collection.file);
  const cached = await readJson(targetPath);

  if (isUsablePayload(cached) && isFreshPayload(cached)) {
    const normalizedCached = rewritePayloadAssetReferences(cached);
    if (JSON.stringify(normalizedCached) !== JSON.stringify(cached)) {
      await ensureDir(dirname(targetPath));
      await writeFile(targetPath, JSON.stringify(normalizedCached, null, 2));
    }
    return {
      payload: normalizedCached,
      assetUrls: new Set()
    };
  }

  const sourceUrl = buildEndpointUrl(collection.endpoint);
  try {
    const payload = await fetchJson(sourceUrl);
    if (!isUsablePayload(payload)) {
      throw new Error(`Fetched ${collection.key} is empty or invalid`);
    }
    const sourceAssetUrls = collection.assets ? collectAssetUrls(payload) : new Set();
    const normalizedPayload = rewritePayloadAssetReferences({
      ...payload,
      meta: {
        ...(payload.meta ?? {}),
        key: collection.key,
        endpoint: collection.endpoint,
        sourceUrl,
        generatedAt: new Date().toISOString()
      }
    });
    await ensureDir(dirname(targetPath));
    await writeFile(targetPath, JSON.stringify(normalizedPayload, null, 2));
    console.log(`Cached ${collection.key}: ${Array.isArray(payload?.data) ? payload.data.length : 0} items`);
    return {
      payload: normalizedPayload,
      assetUrls: sourceAssetUrls
    };
  } catch (error) {
    if (isUsablePayload(cached)) {
      const normalizedCached = rewritePayloadAssetReferences(cached);
      if (JSON.stringify(normalizedCached) !== JSON.stringify(cached)) {
        await ensureDir(dirname(targetPath));
        await writeFile(targetPath, JSON.stringify(normalizedCached, null, 2));
      }
      console.warn(`Using cached ${collection.key}: ${String(error)}`);
      return {
        payload: normalizedCached,
        assetUrls: new Set()
      };
    }

    throw new Error(`No usable cache for ${collection.key}; refusing to write empty fallback: ${String(error)}`);
  }
}

async function main() {
  await ensureDir(DATA_DIR);
  await cacheCssFiles();

  const manifestPath = resolve(DATA_DIR, 'manifest.json');
  const manifest = {
    source: BASE_URL,
    language: LANGUAGE,
    generatedAt: new Date().toISOString(),
    collections: []
  };

  for (const collection of COLLECTIONS) {
    const { payload, assetUrls } = await loadCollection(collection);
    const count = Array.isArray(payload?.data) ? payload.data.length : 0;
    manifest.collections.push({
      key: collection.key,
      endpoint: collection.endpoint,
      file: collection.file,
      count,
      sourceUrl: buildEndpointUrl(collection.endpoint)
    });

    if (!collection.assets) continue;

    for (const assetUrl of assetUrls) {
      // eslint-disable-next-line no-await-in-loop
      await downloadAsset(assetUrl);
    }
  }

  for (const staticAsset of [
    '/font/roboto.woff2',
    '/font/eveleth-cyrillic.woff2',
    '/font/overpass.woff2',
    '/image/wip.avif',
    '/image/domain/stress-cost.avif',
    '/image/ancestry/divider.avif',
    '/image/community/divider.webp',
    '/image/domain/emblems/arcana.svg',
    '/image/domain/emblems/splendor.svg',
    '/image/domain/emblems/grace.svg',
    '/image/domain/emblems/valor.svg',
    '/image/domain/emblems/blade.svg',
    '/image/domain/emblems/codex.svg',
    '/image/domain/emblems/bone.svg',
    '/image/domain/emblems/sage.svg',
    '/image/domain/emblems/midnight.svg',
    '/image/domain/emblems/dread.svg'
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await downloadAsset(staticAsset);
  }

  const existingManifest = await readJson(manifestPath);
  if (!SHOULD_REFRESH && isEquivalentManifest(existingManifest, manifest)) {
    console.log('Using cached content manifest');
    return;
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

function isEquivalentManifest(left, right) {
  if (!left || left.source !== right.source || left.language !== right.language) return false;
  if (!Array.isArray(left.collections) || left.collections.length !== right.collections.length) return false;
  return right.collections.every((collection) => {
    const existing = left.collections.find((item) => item.key === collection.key);
    return (
      existing &&
      existing.endpoint === collection.endpoint &&
      existing.file === collection.file &&
      existing.count === collection.count &&
      existing.sourceUrl === collection.sourceUrl
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
