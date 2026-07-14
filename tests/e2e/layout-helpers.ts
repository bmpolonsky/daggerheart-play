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
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    if (!box) return false;
    return box.x >= -tolerance &&
      box.y >= -tolerance &&
      box.x + box.width <= viewport!.width + tolerance &&
      box.y + box.height <= viewport!.height + tolerance;
  }, { message: 'surface should settle inside the viewport' }).toBe(true);
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
  await expect.poll(() => locator.evaluate((element) => {
    const hiddenAncestor = element.closest('[aria-hidden="true"]');
    const inertAncestor = element.closest('[inert]');
    return Boolean(hiddenAncestor && inertAncestor?.hasAttribute('inert'));
  }), { message: 'hidden surface should be absent from focus and accessibility navigation' }).toBe(true);
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

export async function expectInsideHorizontalBounds(container: Locator, item: Locator, tolerance = 1): Promise<void> {
  await expect.poll(async () => {
    const outer = await container.boundingBox();
    const inner = await item.boundingBox();
    if (!outer || !inner) return false;
    return inner.x >= outer.x - tolerance &&
      inner.x + inner.width <= outer.x + outer.width + tolerance;
  }, { message: 'item should be reachable inside its horizontal scroll container' }).toBe(true);
}

export async function expectInsideBounds(container: Locator, item: Locator, tolerance = 1): Promise<void> {
  await expect.poll(async () => {
    const outer = await container.boundingBox();
    const inner = await item.boundingBox();
    if (!outer || !inner) return false;
    return inner.x >= outer.x - tolerance &&
      inner.y >= outer.y - tolerance &&
      inner.x + inner.width <= outer.x + outer.width + tolerance &&
      inner.y + inner.height <= outer.y + outer.height + tolerance;
  }, { message: 'item should settle inside its container' }).toBe(true);
}

export async function expectTopLayerAtPoint(page: Page, layer: Locator, x: number, y: number): Promise<void> {
  await expect.poll(() => layer.evaluate((layerElement, point) => {
    const topElement = document.elementFromPoint(point.x, point.y);
    return topElement?.closest('[role="dialog"]') === layerElement;
  }, { x, y }), { message: `dialog should be the top interactive layer at ${Math.round(x)}, ${Math.round(y)}` }).toBe(true);
}

async function describe(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const className = typeof element.className === 'string' ? element.className : '';
    return `${element.tagName.toLowerCase()}${className ? `.${className.trim().replace(/\s+/g, '.')}` : ''}`;
  }).catch(() => 'locator');
}
