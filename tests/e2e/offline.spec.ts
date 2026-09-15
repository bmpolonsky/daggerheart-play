import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';

test.setTimeout(120_000);

let origin: string;
let customImageUrl: string;
let online = true;
let failAudio = false;
let failImage = false;
let failShell = false;
let title = 'Daggerheart Play';
const basePath = (process.env.OFFLINE_TEST_BASE ?? '').replace(/\/$/, '');
// A real HTTP server lets tests cut off worker-owned traffic too, without
// relying on browser offline emulation or interception of SW responses.
const server = createServer(async (request, response) => {
  if (!online) { request.socket.destroy(); return; }
  const pathname = new URL(request.url!, 'http://localhost').pathname;
  if (pathname === '/offline-test-audio.mp3') {
    response.writeHead(failAudio ? 503 : 200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', Vary: 'Accept' });
    response.end(failAudio ? 'Unavailable' : '0123456789');
    return;
  }
  const path = pathname.slice(basePath.length);
  if (failShell && path === '/data/adversaries.json') { response.writeHead(503).end(); return; }
  const relative = path === '/' ? 'index.html' : path.slice(1);
  if (relative.includes('..')) { response.writeHead(400).end(); return; }
  try {
    const body = await readFile(resolve(process.env.OFFLINE_TEST_DIST ?? 'dist', relative));
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
    response.writeHead(200, { 'Content-Type': types[extname(relative)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(relative === 'index.html' ? body.toString().replace('<title>Daggerheart Play</title>', `<title>${title}</title>`) : body);
  } catch { response.writeHead(404).end(); }
});

const mediaServer = createServer((request, response) => {
  if (!online) { request.socket.destroy(); return; }
  if (failImage) {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
    response.end('<html>Missing image fallback</html>');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  response.end('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>');
});

test.beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}${basePath}`;
  await new Promise<void>((resolve) => mediaServer.listen(0, '127.0.0.1', resolve));
  customImageUrl = `http://127.0.0.1:${(mediaServer.address() as { port: number }).port}/custom-adversary.svg`;
});
test.beforeEach(() => { online = true; failAudio = false; failImage = false; failShell = false; title = 'Daggerheart Play'; });
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  mediaServer.closeAllConnections();
  await new Promise<void>((resolve) => mediaServer.close(() => resolve()));
});

test('default cache stays fresh; explicit preparation launches offline and disable restores updates', async ({ page, context }) => {
  await page.goto(`${origin}/`);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByRole('button', { name: 'Подготовить офлайн', exact: true })).toHaveCount(0);
  await page.goto(`${origin}/#/library/settings/game`);
  await expect(page.getByRole('checkbox', { name: /Все иллюстрации справочника/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Подготовить офлайн', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Офлайн', exact: true }).getByRole('status')).toHaveText('Офлайн включён', { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cacheNames = await page.evaluate(() => caches.keys());
  const cacheName = cacheNames.find((name) => !name.endsWith(':state') && !name.endsWith(':runtime-v1'))!;
  const cachedPaths = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname), cacheName);
  expect(cachedPaths.filter((path) => path.includes('/image/')).length).toBeLessThan(10);
  online = false;
  await page.close();
  const offlinePage = await context.newPage();
  const response = await offlinePage.goto(`${origin}/?offline-check=1`);
  expect(response?.fromServiceWorker()).toBe(true);
  await offlinePage.getByRole('button', { name: 'Открыть игру', exact: true }).click();
  await expect(offlinePage.locator('[data-vtt-root]')).toBeVisible();
  await offlinePage.reload();
  await expect(offlinePage.locator('[data-vtt-root]')).toBeVisible();
  // Unknown assets must not receive the cached HTML fallback.
  expect(await offlinePage.evaluate((url) => fetch(url).then(() => true, () => false), `${origin}/missing.json`)).toBe(false);
  await offlinePage.goto(`${origin}/#/library/settings/game`);
  online = true;
  await offlinePage.getByRole('button', { name: 'Отключить офлайн', exact: true }).click();
  await expect(offlinePage.getByRole('status')).toContainText('Офлайн отключён');
  expect((await offlinePage.evaluate(() => caches.keys())).every((name) => name.endsWith(':runtime-v1'))).toBe(true);
  title = 'Fresh online version';
  await offlinePage.goto(`${origin}/`);
  await expect(offlinePage).toHaveTitle('Fresh online version');
  await expect(offlinePage.getByRole('button', { name: 'Открыть игру', exact: true })).toBeVisible();
});

