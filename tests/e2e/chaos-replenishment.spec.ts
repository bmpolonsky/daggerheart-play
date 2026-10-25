import { expect, test } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

test('Chaos preview Stress link replenishes only this card and refuses a second charge at full tokens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const document = createPopulatedGameDocument();
  const character = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  character.spellcastTrait = 'instinct';
  character.traits.instinct = 2;
  character.stress.marked = 0;
  character.domainCards[0] = { ...character.domainCards[0], name: 'Высвобождение хаоса', tokens: { value: 0, max: 6 },
    text: 'В начале сессии поместите на эту карту количество жетонов, равное вашей Характеристике Заклинателя. Отметьте Стресс, чтобы восполнить запас жетонов на этой карте вплоть до вашей Характеристики Заклинателя.' };
  await importGameDocument(page, document, 'chaos-replenishment.dhgame');
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  const sheet = page.getByLabel('Персонаж игрока');
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Карты', exact: true }).click();
  await sheet.locator('.dh-list-item').filter({ hasText: 'Высвобождение хаоса' }).click();
  const preview = page.getByRole('complementary', { name: 'Предпросмотр', exact: true });
  await preview.getByRole('button', { name: 'Отметьте Стресс', exact: true }).click();
  await expect(page.getByText('Высвобождение хаоса — жетоны восстановлены до Характеристики Заклинателя; отмечен 1 Стресс', { exact: true })).toBeVisible();
  await preview.getByRole('button', { name: 'Отметьте Стресс', exact: true }).click();
  await expect(page.getByText('Высвобождение хаоса — не применено: запас жетонов уже полон; Стресс не отмечен', { exact: true })).toBeVisible();
});
