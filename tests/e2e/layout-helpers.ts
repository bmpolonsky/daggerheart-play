import { expect, type Locator, type Page } from '@playwright/test';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export async function rect(locator: Locator): Promise<Rect> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return {
    x: box!.x,
    y: box!.y,
    width: box!.width,
    height: box!.height,
    right: box!.x + box!.width,
    bottom: box!.y + box!.height
  };
}

export async function expectInsideViewport(page: Page, locator: Locator, tolerance = 1): Promise<void> {
  const box = await rect(locator);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-tolerance);
  expect(box.y).toBeGreaterThanOrEqual(-tolerance);
  expect(box.right).toBeLessThanOrEqual(viewport!.width + tolerance);
  expect(box.bottom).toBeLessThanOrEqual(viewport!.height + tolerance);
}

export async function expectNoOverlap(first: Locator, second: Locator, tolerance = 1): Promise<void> {
  const a = await rect(first);
  const b = await rect(second);
  const overlaps = a.x < b.right - tolerance &&
    a.right > b.x + tolerance &&
    a.y < b.bottom - tolerance &&
    a.bottom > b.y + tolerance;
  expect(overlaps, `${await describe(first)} overlaps ${await describe(second)}`).toBe(false);
}

export async function expectHiddenSurface(locator: Locator): Promise<void> {
  await expect(locator).toHaveCSS('opacity', '0');
  await expect(locator).toHaveCSS('pointer-events', 'none');
}

export async function expectAbove(first: Locator, second: Locator, tolerance = 1): Promise<void> {
  const a = await rect(first);
  const b = await rect(second);
  expect(a.bottom).toBeLessThanOrEqual(b.y + tolerance);
}

export async function expectLeftOf(first: Locator, second: Locator, tolerance = 1): Promise<void> {
  const a = await rect(first);
  const b = await rect(second);
  expect(a.right).toBeLessThanOrEqual(b.x + tolerance);
}

async function describe(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const className = typeof element.className === 'string' ? element.className : '';
    return `${element.tagName.toLowerCase()}${className ? `.${className.trim().replace(/\s+/g, '.')}` : ''}`;
  }).catch(() => 'locator');
}