test('selected media survives offline; a failed refresh preserves the complete previous cache', async ({ page }) => {
  const document = createPopulatedGameDocument();
  document.files['data/characters.json'].entities['e2e-character-cadsuane'].portraitUrl = '/image/subclass/small/troubadour.avif';
  document.files['content/custom-adversaries.json'] = [{ id: 'offline-custom', name: 'Офлайн-страж', image_url: customImageUrl }];
  const scene = Object.values(document.files['data/scene-table.json'].scenes)[0];
  // Root-relative media sits outside the worker scope in the nested-base run.
  scene.music.sourceUrl = '/offline-test-audio.mp3';
  scene.music.deliveryMode = 'download';
  await page.goto(`${origin}/#/game`);
  await importGameDocument(page, document);
  await page.goto(`${origin}/#/library/settings/game`);
  await page.getByRole('button', { name: 'Подготовить офлайн', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Офлайн', exact: true }).getByRole('status')).toHaveText('Офлайн включён', { timeout: 60_000 });
  const before = await page.evaluate(() => caches.keys());
  expect(await page.evaluate(async (url) => Boolean(await caches.match(url)), `${origin}/image/subclass/troubadour.webp`)).toBe(true);
  expect(await page.evaluate(async (url) => Boolean(await caches.match(url)), customImageUrl)).toBe(false);
  failShell = true;
  await page.getByRole('button', { name: 'Подготовить офлайн', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('adversaries.json', { timeout: 60_000 });
  expect(await page.evaluate(() => caches.keys())).toEqual(before);
  online = false;
  await page.reload();
  const audio = await page.evaluate(async (url) => {
    const response = await fetch(url, { headers: { Range: 'bytes=2-5', Accept: 'audio/*' } });
    return { status: response.status, range: response.headers.get('content-range'), body: await response.text() };
  }, new URL('/offline-test-audio.mp3', origin).href);
  expect(audio).toEqual({ status: 206, range: 'bytes 2-5/10', body: '2345' });
  await page.goto(`${origin}/#/game`);
  const portrait = page.getByRole('region', { name: 'Игровая сцена', exact: true }).getByRole('button', { name: 'Кадсуанэ', exact: true }).locator('img');
  await expect(portrait).toHaveAttribute('src', `${origin}/image/subclass/troubadour.webp`);
  expect(await portrait.evaluate(async (image: HTMLImageElement) => {
    await image.decode();
    return image.naturalWidth > 0;
  })).toBe(true);
});

test('unavailable media is skipped, reported after reopening, and can be retried', async ({ page, context }) => {
  const document = createPopulatedGameDocument();
  document.files['data/characters.json'].entities['e2e-character-cadsuane'].portraitUrl = customImageUrl;
  Object.values(document.files['data/scene-table.json'].scenes)[0].music.sourceUrl = '/offline-test-audio.mp3';
  await page.goto(`${origin}/#/game`);
  await importGameDocument(page, document);
  await page.goto(`${origin}/#/library/settings/game`);
  failAudio = true;
  failImage = true;
  await page.getByRole('button', { name: 'Подготовить офлайн', exact: true }).click();
  const region = page.getByRole('region', { name: 'Офлайн', exact: true });
  await expect(region.getByRole('status')).toHaveText('Офлайн включён', { timeout: 60_000 });
  await expect(region).toContainText('Не сохранено файлов: 2');
  await expect(region.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(async (url) => Boolean(await caches.match(url)), customImageUrl)).toBe(false);
  online = false;
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`${origin}/#/game`);
  await expect(reopened.locator('[data-vtt-root]')).toBeVisible();
  await reopened.goto(`${origin}/#/library/settings/game`);
  await expect(reopened.getByRole('region', { name: 'Офлайн', exact: true })).toContainText('Не сохранено файлов: 2');
  online = true;
  failAudio = false;
  failImage = false;
  await reopened.getByRole('button', { name: 'Подготовить офлайн', exact: true }).click();
  await expect(reopened.getByRole('button', { name: 'Подготовить офлайн', exact: true })).toBeEnabled({ timeout: 60_000 });
  await expect(reopened.getByRole('region', { name: 'Офлайн', exact: true })).not.toContainText('Не сохранено файлов');
  online = false;
  await reopened.reload();
  expect(await reopened.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth;
  }, customImageUrl)).toBe(8);
});

test('two master windows sync the offline board while keeping panels independent', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/#/game`);
  await importGameDocument(page, createPopulatedGameDocument());
  await page.goto(`${origin}/#/library/settings/game`);
  await page.getByRole('button', { name: 'Подготовить офлайн', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Офлайн', exact: true }).getByRole('status')).toHaveText('Офлайн включён', { timeout: 60_000 });

  online = false;
  await page.goto(`${origin}/#/game`);
  await page.reload();
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1440, height: 900 });
  expect((await screen.goto(`${origin}/#/game`))?.fromServiceWorker()).toBe(true);
  // Prove that uncached requests from both windows cannot reach the server.
  for (const window of [page, screen]) {
    expect(await window.evaluate((url) => fetch(url).then(() => true, () => false), `${origin}/offline-network-probe`)).toBe(false);
    await expect(window.locator('.player-view--gm')).toBeVisible();
    if (await window.getByRole('button', { name: /^Открыть чат/ }).count()) {
      await window.getByRole('button', { name: /^Открыть чат/ }).click();
    }
    await expect(window.getByLabel('Чат игры')).toBeVisible();
    await expect(window.getByLabel('Инструменты сцены')).toBeVisible();
  }
  await screen.getByRole('button', { name: /^Скрыть чат/ }).click();
  await screen.getByRole('button', { name: 'Скрыть панель мастера', exact: true }).click();
  await expect(screen.locator('.player-view--gm')).toHaveClass(/player-view--focus/);
  await expect(page.getByLabel('Чат игры')).toBeVisible();
  await expect(page.getByLabel('Инструменты сцены')).toBeVisible();

  const token = page.getByRole('region', { name: 'Игровая сцена', exact: true }).getByRole('button', { name: 'Кадсуанэ', exact: true });
  const screenToken = screen.getByRole('region', { name: 'Игровая сцена', exact: true }).getByRole('button', { name: 'Кадсуанэ', exact: true });
  const position = (target: typeof token) => target.evaluate((element) => ({ left: element.style.left, top: element.style.top }));
  const before = await position(token);
  await expect.poll(() => position(screenToken)).toEqual(before);
  const box = await token.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2 + 60, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => position(token)).not.toEqual(before);
  await expect.poll(() => position(screenToken)).toEqual(await position(token));
  await expect(screen.locator('.player-view--gm')).toHaveClass(/player-view--focus/);
  await expect(page.getByLabel('Чат игры')).toBeVisible();
  await expect(page.getByLabel('Инструменты сцены')).toBeVisible();
});

