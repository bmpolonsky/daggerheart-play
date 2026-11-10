import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const script = fileURLToPath(new URL('../../scripts/cache-daggerheart-data.mjs', import.meta.url));
const collections = ['adversaries', 'classes', 'rules', 'environments', 'beastforms', 'ancestries', 'communities', 'subclasses', 'domain-cards', 'equipment'];
const missingBloodImage = '/image/domain/card/playtest-blood.jpg';

async function run(directory, source, env = {}) {
  const child = spawn(process.execPath, [script], {
    cwd: directory,
    env: { ...process.env, CONTENT_SOURCE: source, CONTENT_REFRESH: '1', CONTENT_REFRESH_ASSETS: '0',
      CONTENT_REVIEW_ONLY: '0', CONTENT_REFRESH_REPORT: join(directory, 'review.md'), ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const [code] = await once(child, 'close');
  return { code, output };
}

async function snapshot(directory) {
  const names = (await readdir(directory)).sort();
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(join(directory, name), 'utf8')])));
}

test('failed required downloads do not replace any cached collection or manifest', async t => {
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
  for (const scenario of [
    { name: 'late collection asset', path: missingBloodImage, baseline: true },
    { name: 'fixed application asset after all collections', path: '/font/roboto.woff2', baseline: true },
    { name: 'cold cache remains empty after a failed download', path: missingBloodImage, baseline: false },
    { name: 'successful refresh writes complete corpus', path: null, baseline: true },
    { name: 'review produces report without changing cache', path: missingBloodImage, baseline: true, review: true }
  ]) await t.test(scenario.name, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'daggerheart-refresh-safety-'));
    const dataDir = join(directory, 'public/data');
    const server = createServer((request, response) => {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (path.startsWith('/api/')) {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ result: 'ok', data: [{ slug: 'new', name: 'New',
          ...(path === '/api/domain-card' ? { domain_image_url: missingBloodImage } : {}) }] }));
      } else if (path === scenario.path) response.writeHead(404).end();
      else response.end(image);
    });
    try {
      await mkdir(dataDir, { recursive: true });
      if (scenario.baseline) {
        for (const name of collections) await writeFile(join(dataDir, `${name}.json`), JSON.stringify({ result: 'ok', data: [{ slug: 'reviewed', name: 'Reviewed' }] }));
        await writeFile(join(dataDir, 'manifest.json'), '{"generatedAt":"reviewed"}\n');
      }
      const before = await snapshot(dataDir);
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const result = await run(directory, `http://127.0.0.1:${server.address().port}`, scenario.review ? { CONTENT_REVIEW_ONLY: '1' } : {});
      assert.equal(result.code, scenario.path && !scenario.review ? 1 : 0, result.output);
      if (scenario.path) assert.deepEqual(await snapshot(dataDir), before);
      else {
        for (const name of collections) assert.equal(JSON.parse(await readFile(join(dataDir, `${name}.json`), 'utf8')).data[0].slug, 'new');
        assert.equal(JSON.parse(await readFile(join(dataDir, 'manifest.json'), 'utf8')).collections.length, 10);
      }
      assert.match(await readFile(join(directory, 'review.md'), 'utf8'), /domainCards/);
      if (scenario.path && !scenario.review) assert.match(result.output, /Failed to download .* \(404\)/);
    } finally {
      await new Promise(resolve => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  });
});

