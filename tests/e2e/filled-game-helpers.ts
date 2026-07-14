import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { openGmGame } from './game-route-helpers';

export const providedFilledGamePath = process.env.DAGGERHEART_E2E_SAVE?.trim() || '/Users/bogdanpolonskiy/Downloads/daggerheart-2026-06-03.dhgame';
export const usesProvidedFilledGame = existsSync(providedFilledGamePath);
export const filledCharacterName = usesProvidedFilledGame ? 'Кадсуанэ' : 'Новый герой';

export async function openFilledGmGame(page: Page): Promise<void> {
  await openGmGame(page);
  if (usesProvidedFilledGame) {
    await importProvidedFilledGame(page);
    return;
  }
  if (await page.getByRole('button', { name: 'Новый герой', exact: true }).count()) return;

  await page.getByRole('button', { name: 'Инструменты' }).click();
  const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
  await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
  await workspace.getByRole('button', { name: 'Создать героя' }).click();

  const builder = page.getByRole('dialog', { name: 'Новый герой' });
  await builder.getByRole('button', { name: 'Быстрый старт' }).click();
  await builder.getByRole('button', { name: 'Итог' }).click();
  await builder.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(builder).toHaveCount(0);

  await workspace.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByRole('button', { name: 'Новый герой', exact: true })).toBeVisible();
}

async function importProvidedFilledGame(page: Page): Promise<void> {
  if (await page.getByRole('button', { name: 'Кадсуанэ', exact: true }).count()) return;
  await page.getByRole('button', { name: 'Инструменты' }).click();
  const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
  await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Настройки' }).click();
  await workspace.getByLabel('Разделы настроек').getByRole('button', { name: 'Игры проекта' }).click();
  await workspace.locator('input[type="file"][accept*=".dhgame"]').setInputFiles(providedFilledGamePath);
  await expect(workspace.getByText(`Игра импортирована: ${basename(providedFilledGamePath)}`)).toBeVisible({ timeout: 60_000 });
  await workspace.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByRole('button', { name: 'Кадсуанэ', exact: true }).first()).toBeVisible({ timeout: 15_000 });
}
