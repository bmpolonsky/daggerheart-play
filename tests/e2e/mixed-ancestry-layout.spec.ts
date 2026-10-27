import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';
import { installDeterministicP2PTransport } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { sharedQualityDocument } from './quality-ab-fixtures';
import { chooseAncestryFeature, chooseMixedAncestryMode } from './ancestry-selection-helpers';

const baseline = process.env.ANCESTRY_BASELINE === '1';
const directory = `/home/codex/outputs/dh-mixed-ancestry-20261027/${process.env.ANCESTRY_LABEL ?? 'after'}`;
async function ancestryWizard(page: Page, baseURL?: string) {
  await installDeterministicP2PTransport(page);
  await page.goto(`${baseURL ?? 'http://127.0.0.1:4208/'}#/game`);
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  await importGameDocument(page, await sharedQualityDocument(createPopulatedGameDocument()), 'ancestry-identical.dhgame');
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
  await library.getByRole('button', { name: 'Создать героя', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: 'Новый герой', exact: true });
  await wizard.getByRole('button', { name: 'Родословная', exact: true }).click();
  return wizard;
}

test('mixed ancestry retains invalid pair until corrected and saves either explicit feature orientation', async ({ page, baseURL }) => {
  test.skip(baseline, 'Published/current-before visual baselines have separate observed legacy controls.');
  for (const [firstName, secondName, wanted] of [
    ['Великан', 'Эльф', ['Выносливость', 'Небесный транс']],
    ['Эльф', 'Великан', ['Быстрые рефлексы', 'Размах']]
  ] as const) {
    const wizard = await ancestryWizard(page, baseURL);
    await wizard.getByRole('button', { name: 'Случайный герой', exact: true }).click();
    await wizard.getByRole('button', { name: 'Личность', exact: true }).click();
    const heroName = `QA ${firstName} ${secondName}`;
    await wizard.getByLabel('Имя', { exact: true }).fill(heroName);
    await wizard.getByLabel('Имя', { exact: true }).blur();
    await wizard.getByRole('button', { name: 'Родословная', exact: true }).click();
    const step = wizard.getByRole('group', { name: 'Шаг: Родословная', exact: true });
    await chooseMixedAncestryMode(step);
    await chooseAncestryFeature(page, step, 0, firstName);
    await chooseAncestryFeature(page, step, 1, firstName);
    await expect(step.getByRole('alert')).toContainText('две разные родословные');
    for (const label of ['Первое свойство родословной', 'Второе свойство родословной']) {
      await expect(step.getByRole('group', { name: label, exact: true }).getByRole('button').filter({ has: page.getByText(firstName, { exact: true }) })).toHaveAttribute('aria-pressed', 'true');
    }
    await capture(page, wizard, `invalid-${firstName}`);
    await wizard.getByRole('button', { name: 'Итог', exact: true }).click();
    await expect(wizard.getByRole('button', { name: 'Создать', exact: true })).toBeDisabled();
    await wizard.getByRole('button', { name: 'Родословная', exact: true }).click();
    await chooseAncestryFeature(page, step, 1, secondName);
    await expect(step.getByRole('alert')).toHaveCount(0);
    await capture(page, wizard, `valid-${firstName}`);
    await wizard.getByRole('button', { name: 'Итог', exact: true }).click();
    await wizard.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(wizard).toHaveCount(0);
    const library = page.getByRole('dialog', { name: 'Библиотека игры', exact: true });
    const editor = library.getByRole('region', { name: 'Редактор персонажа', exact: true });
    await expect(editor.getByRole('heading', { name: heroName, exact: true })).toBeVisible();
    await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Свойства', exact: true }).click();
    const features = editor.locator('.character-rule-feature').filter({ has: page.getByText('Родословная', { exact: true }) });
    await expect(features).toHaveCount(2);
    await expect(features.locator('.character-rule-feature__identity > strong')).toHaveText([...wanted]);
    await page.screenshot({ path: `${directory}/saved-${firstName}.png` });
  }
});
async function capture(page: Page, wizard: Locator, step: string) {
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${step}.png` });
  const evidence = await wizard.evaluate(element => ({
    text: element.textContent, width: element.clientWidth, scrollWidth: element.scrollWidth,
    layout: Array.from(element.querySelectorAll('.cinematic-builder,.cinematic-builder-nav,.cinematic-builder-panel,.cinematic-builder-stage,.cinematic-builder-workspace,.cinematic-builder-actions')).map(node => ({
      className: node.className, bounds: node.getBoundingClientRect().toJSON(), clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
      gridRows: getComputedStyle(node).gridTemplateRows, minHeight: getComputedStyle(node).minHeight
    })),
    horizontalOverflow: Array.from(element.querySelectorAll('*')).filter(node => node.getBoundingClientRect().right > innerWidth).slice(0, 15).map(node => ({ className: node.className, tag: node.tagName, bounds: node.getBoundingClientRect().toJSON() })),
    images: Array.from(element.querySelectorAll('img')).map(image => ({
      bounds: image.getBoundingClientRect().toJSON(), parent: image.parentElement?.getBoundingClientRect().toJSON()
    })),
    groups: Array.from(element.querySelectorAll('[role="group"]')).map(group => ({ label: group.getAttribute('aria-label'), bounds: group.getBoundingClientRect().toJSON() })),
    scrollRegions: Array.from(element.querySelectorAll('[role="region"][tabindex]')).map(region => ({ label: region.getAttribute('aria-label'), top: region.scrollTop, height: region.clientHeight, scrollHeight: region.scrollHeight }))
  }));
  await writeFile(`${directory}/${step}.json`, JSON.stringify({ baseline, viewport: page.viewportSize(), url: page.url(), ...evidence }, null, 2));
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`ancestry selection remains readable and coordinated ${viewport.width}x${viewport.height}`, async ({ page, baseURL }) => {
    await page.setViewportSize(viewport); const wizard = await ancestryWizard(page, baseURL);
    const step = wizard.getByRole('group', { name: 'Шаг: Родословная', exact: true });
    const giant = step.locator('.dh-choice-card').filter({ has: page.getByText('Великан', { exact: true }) }).first();
    if (baseline) {
      await capture(page, wizard, `initial-${viewport.width}x${viewport.height}`);
      try { await giant.click({ timeout: 2500 }); }
      catch (error) {
        await capture(page, wizard, `selection-blocked-${viewport.width}x${viewport.height}`);
        await writeFile(`${directory}/selection-blocked-${viewport.width}x${viewport.height}.txt`, String(error)); return;
      }
    } else await giant.click();
    await capture(page, wizard, `single-${viewport.width}x${viewport.height}`);
    if (baseline) {
      const mode = step.getByRole('checkbox', { name: 'Смешанная родословная', exact: true });
      const closeDescription = wizard.getByRole('button', { name: 'Закрыть описание', exact: true });
      if (!await mode.count() && await closeDescription.isVisible()) await closeDescription.click();
      if (!await mode.count()) { await capture(page, wizard, `mixed-unsupported-${viewport.width}x${viewport.height}`); return; }
      await mode.check(); await capture(page, wizard, `mixed-empty-${viewport.width}x${viewport.height}`);
      await step.getByRole('button', { name: 'Второе свойство — родословная', exact: true }).click();
      const picker = page.getByRole('dialog', { name: 'Выбор: Второе свойство — родословная', exact: true });
      await picker.getByRole('option').filter({ has: page.getByText('Эльф', { exact: true }) }).click();
      await page.screenshot({ path: `${directory}/legacy-picker-${viewport.width}x${viewport.height}.png` });
      await picker.getByRole('button', { name: 'Выбрать', exact: true }).click();
      await capture(page, wizard, `mixed-pair-${viewport.width}x${viewport.height}`); return;
    }
    const ancestryInfo = step.locator('details').filter({ hasText: 'О родословной' });
    await ancestryInfo.locator('summary').click();
    const ancestryArt = ancestryInfo.getByRole('img', { name: 'Великан', exact: true });
    await expect(ancestryArt).toBeVisible();
    const singleBody = step.getByRole('region', { name: 'Выбор родословной', exact: true });
    const artBox = (await ancestryArt.boundingBox())!; const singleBox = (await singleBody.boundingBox())!;
    expect(artBox.height).toBeLessThanOrEqual(193);
    if (artBox.y + artBox.height > singleBox.y + singleBox.height) {
      const summaryBox = (await ancestryInfo.locator('summary').boundingBox())!;
      await page.mouse.move(summaryBox.x + 8, Math.min(summaryBox.y + 8, singleBox.y + singleBox.height - 5));
      await page.mouse.wheel(0, Math.ceil(artBox.y + artBox.height - singleBox.y - singleBox.height + 10));
    }
    if (viewport.height > 500) await expect.poll(async () => {
      const art = (await ancestryArt.boundingBox())!; const body = (await singleBody.boundingBox())!;
      return art.y >= body.y && art.y + art.height <= body.y + body.height;
    }).toBe(true);
    await capture(page, wizard, `single-art-${viewport.width}x${viewport.height}`);
    await ancestryInfo.locator('summary').click();
    await step.getByRole('button', { name: 'Смешанная', exact: true }).click();
    const first = step.getByRole('group', { name: 'Первое свойство родословной', exact: true });
    const second = step.getByRole('group', { name: 'Второе свойство родословной', exact: true });
    await expect(first).toBeVisible(); await expect(second).toBeVisible();
    const search = second.getByRole('searchbox', { name: 'Поиск: Второе свойство', exact: true });
    await search.fill('Эльф');
    await expect(second.getByRole('button')).toHaveCount(1);
    await expect(second.getByRole('button', { name: 'Эльф — Небесный транс', exact: true })).toHaveCount(1);
    await search.fill('транс'); await expect(second.getByRole('button')).toHaveCount(1);
    await search.fill('неттакогосвойства'); await expect(second.getByText('Свойства не найдены.', { exact: true })).toBeVisible();
    await search.fill('');
    await second.getByRole('button', { name: 'Эльф — Небесный транс', exact: true }).click();
    const selectedElf = second.getByRole('button', { name: 'Эльф — Небесный транс', exact: true });
    const selectedGiant = first.getByRole('button', { name: 'Великан — Выносливость', exact: true });
    const selectedColor = await selectedGiant.evaluate(element => getComputedStyle(element).backgroundColor);
    await selectedElf.hover();
    const elfColor = await selectedElf.evaluate(element => getComputedStyle(element).backgroundColor);
    expect(elfColor).toBe(selectedColor);
    await selectedGiant.hover();
    expect(await selectedGiant.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(elfColor);
    await capture(page, wizard, `mixed-pair-${viewport.width}x${viewport.height}`);
    await expect(step.getByRole('status', { name: 'Выбранные свойства родословной', exact: true })).toContainText('Выносливость');
    await expect(step.getByRole('status', { name: 'Выбранные свойства родословной', exact: true })).toContainText('Небесный транс');
    await expect(first.getByLabel('Описание выбранного свойства')).toContainText('Выносливость');
    await expect(first.getByLabel('Описание выбранного свойства')).not.toContainText('Размах');
    await expect(second.getByLabel('Описание выбранного свойства')).not.toContainText('Быстрые рефлексы');
    await expect(wizard.getByLabel('Описание выбора', { exact: true })).toHaveCount(0);
    const shell = wizard.locator('.dh-dialog.cinematic-builder');
    // The pre-existing horizontal stepper intentionally contains offscreen
    // navigation items. Check actual shell/content widths, not backdrop bounds.
    expect(await shell.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await step.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const bounds = await step.locator('[data-ancestry-option]').evaluateAll(rows => rows.map(row => {
      const box = row.getBoundingClientRect(); const image = row.querySelector('img')?.getBoundingClientRect();
      return !image || (image.height <= box.height && image.width <= box.width && image.top >= box.top && image.bottom <= box.bottom);
    }));
    expect(bounds.every(Boolean)).toBe(true);
    const body = step.getByRole('region', { name: 'Выбор свойств смешанной родословной', exact: true });
    for (const region of [body, first.getByRole('region'), second.getByRole('region')]) {
      const previous = await region.evaluate(element => ({ top: element.scrollTop, max: element.scrollHeight - element.clientHeight }));
      if (previous.max > 0) {
        await region.focus(); await region.press('End');
        await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        await region.evaluate((element, top) => { element.scrollTop = top; }, previous.top);
      }
    }
    if (viewport.width === 390) {
      const sceneSnapshot = () => page.evaluate(() => ({
        x: scrollX, y: scrollY,
        sceneScroll: [document.querySelector('[aria-label="Игровая сцена"]')?.scrollLeft, document.querySelector('[aria-label="Игровая сцена"]')?.scrollTop],
        sceneObjects: Array.from(document.querySelectorAll('.player-scene-stage__background,.player-token')).map(node => node.getAttribute('style'))
      }));
      const sceneBefore = await sceneSnapshot();
      await body.evaluate(element => { element.scrollTop = 0; });
      const wheelList = async (region: Locator) => {
        await region.evaluate(element => { element.scrollTop = 0; });
        const box = (await region.boundingBox())!; const outer = (await body.boundingBox())!;
        const y = (Math.max(box.y, outer.y) + Math.min(box.y + box.height, outer.y + outer.height)) / 2;
        await page.mouse.move(box.x + box.width / 2, y); await page.mouse.wheel(0, 420);
        await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        return region.evaluate(element => element.scrollTop);
      };
      const firstScroll = await wheelList(first.getByRole('region'));
      expect(await body.evaluate(element => element.scrollTop)).toBe(0);
      const description = (await first.getByLabel('Описание выбранного свойства').boundingBox())!;
      const outer = (await body.boundingBox())!;
      const pointer = { x: description.x + 8, y: Math.min(description.y + 8, outer.y + outer.height - 5) };
      const targetRegion = await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.closest('[role="region"]')?.getAttribute('aria-label'), pointer);
      expect(targetRegion).toBe('Выбор свойств смешанной родословной');
      await page.mouse.move(pointer.x, pointer.y); await page.mouse.wheel(0, 350);
      await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      const secondScroll = await wheelList(second.getByRole('region'));
      const lastDescription = second.getByLabel('Описание выбранного свойства');
      const lastBox = (await lastDescription.boundingBox())!;
      await page.mouse.move(lastBox.x + 8, Math.min(lastBox.y + 8, outer.y + outer.height - 5)); await page.mouse.wheel(0, 350);
      await expect(lastDescription).toContainText('дополнительный Ход Отдыха');
      const sceneAfter = await sceneSnapshot(); expect(sceneAfter).toEqual(sceneBefore);
      await writeFile(`${directory}/pointer-wheel-measurements-390.json`, JSON.stringify({ firstScroll, secondScroll,
        bodyScroll: await body.evaluate(element => element.scrollTop), targetRegion, sceneBefore, sceneAfter }, null, 2));
      await capture(page, wizard, 'pointer-wheel-390');
    }
    await body.evaluate(element => { element.scrollTop = 0; });
    await capture(page, wizard, `mixed-first-${viewport.width}x${viewport.height}`);
    await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await capture(page, wizard, `mixed-second-${viewport.width}x${viewport.height}`);
    const scroll = await body.evaluate(element => ({ top: element.scrollTop, max: element.scrollHeight - element.clientHeight }));
    if (scroll.max > 0) expect(scroll.top).toBeGreaterThan(0);
    const footer = wizard.getByRole('toolbar', { name: 'Действия создания героя', exact: true });
    const next = footer.getByRole('button', { name: 'Дальше', exact: true });
    const hit = await next.evaluate(element => {
      const box = element.getBoundingClientRect(); const shell = element.closest('.dh-dialog')!.getBoundingClientRect();
      const under = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { fullyInside: box.top >= shell.top && box.bottom <= shell.bottom && box.bottom <= innerHeight,
        height: box.height, hit: Boolean(under && element.contains(under)) };
    });
    expect(hit).toMatchObject({ fullyInside: true, hit: true });
    expect(hit.height).toBeGreaterThanOrEqual(30);
    await step.getByRole('button', { name: 'Одна родословная', exact: true }).click();
    await expect(step.getByRole('group', { name: 'Второе свойство родословной', exact: true })).toHaveCount(0);
    await step.getByRole('button', { name: 'Смешанная', exact: true }).click();
    await expect(step.getByRole('group', { name: 'Первое свойство родословной', exact: true })).toBeVisible();
    await capture(page, wizard, `switched-back-${viewport.width}x${viewport.height}`);
    await next.click();
    await expect(wizard.getByRole('group', { name: 'Шаг: Сообщество', exact: true })).toBeVisible();
    await footer.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect(step).toBeVisible();
  });
}
