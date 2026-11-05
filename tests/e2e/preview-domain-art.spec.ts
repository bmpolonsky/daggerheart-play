import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { createDomainCard } from '../../src/domain/rules/factories';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
const inventory = JSON.parse(readFileSync(new URL('../fixtures/qa-world/domain-art.json', import.meta.url), 'utf8'));
const before = process.env.DOMAIN_ART_BEFORE === '1';

test('packaged art covers every domain card in the 26-character QA world and the two personal QA controls', async ({ request }, info) => {
  test.skip(before, 'Previous compact package intentionally omitted these files; before UI captures establish the visible failure.');
  const manifest = await (await request.get('/offline-artwork.json')).json();
  for (const file of inventory.files) {
    const response = await request.get('/' + file.path);
    expect(response.status(), file.path).toBe(200);
    // The reviewed source may recompress artwork without changing its identity.
    // Verify actual WebP bytes, not the historical export's compressed size.
    const bytes = await response.body();
    expect(bytes.length, file.path).toBeGreaterThan(12);
    expect(bytes.subarray(0, 4).toString(), file.path).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString(), file.path).toBe('WEBP');
    const reviewedAsset = readFileSync(new URL(`../../public/${file.path}`, import.meta.url));
    expect(bytes.equals(reviewedAsset), `${file.path}: packaged bytes match reviewed content`).toBe(true);
    expect(manifest.files).toContain(file.path);
  }
  await info.attach('domain-art-inventory', { body: JSON.stringify(inventory), contentType: 'application/json' });
});
for (const width of [1180, 400]) test(`domain card hand images decode at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const doc = createPopulatedGameDocument();
  const hero = doc.files['data/characters.json'].entities['e2e-character-cadsuane'];
  hero.name = 'QA — изображения карт';
  hero.domainCards = ['untouchable', 'i-see-it-coming'].map(slug => createDomainCard({
    id: `domain-card:${slug}`, name: slug, domain: 'Grace', inLoadout: true,
    imageUrl: `./image/domain/card/${slug}.webp`, tokens: { value: 0, max: 0 }
  }));
  await importGameDocument(page, doc, 'domain-art.dhgame', hero.name);
  await page.locator('.player-roster__item').filter({ hasText: hero.name }).first().click();
  await page.setViewportSize({ width, height: 757 });
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Лист', exact: true }).click();
  const hand = page.getByRole('region', { name: 'Рука карт доменов', exact: true });
  const images = hand.locator('img');
  await expect(images).toHaveCount(2);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && (el.naturalWidth > 0)), { timeout: 5000 }).toBe(!before);
  }
  await hand.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`domain-hand-${before ? 'before' : 'after'}-${width}.png`) });
});
