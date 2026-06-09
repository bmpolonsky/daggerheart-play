import { expect, test, type Locator, type Page } from '@playwright/test';
import { openGmGame, openPlayerGame } from './game-route-helpers';
import { expectInsideViewport } from './layout-helpers';

async function expectNoHorizontalOverflow(page: Page, width: number): Promise<void> {
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
}

async function expectStableButton(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const styles = await locator.evaluate((element) => {
    const computed = window.getComputedStyle(element);
    return {
      borderRadius: Number.parseFloat(computed.borderRadius),
      minHeight: Number.parseFloat(computed.minHeight),
      height: element.getBoundingClientRect().height
    };
  });
  expect(styles.borderRadius).toBeGreaterThanOrEqual(8);
  expect(Math.max(styles.minHeight || 0, styles.height)).toBeGreaterThanOrEqual(32);
}

test.describe('dark glass visual system smoke', () => {
  test('lobby desktop and mobile keep glass cards inside viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const lobby = page.locator('.role-entry');
    const gmCard = page.locator('.role-entry__gm-card');
    const joinCard = page.locator('.role-entry__join-card');

    await expect(lobby).toBeVisible();
    await expectInsideViewport(page, gmCard);
    await expectInsideViewport(page, joinCard);
    await expectStableButton(gmCard.getByRole('button', { name: 'Открыть игру' }));
    await expectNoHorizontalOverflow(page, 1440);

    await page.setViewportSize({ width: 390, height: 844 });
    await expectInsideViewport(page, page.locator('.role-entry__title'));
    await expectInsideViewport(page, page.locator('.role-entry__gm-card'));
    await expectNoHorizontalOverflow(page, 390);
  });

  test('GM VTT, tools modal, and character builder use stable glass surfaces', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);

    const feed = page.locator('.player-left-rail');
    const scene = page.locator('.player-scene-stage');
    const sheet = page.locator('.player-character-panel');

    await expectInsideViewport(page, feed);
    await expectInsideViewport(page, scene);
    await expectInsideViewport(page, sheet);
    await expectStableButton(page.locator('.mini-dice-launcher__tools'));

    await page.locator('.mini-dice-launcher__tools').click();
    const modal = page.locator('.player-tools-modal');
    await expect(modal).toBeVisible();
    await expectInsideViewport(page, modal);
    await modal.getByRole('button', { name: 'Персонажи' }).click();
    const createHeroButton = modal.getByRole('button', { name: 'Создать героя' }).first();
    await expectStableButton(createHeroButton);
    await createHeroButton.click();

    const builder = page.locator('.cinematic-builder');
    await expect(builder).toBeVisible();
    await expectInsideViewport(page, builder);
    await expect(page.locator('.cinematic-builder-preview')).toHaveCSS('color', /rgb\(243, 234, 216\)|rgb\(255, 247, 231\)/);
    await expectNoHorizontalOverflow(page, 1440);
  });

  test('player mobile layers keep document width stable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlayerGame(page);

    const tabs = page.locator('.player-mobile-layer-tabs');
    await expectInsideViewport(page, tabs);
    await tabs.getByRole('button', { name: 'Чат' }).click();
    await expectInsideViewport(page, page.locator('.player-left-rail'));
    await tabs.getByRole('button', { name: 'Лист' }).click();
    await expectInsideViewport(page, page.locator('.player-character-panel'));
    await expectNoHorizontalOverflow(page, 390);
  });

  test('combat and card tool shells render with dark glass chrome', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tools/combat');
    await expect(page.locator('.tool-viewport--combat')).toBeVisible();
    await expectInsideViewport(page, page.locator('.tool-viewport--combat'));
    await expectNoHorizontalOverflow(page, 1440);

    await page.goto('/tools/cards');
    await expect(page.locator('.tool-viewport--cards')).toBeVisible();
    await expectInsideViewport(page, page.locator('.tool-viewport--cards'));
    await expectStableButton(page.locator('.tool-viewport--cards button').first());
    await expectNoHorizontalOverflow(page, 1440);
  });
});
