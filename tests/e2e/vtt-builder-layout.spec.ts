import { expect, test, type Page } from '@playwright/test';
import { openGmGame } from './game-route-helpers';
import { expectAbove, expectInsideViewport, expectLeftOf, expectNoOverlap, rect } from './layout-helpers';

async function openBuilder(page: Page): Promise<void> {
  await openGmGame(page);
  await page.locator('.mini-dice-launcher__tools').click();
  const toolsModal = page.locator('.player-tools-modal');
  const isMobileToolsModal = (page.viewportSize()?.width ?? 999) <= 680;
  const tabs = isMobileToolsModal
    ? toolsModal.locator('.player-tools-modal__mobile-tabs')
    : toolsModal.locator('.player-tools-modal__nav');
  const charactersTab = tabs.getByRole('button', { name: 'Персонажи' });
  await charactersTab.evaluate((button) => {
    button.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  if (isMobileToolsModal) {
    await charactersTab.dispatchEvent('click');
  } else {
    await charactersTab.click();
  }
  await page.getByRole('button', { name: /Создать героя/ }).first().click();
  await expect(page.locator('.cinematic-builder')).toBeVisible();
}

test.describe('character builder composition', () => {
  test('desktop keeps three-column wizard composition', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBuilder(page);

    const builder = page.locator('.cinematic-builder');
    const nav = page.locator('.cinematic-builder-nav');
    const panel = page.locator('.cinematic-builder-panel');
    const preview = page.locator('.cinematic-builder-preview');
    const stage = page.locator('.cinematic-builder-stage');
    const workspace = page.locator('.cinematic-builder-workspace');
    const choiceDetail = page.locator('.cinematic-builder-choice-detail');
    const actions = page.locator('.cinematic-builder-actions');

    await expect(workspace).toHaveClass(/dh-has-choice-detail/);
    await expectInsideViewport(page, builder);
    await expectLeftOf(nav, panel, 4);
    await expectLeftOf(panel, preview, 4);
    await expectAbove(stage, workspace, 4);
    await expectAbove(workspace, actions, 4);
    await expect(choiceDetail).toBeVisible();
  });

  test('mobile keeps builder surfaces stacked and compact', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBuilder(page);

    const builder = page.locator('.cinematic-builder');
    const stage = page.locator('.cinematic-builder-stage');
    const workspace = page.locator('.cinematic-builder-workspace');
    const actions = page.locator('.cinematic-builder-actions');
    const preview = page.locator('.cinematic-builder-preview');
    const choiceDetail = page.locator('.cinematic-builder-choice-detail');
    const choiceArea = page.locator('.cinematic-builder-choice-area').first();

    await page.locator('.cinematic-builder-quickstart').click();
    await page.locator('.cinematic-builder-step-tab').filter({ hasText: 'Карты' }).click();
    await expect(workspace).toHaveClass(/dh-has-choice-detail/);
    await expectInsideViewport(page, builder);
    await expectInsideViewport(page, choiceDetail);
    await expectNoOverlap(choiceArea, choiceDetail, 2);
    await expectAbove(stage, workspace, 4);
    await expectAbove(workspace, actions, 4);
    await expect(preview).toHaveCSS('display', 'none');
    expect((await rect(choiceArea)).height).toBeGreaterThanOrEqual(160);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('tablet width keeps builder readable without clipping ancestry cards', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1200 });
    await openBuilder(page);

    await page.getByLabel('Родословная').click();
    const builder = page.locator('.cinematic-builder');
    const workspace = page.locator('.cinematic-builder-workspace');
    const preview = page.locator('.cinematic-builder-preview');
    const firstCard = page.locator('.cinematic-builder .dh-choice-card').first();
    const firstCardBody = firstCard.locator('.cinematic-card-body');

    await expectInsideViewport(page, builder);
    await expectLeftOf(workspace, preview, 4);
    await expect(firstCard.locator('.cinematic-card-title')).toBeVisible();
    const cardBox = await rect(firstCard);
    const bodyBox = await rect(firstCardBody);
    expect(bodyBox.bottom).toBeLessThanOrEqual(cardBox.bottom + 1);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1024);
  });

  test('small mobile keeps every wizard choice area usable', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openBuilder(page);

    await page.locator('.cinematic-builder-quickstart').click();
    for (const stepLabel of ['Подкласс', 'Экипировка', 'Карты']) {
      await page.locator('.cinematic-builder-step-tab').filter({ hasText: stepLabel }).click();
      const choiceArea = page.locator('.cinematic-builder-choice-area').first();
      await expect(choiceArea).toBeVisible();
      expect((await rect(choiceArea)).height, `${stepLabel} choice area should remain usable`).toBeGreaterThanOrEqual(145);
      await expectInsideViewport(page, page.locator('.cinematic-builder'));
    }
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 360);
  });
});