test('external image paths are collision-safe, retained by CI cache, and reused on subsequent builds', async () => {
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
  const directory = await mkdtemp(join(tmpdir(), 'daggerheart-external-assets-'));
  let source;
  let external;
  let requests = 0;
  const imageServer = createServer((_request, response) => { requests += 1; response.end(image); });
  const apiServer = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ result: 'ok', data: [
        { slug: 'first', image_url: `${external}/same.jpeg?variant=first` },
        { slug: 'second', image_url: `${external}/same.jpeg?variant=second` },
        { slug: 'same-origin', image_url: `${source}/image/local.png` }
      ] }));
    } else response.end(image);
  });
  try {
    await new Promise(resolve => imageServer.listen(0, '127.0.0.1', resolve));
    await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
    external = `http://127.0.0.1:${imageServer.address().port}`;
    source = `http://127.0.0.1:${apiServer.address().port}`;
    const first = await run(directory, source);
    assert.equal(first.code, 0, first.output);
    const data = JSON.parse(await readFile(join(directory, 'public/data/domain-cards.json'), 'utf8')).data;
    for (const [index, variant] of ['first', 'second'].entries()) {
      const hash = createHash('sha256').update(`${external}/same.jpeg?variant=${variant}`).digest('hex');
      assert.equal(data[index].image_url, `/image/external/${hash}.webp`);
      assert.equal((await sharp(await readFile(join(directory, 'public', data[index].image_url))).metadata()).format, 'webp');
    }
    assert.equal(data[2].image_url, '/image/local.webp');
    assert.equal(requests, 2);
    const second = await run(directory, source, { CONTENT_REFRESH: '0', CONTENT_CACHE_TTL_HOURS: '0' });
    assert.equal(second.code, 0, second.output);
    assert.equal(requests, 2, 'fresh cached build must not refetch external artwork');
  } finally {
    await new Promise(resolve => apiServer.close(resolve));
    await new Promise(resolve => imageServer.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('deferred Void entries are filtered before required image downloads, but released entries still fail closed', async t => {
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
  for (const source_slugs of [['playtest-the-void'], ['hope-and-fear'], ['playtest-the-void', 'hope-and-fear']]) {
    await t.test(source_slugs.join('+'), async () => {
      const directory = await mkdtemp(join(tmpdir(), 'daggerheart-beta-exclusion-'));
      const missing = '/image/unsupported-subclass.png';
      const requests = new Set();
      const server = createServer((request, response) => {
        const path = new URL(request.url, 'http://localhost').pathname;
        requests.add(path);
        if (path.startsWith('/api/')) {
          const data = [{ slug: 'retained', name: 'Retained', source_slugs: ['core'] }];
          if (path === '/api/subclass') data.push({ slug: 'theurgy', class_slug: 'playtest-summoner', source_slugs, image_url: missing });
          if (path === '/api/domain-card') data.push({ slug: 'blood-spike', domain_slug: 'playtest-blood', source_slugs, domain_image_url: missingBloodImage });
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ result: 'ok', data }));
        } else if (path === missing || path === missingBloodImage) response.writeHead(404).end();
        else response.end(image);
      });
      try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const result = await run(directory, `http://127.0.0.1:${server.address().port}`);
        if (source_slugs.length === 1 && source_slugs[0] === 'playtest-the-void') {
          assert.equal(result.code, 0, result.output);
          assert.equal(requests.has(missing), false);
          assert.equal(requests.has(missingBloodImage), false);
          for (const name of ['subclasses', 'domain-cards']) {
            const data = JSON.parse(await readFile(join(directory, `public/data/${name}.json`), 'utf8')).data;
            assert.deepEqual(data.map(item => item.slug), ['retained']);
          }
          const report = await readFile(join(directory, 'review.md'), 'utf8');
          assert.match(report, /domainCards\/blood-spike/);
          assert.match(report, /subclasses\/theurgy/);
        } else {
          assert.equal(result.code, 1, result.output);
          assert.equal(requests.has(missing), true);
          assert.match(result.output, /Failed to download .* \(404\)/);
        }
      } finally {
        await new Promise(resolve => server.close(resolve));
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

test('cached exclusion paths reject an empty result and report actual retained-cache removals', async t => {
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
  for (const refresh of [false, true]) for (const keepCore of [false, true]) {
    await t.test(`${refresh ? 'failed-fetch fallback' : 'fresh cache'}: ${keepCore ? 'keep core and report' : 'reject all-excluded cache'}`, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'daggerheart-cached-exclusion-'));
      let failing = false;
      const server = createServer((request, response) => {
        const path = new URL(request.url, 'http://localhost').pathname;
        if (failing && path === '/api/domain-card') return response.writeHead(503).end();
        if (path.startsWith('/api/')) {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ result: 'ok', data: [{ slug: 'retained', source_slugs: ['core'] }] }));
        } else response.end(image);
      });
      try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const source = `http://127.0.0.1:${server.address().port}`;
        const initial = await run(directory, source);
        assert.equal(initial.code, 0, initial.output);
        const target = join(directory, 'public/data/domain-cards.json');
        const cached = JSON.parse(await readFile(target, 'utf8'));
        cached.data = [...(keepCore ? cached.data : []), {
          slug: 'blood-spike', source_slugs: ['playtest-the-void'], domain_slug: 'playtest-blood', domain_image_url: missingBloodImage
        }];
        await writeFile(target, JSON.stringify(cached));
        const before = await snapshot(join(directory, 'public/data'));
        await rm(join(directory, 'review.md'));
        failing = true;
        const result = await run(directory, source, { CONTENT_REFRESH: refresh ? '1' : '0', CONTENT_CACHE_TTL_HOURS: '0' });
        assert.equal(result.code, keepCore ? 0 : 1, result.output);
        if (keepCore) {
          assert.deepEqual(JSON.parse(await readFile(target, 'utf8')).data.map(item => item.slug), ['retained']);
          assert.match(await readFile(join(directory, 'review.md'), 'utf8'), /domainCards\/blood-spike/);
          assert.match(result.output, /Deferred beta entries excluded/);
        } else {
          assert.deepEqual(await snapshot(join(directory, 'public/data')), before);
          assert.match(result.output, /No usable cached domainCards remains after explicit content exclusions/);
        }
      } finally {
        await new Promise(resolve => server.close(resolve));
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});
