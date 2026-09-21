/* Normal browsing: fresh HTML, cached static resources, no API traffic.
   Explicit offline preparation pins one complete application version. */
const mediaOnly = new URL(self.location.href).searchParams.get('media-only') === '1';
const prefix = `daggerheart-offline:${self.registration.scope}:${mediaOnly ? 'media:' : ''}`;
const stateCache = `${prefix}state`;
const stateUrl = new URL('offline-state', self.registration.scope).href;
const runtimeCache = `${prefix}runtime-v1`;
const MAX_RUNTIME_ENTRIES = 120;
let operation = Promise.resolve();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  const port = event.ports[0];
  if (!port || !event.source?.url?.startsWith(self.registration.scope)) return;
  if (event.data?.type !== 'prepare' && event.data?.type !== 'disable') return;
  // Writes belong to the worker: preparation survives closing its settings tab,
  // and WebKit retains these entries after the last page releases its caches.
  operation = operation.then(async () => {
    try {
      let skippedMedia = 0;
      if (event.data.type === 'prepare') skippedMedia = await prepare(event.data, port);
      else {
        await caches.delete(stateCache);
        await cleanPreparedCaches();
      }
      port.postMessage({ done: true, skippedMedia });
    } catch (error) {
      port.postMessage({ error: error.name === 'QuotaExceededError' ? 'Недостаточно места для офлайн-копии.' : error.message });
    } finally { port.close(); }
  });
  event.waitUntil(operation);
});

async function prepare({ urls, requiredUrls = urls, html, includeArtwork, missingLocalFiles = 0 }, port) {
  if (!Array.isArray(urls) || !urls.every((url) => typeof url === 'string' && /^https?:\/\//.test(url)) || typeof html !== 'string') {
    throw new Error('Некорректный список файлов для подготовки.');
  }
  if (!Array.isArray(requiredUrls) || !requiredUrls.every((url) => urls.includes(url)) || !Number.isSafeInteger(missingLocalFiles) || missingLocalFiles < 0) {
    throw new Error('Некорректный список обязательных файлов.');
  }
  const required = new Set(requiredUrls);
  let skippedMedia = missingLocalFiles;
  const cacheName = `${prefix}${crypto.randomUUID()}`;
  const cache = await caches.open(cacheName);
  let committed = false;
  try {
    for (const [index, url] of urls.entries()) {
      port.postMessage({ completed: index + 1, total: urls.length });
      let response;
      try {
        response = !mediaOnly && url === new URL('index.html', self.registration.scope).href
        ? new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        : await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60_000) }).catch(() => {
          throw new Error(`Не удалось скачать файл: ${new URL(url).pathname}. Проверьте доступ к нему и повторите подготовку.`);
        });
        if (!response.ok || response.status === 206 || (url !== new URL('index.html', self.registration.scope).href && response.headers.get('content-type')?.includes('text/html'))) {
          throw new Error(`Не удалось сохранить файл: ${new URL(url).pathname}`);
        }
        if (mediaOnly && !/^(?:(?:image|audio|video|font)\/|application\/(?:font-|vnd\.ms-fontobject|x-font-))/i.test(response.headers.get('content-type') ?? '')) {
          throw new Error(`Ожидался медиафайл: ${new URL(url).pathname}`);
        }
      } catch (error) {
        if (required.has(url)) throw error;
        skippedMedia += 1;
        continue;
      }
      // Storage/quota failures are fatal even for media: do not claim a usable copy.
      await cache.put(url, response);
    }
    await (await caches.open(stateCache)).put(stateUrl, new Response(JSON.stringify({ cacheName, includeArtwork: includeArtwork === true, skippedMedia })));
    committed = true;
    await cleanPreparedCaches(cacheName).catch(() => undefined);
    return skippedMedia;
  } finally {
    if (!committed) await caches.delete(cacheName);
  }
}

async function cleanPreparedCaches(keep) {
  for (const name of await caches.keys()) {
    if (name.startsWith(prefix) && ![keep, stateCache, runtimeCache].includes(name)) await caches.delete(name);
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.cache === 'no-store') return;
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate') {
    const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
    if (!/^(?:index\.html|(?:game|join|tools|library|calls)(?:\/.*)?)?$/.test(path)) return;
  }
  if (url.origin === self.location.origin && /\/(?:offline-sw\.js|offline-manifest\.json)$/.test(url.pathname)) {
    return;
  }
  event.respondWith(readPrepared(event.request)
    .then((response) => response || (mediaOnly ? fetch(event.request) : readRuntime(event)))
    .catch(() => fetch(event.request))); // Unavailable storage must not break online browsing.
});

async function readPrepared(request) {
  if (!await caches.has(stateCache)) return;
  const state = await (await caches.open(stateCache)).match(stateUrl);
  if (!state) return;
  const { cacheName } = await state.json();
  const cache = await caches.open(cacheName);
  const key = request.mode === 'navigate' && request.url.startsWith(self.registration.scope)
    ? new URL('index.html', self.registration.scope).href
    : request;
  // Preparation is a deliberate snapshot of these URLs. Browser-added headers
  // (e.g. Origin on a media request) must not hide a saved Vary: Origin response.
  const response = await cache.match(key, { ignoreVary: true });
  return response && partialResponse(request, response);
}

async function readRuntime(event) {
  const request = event.request;
  const url = new URL(request.url);
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  const navigation = request.mode === 'navigate';
  // Explicitly prepared URLs may live outside scope; ordinary caching may not.
  if (!url.href.startsWith(self.registration.scope) || (!navigation && !/^(?:assets|data|font|icon|image)\//.test(path) && path !== 'favicon.svg')) {
    return fetch(request);
  }
  const cache = await caches.open(runtimeCache);
  const key = navigation ? new URL('index.html', self.registration.scope).href : request;
  const cached = await cache.match(key);
  // Hashed build outputs are immutable. Other static files refresh in background.
  if (cached && path.startsWith('assets/')) return partialResponse(request, cached);
  const network = fetch(request).then(async (response) => {
    if (response.ok && response.status !== 206 && !/no-store/i.test(response.headers.get('cache-control') ?? '') && (navigation || !response.headers.get('content-type')?.includes('text/html'))) {
      try {
        await cache.put(key, response.clone());
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES))) await cache.delete(old);
      } catch { /* Cache eviction/quota must never prevent an online response. */ }
    }
    return response;
  });
  event.waitUntil(network.then(() => undefined, () => undefined));
  if (!navigation && cached) return partialResponse(request, cached);
  try { return await network; }
  catch (error) { if (cached) return partialResponse(request, cached); throw error; }
}

async function partialResponse(request, response) {
  if (!request.headers.has('range')) return response;
  // Audio/video seek requests need a partial response, including Safari playback.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range'));
  if (!range || (!range[1] && !range[2])) return response;
  const body = await response.arrayBuffer();
  const start = range[1] ? Number(range[1]) : Math.max(0, body.byteLength - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), body.byteLength - 1) : body.byteLength - 1;
  if (start > end || start >= body.byteLength) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${body.byteLength}` } });
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.set('Content-Range', `bytes ${start}-${end}/${body.byteLength}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}
