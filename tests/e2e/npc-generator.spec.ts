import { expect, test } from '@playwright/test';
import { openGmGame } from './game-route-helpers';

// Catalog fixtures must also control reloads; the worker's own fetch bypasses page.route.
test.use({ serviceWorkers: 'block' });

const ancestry = { id: 'npc-test-ancestry', name: 'Риббет', source_slugs: ['core'] };
const community = { id: 'npc-test-community', name: 'Морское', source_slugs: ['core'] };

for (const width of [1440, 320]) {
  test(`NPC uses the library, survives tabs and copies its compact basis at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/data/ancestries.json', (route) => route.fulfill({ json: { result: 'ok', data: [ancestry, { ...ancestry, id: 'elf', name: 'Эльф' }] } }));
    await page.route('**/data/communities.json', (route) => route.fulfill({ json: { result: 'ok', data: [community, { ...community, id: 'wanderborne', name: 'Кочевое' }] } }));
    await page.addInitScript(() => {
      const random = Math.random;
      Math.random = () => (window as typeof window & { npcTestRandom?: number }).npcTestRandom ?? random();
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (text: string) => sessionStorage.setItem('copied-npc', text)
      } });
    });
    await openGmGame(page);
    if (width < 600) await page.getByLabel('Слой интерфейса').getByRole('button', { name: /^Чат/ }).click();
    await page.getByRole('button', { name: 'NPC', exact: true }).click();
    await expect(page).toHaveURL(/#\/library\/npc$/);
    await expect(page.getByRole('button', { name: 'NPC', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'NPC', exact: true }).locator('svg')).toHaveClass(/lucide-contact-round/);
    const generator = page.getByRole('region', { name: 'Генератор NPC', exact: true });
    const card = generator.getByRole('region', { name: 'Сгенерированный NPC' });
    await expect(card).toBeVisible();
    for (const text of ['Родословная', 'Сообщество', 'Занятие', 'Внешность', 'Мотив']) {
      await expect(card.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(card).not.toContainText(/Манера|Класс/);
    const ancestryName = await card.getByRole('group', { name: 'Родословная' }).locator('dd').innerText();
    const communityName = await card.getByRole('group', { name: 'Сообщество' }).locator('dd').innerText();
    expect(['Риббет', 'Эльф']).toContain(ancestryName);
    expect(['Морское', 'Кочевое']).toContain(communityName);
    const before = await card.innerText();
    const firstName = await card.getByRole('heading', { level: 3 }).innerText();
    const header = generator.locator('header');
    await expect(header.getByRole('button', { name: 'Сгенерировать', exact: true })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Скопировать NPC целиком', exact: true })).toBeVisible();
    await expect(generator.getByRole('button', { name: 'Добавить NPC в чат приватно' })).toHaveCount(0);
    const headerBounds = await header.boundingBox();
    const cardBounds = await card.boundingBox();
    expect(headerBounds!.y + headerBounds!.height).toBeLessThanOrEqual(cardBounds!.y);
    await generator.getByRole('button', { name: 'Скопировать NPC целиком', exact: true }).click();
    const copied = await page.evaluate(() => sessionStorage.getItem('copied-npc'));
    expect(copied!.split('\n')).toHaveLength(7);
    expect(copied).toContain(`${firstName}\n`);
    expect(copied).toContain(`Занятие: ${await card.getByRole('group', { name: 'Занятие' }).locator('dd').innerText()}.`);
    await expect(generator.getByRole('status')).toContainText('NPC скопирован.');
    expect(copied).toContain(`Пол: ${await card.locator('[data-npc-gender]').innerText()}.`);
    expect(copied).toContain(`Внешность: ${await card.getByRole('group', { name: 'Внешность' }).locator('dd').innerText()}.`);
    expect(copied).toContain(`Мотив: ${await card.getByRole('group', { name: 'Мотив' }).locator('dd').innerText()}.`);
    expect(copied).toContain(`Родословная: ${ancestryName}.\nСообщество: ${communityName}.`);
    await page.getByRole('button', { name: 'Имена и названия', exact: true }).click();
    await expect(page).toHaveURL(/#\/library\/names$/);
    await expect(page.getByRole('button', { name: 'NPC', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'NPC', exact: true }).click();
    await expect(page).toHaveURL(/#\/library\/npc$/);
    expect(await card.innerText()).toBe(before);
    for (const [index, action] of ['Перебросить имя', 'Перебросить родословную', 'Перебросить сообщество', 'Перебросить занятие', 'Перебросить внешность', 'Перебросить мотив'].entries()) {
      const values = card.locator('[data-npc-value]');
      const previous = await values.allTextContents();
      const genderBefore = await card.locator('[data-npc-gender]').innerText();
      await card.getByRole('button', { name: action, exact: true }).click();
      await expect(values.nth(index)).not.toHaveText(previous[index]!);
      const next = await values.allTextContents();
      await expect(card.locator('[data-npc-gender]')).toHaveText(genderBefore);
      expect(next.filter((_, i) => i !== index)).toEqual(previous.filter((_, i) => i !== index));
    }
    const valuesBeforeGender = await card.locator('[data-npc-value]').allTextContents();
    const genderBefore = await card.locator('[data-npc-gender]').innerText();
    await card.getByRole('button', { name: 'Изменить пол и имя', exact: true }).click();
    await expect(card.locator('[data-npc-gender]')).toHaveText(genderBefore === 'мужской' ? 'женский' : 'мужской');
    await expect(card.getByRole('heading', { level: 3 })).not.toHaveText(valuesBeforeGender[0]!);
    expect((await card.locator('[data-npc-value]').allTextContents()).slice(1)).toEqual(valuesBeforeGender.slice(1));
    const beforeRegenerate = await card.getByRole('heading', { level: 3 }).innerText();
    await generator.getByRole('button', { name: 'Сгенерировать' }).click();
    await expect(card.getByRole('heading', { level: 3 })).not.toHaveText(beforeRegenerate);
    // Exercise real reroll actions with long entries, so layout is not tested on lucky short text.
    await page.evaluate(() => { (window as typeof window & { npcTestRandom?: number }).npcTestRandom = 0; });
    await card.getByRole('button', { name: 'Перебросить внешность', exact: true }).click();
    await card.getByRole('button', { name: 'Перебросить мотив', exact: true }).click();
    await page.evaluate(() => { (window as typeof window & { npcTestRandom?: number }).npcTestRandom = 0.999; });
    await card.getByRole('button', { name: 'Перебросить внешность', exact: true }).click();
    await page.evaluate(() => { (window as typeof window & { npcTestRandom?: number }).npcTestRandom = 0.2; });
    await card.getByRole('button', { name: 'Перебросить мотив', exact: true }).click();
    await page.evaluate(() => { delete (window as typeof window & { npcTestRandom?: number }).npcTestRandom; });
    await expect(card.getByText('опирается на украшенную резьбой трость', { exact: true })).toBeVisible();
    await expect(card.getByText('накопить, чтобы больше не работать', { exact: true })).toBeVisible();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
    const bounds = await generator.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThan(844 - (width < 600 ? 70 : 0));
    await page.screenshot({ path: test.info().outputPath('npc-layout.png') });
    await page.goto('/#/library/generators');
    await expect(card).toBeVisible();
    await expect(page.getByRole('button', { name: 'NPC', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Имена и названия', exact: true }).click();
    await page.getByRole('button', { name: 'NPC', exact: true }).click();
    await expect(page).toHaveURL(/#\/library\/npc$/);
    await page.reload();
    await expect(card).toBeVisible();
    await expect(page.getByRole('button', { name: 'NPC', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
}

test('NPC shows loading, empty and failure states and can retry without inventing an origin', async ({ page }) => {
  let release!: () => void;
  const loaded = new Promise<void>((resolve) => { release = resolve; });
  let mode: 'empty' | 'error' | 'ready' = 'empty';
  await page.route('**/data/ancestries.json', async (route) => {
    await loaded;
    if (mode === 'error') return route.fulfill({ status: 503, body: 'unavailable' });
    await route.fulfill({ json: { result: 'ok', data: [ancestry] } });
  });
  await page.route('**/data/communities.json', (route) => route.fulfill({ json: { result: 'ok', data: mode === 'ready' ? [community] : [] } }));
  await openGmGame(page);
  await page.getByRole('button', { name: 'NPC', exact: true }).click();
  const generator = page.getByRole('region', { name: 'Генератор NPC', exact: true });
  const card = generator.getByRole('region', { name: 'Сгенерированный NPC' });
  await expect(generator).toContainText('Загружаю родословные и сообщества');
  await expect(generator.getByRole('button', { name: 'Сгенерировать' })).toBeDisabled();
  await expect(card).toHaveCount(0);
  release();
  await expect(generator).toContainText('В доступных источниках нет родословных или сообществ');
  await expect(generator.getByRole('button', { name: 'Скопировать NPC целиком', exact: true })).toBeDisabled();
  mode = 'error';
  await generator.getByRole('button', { name: 'Обновить справочник' }).click();
  await expect(generator).toContainText('Не удалось загрузить справочник');
  await expect(card).toHaveCount(0);
  mode = 'ready';
  await generator.getByRole('button', { name: 'Обновить справочник' }).click();
  await expect(card).toContainText('Риббет');
  await expect(generator.getByRole('button', { name: 'Сгенерировать' })).toBeEnabled();
});
