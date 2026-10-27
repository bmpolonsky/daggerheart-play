import { test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

/** Exact bytes, including technical IDs and timestamps, reused by every A/B build. */
export async function sharedQualityDocument<T>(document: T, variant = 'main'): Promise<T> {
  const title = `${basename(test.info().file)}:${test.info().title}:${variant}`;
  const key = createHash('sha256').update(title).digest('hex').slice(0, 20);
  const directory = resolve(process.env.QUALITY_OUTPUT_DIR ?? 'test-results/quality-ab', 'fixtures');
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${key}.dhgame`);
  let bytes: string;
  try { bytes = await readFile(path, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    bytes = JSON.stringify(document);
    await writeFile(path, bytes, { flag: 'wx' });
  }
  await writeFile(join(directory, `${key}.identity.json`), JSON.stringify({ title, path,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: Buffer.byteLength(bytes) }, null, 2));
  return JSON.parse(bytes) as T;
}

export async function installQualityClickCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('click', () => {
      const key = '__qa_ab_pointer_clicks';
      sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) ?? 0) + 1));
    }, { capture: true });
  });
}
export function qualityClickCount(page: Page): Promise<number> {
  return page.evaluate(() => Number(sessionStorage.getItem('__qa_ab_pointer_clicks') ?? 0));
}
export function qualityViewRole(page: Page): Promise<'gm' | 'player' | null> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-vtt-root]');
    return !root ? null : root.classList.contains('player-view--gm') ? 'gm' : 'player';
  });
}