test('optional compendium artwork is fully cached and the choice survives reopening', async ({ page, context }) => {
  const document = createPopulatedGameDocument();
  const customIconUrl = new URL('/domain.svg', customImageUrl).href;
  document.files['content/custom-adversaries.json'] = [{ id: 'offline-custom', name: 'Офлайн-страж', image_url: customImageUrl }];
  document.files['content/custom-card-domains.json'] = [{ id: 'offline-domain', name: 'Офлайн-домен', color: '#123456', source: 'custom', icon: customIconUrl }];
  await page.goto(`${origin}/#/game`);
  await importGameDocument(page, document);
  await page.goto(`${origin}/#/library/settings/game`);
  const artwork = JSON.parse(await readFile(resolve(process.env.OFFLINE_TEST_DIST ?? 'dist', 'offline-artwork.json'), 'utf8')) as { files: string[]; bytes: number };
  expect(artwork.files.length).toBeGreaterThan(10);
  await expect(page.getByRole('region', { name: 'Офлайн', exact: true })).toContainText('МБ');
  await page.getByRole('checkbox', { name: /Все иллюстрации справочника/ }).check();
  await page.getByRole('button', { name: 'Подготовить офлайн', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Офлайн', exact: true }).getByRole('status')).toHaveText('Офлайн включён', { timeout: 90_000 });
  const savedPaths = await page.evaluate(async () => {
    const names = await caches.keys();
    const name = names.find((entry) => !entry.endsWith(':state') && !entry.endsWith(':runtime-v1'))!;
    return (await (await caches.open(name)).keys()).map((request) => request.url);
  });
  expect(artwork.files.every((path) => savedPaths.includes(`${origin}/${path}`))).toBe(true);
  expect(savedPaths).toContain(customImageUrl);
  expect(savedPaths).toContain(customIconUrl);
  online = false;
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`${origin}/#/library/settings/game`);
  await expect(reopened.getByRole('checkbox', { name: /Все иллюстрации справочника/ })).toBeChecked();
  const imageUrl = `${origin}/${artwork.files.at(-1)}`;
  expect(await reopened.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth > 0;
  }, imageUrl)).toBe(true);
  for (const url of [customImageUrl, customIconUrl]) {
    expect(await reopened.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image.naturalWidth;
    }, url)).toBe(8);
  }
});
