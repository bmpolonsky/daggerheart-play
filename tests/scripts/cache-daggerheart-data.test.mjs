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
import { createHash } from 'node:crypto';

const script = fileURLToPath(new URL('../../scripts/cache-daggerheart-data.mjs', import.meta.url));
const emblem = '/image/domain/emblems/sample-domain.svg';

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
      const reviewedFiles = ['adversaries.json', 'classes.json', 'rules.json', 'environments.json', 'beastforms.json', 'ancestries.json', 'communities.json', 'subclasses.json', 'domain-cards.json', 'equipment.json', 'manifest.json'];
      await mkdir(join(directory, 'public/data'), { recursive: true });
      for (const file of reviewedFiles) await writeFile(join(directory, 'public/data', file), JSON.stringify({ result: 'ok', data: [{ slug: 'reviewed' }] }));
      const missing = scenario.fixed ? '/font/roboto.woff2' : emblem;
      const server = createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        requests.add(pathname);
        if (pathname.startsWith('/api/')) {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ result: 'ok', data: [{
            slug: 'sample', name: 'Sample',
            ...(scenario.fixed ? {} : scenario.cached ? { domain_slugs: ['sample-domain'] } : {
              class_slug: 'playtest-sample-class', domain_slug: 'sample-domain', domain_slugs: ['sample-domain']
            }),
            ...(scenario.explicit ? { image_url: emblem } : {})
          }] }));
        } else if (pathname === missing || (!scenario.fixed && /\/(sample-domain|sample-class)\./.test(pathname))) {
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
        if (!scenario.success) {
          for (const file of reviewedFiles) {
            assert.equal(await readFile(join(directory, 'public/data', file), 'utf8'), JSON.stringify({ result: 'ok', data: [{ slug: 'reviewed' }] }), file);
          }
        }
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
          for (const pathname of ['/image/class/banner/sample-class.avif', '/image/domain/divider/sample-domain.avif']) {
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

test('filters unsupported beta before required downloads, retaining Hope & Fear and external artwork', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'daggerheart-beta-test-'));
  const requests = new Set();
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
  let source;
  let artworkSource;
  const artworkServer = createServer((request, response) => {
    requests.add(request.url);
    response.end(image);
  });
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    requests.add(pathname);
    if (pathname.startsWith('/api/')) {
      const key = pathname.slice(5);
      const excluded = {
        'domain-card': [{ slug: 'blood-spike', domain_slug: 'playtest-blood', source_slugs: ['playtest-the-void'], domain_image_url: '/missing/playtest-blood.jpg' }],
        class: [{ slug: 'playtest-blood-hunter', source_slugs: ['playtest-the-void'], features: [{ id: 2130 }, { id: 2131 }, { id: 2132 }] }, { slug: 'playtest-summoner', source_slugs: ['playtest-the-void'], features: [{ id: 2128 }, { id: 2129 }] }],
        subclass: [{ slug: 'order-of-the-lycan', class_slug: 'playtest-blood-hunter', source_slugs: ['playtest-the-void'], image_url: '/missing/lycan.jpg' }, { slug: 'theurgy', class_slug: 'playtest-summoner', source_slugs: ['playtest-the-void'], image_url: '/missing/theurgy.jpg' }]
      }[key] ?? [];
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ result: 'ok', data: [...excluded, {
        slug: 'supported', source_slugs: ['hope-and-fear'], domain_slug: 'dread', class_slug: 'witch',
        domain_slugs: ['playtest-dread', 'sage'], image_url: `${artworkSource}/external/art.png`
      }] }));
    } else if (pathname.startsWith('/missing/')) response.writeHead(404).end();
    else response.end(image);
  });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    source = `http://127.0.0.1:${server.address().port}`;
    await new Promise((resolve) => artworkServer.listen(0, '127.0.0.1', resolve));
    artworkSource = `http://127.0.0.1:${artworkServer.address().port}`;
    const artworkHash = createHash('sha256').update(`${artworkSource}/external/art.png`).digest('hex');
    const artworkPath = `/image/external/${artworkHash}.webp`;
    const child = spawn(process.execPath, [script, '--refresh'], {
      cwd: directory,
      env: { ...process.env, CONTENT_SOURCE: source, CONTENT_REVIEW_ONLY: '0', CONTENT_REFRESH_REPORT: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const [code] = await once(child, 'close');
    assert.equal(code, 0, output);
    assert.ok(![...requests].some((url) => url.startsWith('/missing/')));
    assert.ok(requests.has('/external/art.png'));
    for (const file of ['domain-cards', 'classes', 'subclasses']) {
      const payload = JSON.parse(await readFile(join(directory, `public/data/${file}.json`), 'utf8'));
      assert.equal(payload.data.length, file === 'classes' ? 3 : 1);
      if (file === 'classes') {
        assert.deepEqual(payload.data.slice(0, 2).map(item => [item.slug, item.features.map(feature => feature.id)]), [
          ['playtest-blood-hunter', [2130, 2131, 2132]], ['playtest-summoner', [2128, 2129]]
        ]);
      }
      const supported = payload.data.find(item => item.slug === 'supported');
      assert.equal(supported.image_url, artworkPath);
      assert.deepEqual(supported.domain_slugs, ['playtest-dread', 'sage']);
    }
    assert.ok((await readFile(join(directory, 'public', artworkPath))).length > 0);
  } finally {
    await new Promise((resolve) => artworkServer.close(resolve));
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
