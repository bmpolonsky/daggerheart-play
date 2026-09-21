import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const script = fileURLToPath(new URL('../../scripts/cache-daggerheart-data.mjs', import.meta.url));
const emblem = '/image/domain/emblems/blood.svg';

test('content caching tolerates only missing inferred assets and preserves cached files', async (t) => {
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
  for (const scenario of [
    { name: 'inferred class and domain assets may be absent', status: 404, success: true },
    { name: 'explicit API references remain required', status: 404, explicit: true, success: false },
    { name: 'server failures remain fatal', status: 500, success: false },
    { name: 'cached asset survives a failed refresh', status: 404, cached: true, success: true },
    { name: 'fixed application assets remain required', status: 404, fixed: true, success: false }
  ]) {
    await t.test(scenario.name, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'daggerheart-cache-test-'));
      const requests = new Set();
      const missing = scenario.fixed ? '/font/roboto.woff2' : emblem;
      const server = createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        requests.add(pathname);
        if (pathname.startsWith('/api/')) {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ result: 'ok', data: [{
            slug: 'sample', name: 'Sample',
            ...(scenario.fixed ? {} : scenario.cached ? { domain_slugs: ['blood'] } : {
              class_slug: 'playtest-blood-hunter', domain_slug: 'blood', domain_slugs: ['blood']
            }),
            ...(scenario.explicit ? { image_url: emblem } : {})
          }] }));
        } else if (pathname === missing || (!scenario.fixed && /\/(blood|blood-hunter)\./.test(pathname))) {
          response.writeHead(scenario.status).end();
        } else {
          response.end(image);
        }
      });
      try {
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const cachedPath = join(directory, 'public', emblem);
        if (scenario.cached) {
          await mkdir(dirname(cachedPath), { recursive: true });
          await writeFile(cachedPath, '<svg>cached</svg>');
        }
        const child = spawn(process.execPath, [script], {
          cwd: directory,
          env: { ...process.env, CONTENT_SOURCE: `http://127.0.0.1:${server.address().port}`,
            CONTENT_REFRESH: '1', CONTENT_REFRESH_ASSETS: '1', CONTENT_REVIEW_ONLY: '0', CONTENT_REFRESH_REPORT: '' },
          stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        child.stdout.on('data', (chunk) => { output += chunk; });
        child.stderr.on('data', (chunk) => { output += chunk; });
        const [code] = await once(child, 'close');
        assert.equal(code, scenario.success ? 0 : 1, output);
        if (scenario.status === 500) {
          // Parallel downloads may fail before the emblem request starts.
          assert.match(output, /Failed to download .* \(500\)/);
        } else {
          assert.ok(requests.has(missing), output);
        }
        if (scenario.cached) {
          assert.equal(await readFile(cachedPath, 'utf8'), '<svg>cached</svg>');
          assert.match(output, /Using cached asset/);
        } else if (scenario.success) {
          assert.match(output, /Skipping missing optional asset/);
          for (const pathname of ['/image/class/banner/blood-hunter.avif', '/image/domain/divider/blood.avif']) {
            assert.ok(requests.has(pathname), pathname);
          }
        }
        if (scenario.success) {
          const manifest = JSON.parse(await readFile(join(directory, 'public/data/manifest.json'), 'utf8'));
          assert.equal(manifest.collections.length, 10);
        }
      } finally {
        await new Promise((resolve) => server.close(resolve));
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});
