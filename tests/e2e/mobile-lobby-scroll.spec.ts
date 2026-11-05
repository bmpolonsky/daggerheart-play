import { expect, test } from '@playwright/test';
import { installDeterministicP2PTransport } from './game-route-helpers';

test('long mobile lobby scrolls the document and clears scroll offset when entering game', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installDeterministicP2PTransport(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dh-mobile-entry-scroll/);
  await page.getByRole('button', { name: 'Мастер', exact: true }).click();
  for (let index = 0; index < 10; index++) await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const layout = await page.evaluate(() => {
    const lobby = document.querySelector<HTMLElement>('.role-entry')!;
    return { documentHeight: document.documentElement.scrollHeight, viewport: innerHeight,
      lobbyHeight: lobby.clientHeight, lobbyScrollHeight: lobby.scrollHeight,
      lobbyOverflowY: getComputedStyle(lobby).overflowY,
      attemptedInnerScroll: (() => { lobby.scrollTop = 200; return lobby.scrollTop; })(),
      overscrollY: getComputedStyle(document.documentElement).overscrollBehaviorY,
      rootScroller: document.scrollingElement === document.documentElement };
  });
  expect(layout.documentHeight).toBeGreaterThan(layout.viewport + 200);
  expect(layout.lobbyOverflowY).toBe('clip');
  expect(layout.attemptedInnerScroll).toBe(0);
  expect(layout.overscrollY).toBe('auto');
  expect(layout.rootScroller).toBe(true);
  await page.evaluate(() => scrollTo(0, 350));
  // WebKit's native controls can make the same ten rows shorter than Chromium's.
  const expectedScroll = Math.min(350, layout.documentHeight - layout.viewport);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(expectedScroll, 0);
  expect(await page.locator('.role-entry').evaluate(element => element.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Открыть игру', exact: true }).click();
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/dh-mobile-entry-scroll/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  const gameBounds = await page.locator('[data-vtt-root]').boundingBox();
  expect(gameBounds?.y).toBe(0);
  expect(gameBounds?.height).toBeCloseTo(844, 0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('clip');
  const url = page.url();
  await page.reload();
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(page.locator('html')).not.toHaveClass(/dh-mobile-entry-scroll/);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('entry/join scroll opt-in is narrow-route only and removed at desktop width', async ({ page }) => {
  await installDeterministicP2PTransport(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/join/SCROLLTEST');
  await expect(page.getByLabel('Лобби игрока')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dh-mobile-entry-scroll/);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('html')).not.toHaveClass(/dh-mobile-entry-scroll/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('clip');
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/dh-mobile-entry-scroll/);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('html')).toHaveClass(/dh-mobile-entry-scroll/);
  await page.evaluate(() => {
    history.pushState({}, '', '/#/tools/combat');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('html')).not.toHaveClass(/dh-mobile-entry-scroll/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('clip');
});
