import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';

test.setTimeout(120_000);

let server: ViteDevServer;
let origin: string;
let mediaAvailable = true;
let version = 'First dev version';

test.beforeAll(async () => {
  server = await createServer({
    base: '/',
    server: { host: 'localhost', port: 0, open: false },
    plugins: [{
      name: 'offline-dev-test',
      transformIndexHtml: (html) => html.replace('<title>Daggerheart Play</title>', `<title>${version}</title>`),
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          const path = request.url?.split('?')[0];
          if (!path?.startsWith('/offline-dev-test.')) return next();
          response.setHeader('Cache-Control', 'no-store');
          if (path.endsWith('.js')) {
            response.setHeader('Content-Type', 'text/javascript');
            response.end(`export default ${JSON.stringify(version)}`);
          } else {
            response.statusCode = mediaAvailable ? 200 : 503;
            response.setHeader('Content-Type', path.endsWith('.svg') ? 'image/svg+xml' : 'audio/mpeg');
            response.end(path.endsWith('.svg')
              ? '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'
              : '0123456789');
          }
        });
      }
    }]
  });
  await server.listen();
  origin = server.resolvedUrls!.local[0].replace(/\/$/, '');
});
test.afterAll(async () => { await server?.close(); });

test('dev prepares real media, keeps code fresh, restores the indicator and disables the copy', async ({ page }, testInfo) => {
  const document = createPopulatedGameDocument();
  document.files['data/characters.json'].entities['e2e-character-cadsuane'].portraitUrl = `${origin}/offline-dev-test.svg`;
  // A misconfigured media URL must never put JavaScript into the prepared cache.
  document.files['data/characters.json'].entities['e2e-character-ran'].portraitUrl = `${origin}/offline-dev-test.js`;
  Object.values(document.files['data/scene-table.json'].scenes)[0].music.sourceUrl = `${origin}/offline-dev-test.mp3`;
  await page.goto(`${origin}/#/game`);
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  await importGameDocument(page, document);
  await page.goto(`${origin}/#/library/settings/game`);
  const settings = page.getByRole('region', { name: 'Офлайн', exact: true });
  await expect(settings).toContainText('Код приложения всегда загружается с dev-сервера');
  await expect(settings.getByRole('button', { name: 'Подготовить офлайн', exact: true })).toBeEnabled();
  const artwork = await (await page.request.get(`${origin}/offline-artwork.json`)).json();
  expect(artwork.files).toContain('image/subclass/stalwart.webp');
  expect(artwork.bytes).toBeGreaterThan(0);
  await settings.getByRole('button', { name: 'Подготовить офлайн', exact: true }).click();
  await expect(settings.getByRole('status')).toHaveText('Офлайн включён', { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${origin}/offline-sw.js?media-only=1`);
  const cachedPaths = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => !name.endsWith(':state'));
    const requests = (await Promise.all(names.map(async (name) => (await caches.open(name)).keys()))).flat();
    return requests.map((request) => new URL(request.url).pathname);
  });
  expect(cachedPaths).toContain('/offline-dev-test.svg');
  expect(cachedPaths).toContain('/offline-dev-test.mp3');
  expect(cachedPaths).toContain('/font/overpass.woff2');
  expect(cachedPaths.some((path) => /\.(?:html|[cm]?js|css|json|wasm)$/.test(path))).toBe(false);
  await expect(settings).toContainText('Не сохранено файлов: 1');
  mediaAvailable = false;
  version = 'Updated dev version';
  const read = (path: string) => page.evaluate(async (url) => {
    const response = await fetch(url);
    return { status: response.status, text: await response.text() };
  }, `${origin}${path}`);
  expect((await read('/offline-dev-test.svg')).text).toContain('<svg');
  expect(await read('/offline-dev-test.mp3')).toEqual({ status: 200, text: '0123456789' });
  expect((await read('/offline-dev-test.js')).text).toContain('Updated dev version');
  await page.goto(`${origin}/#/game`);
  await page.reload();
  await expect(page).toHaveTitle('Updated dev version');
  await expect(page.getByRole('button', { name: 'Офлайн-копия', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Офлайн-копия', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Офлайн-копия', exact: true });
  await expect(dialog).not.toContainText('даже когда есть интернет');
  await page.screenshot({ path: testInfo.outputPath('offline-dev-dialog.png') });
  await dialog.getByRole('button', { name: 'Отключить офлайн', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Офлайн отключён');
  await expect(page.getByRole('button', { name: 'Офлайн-копия', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
  expect((await read('/offline-dev-test.svg')).status).toBe(503);
});
