import { expect, type Page } from '@playwright/test';
import { createGameDocument } from '../../src/domain/game/gameDocument';
import { CURRENT_PERSISTED_STATE_VERSION } from '../../src/domain/migrations/persistedState';
import {
  createAdversary,
  createCharacter,
  createEncounterEnvironment,
  createEncounterState,
  createGameState,
  createSceneTableState,
  createUiState
} from '../../src/domain/rules/factories';
import type { PersistedState } from '../../src/domain/rules/types';
import { createLocalParticipant, createTableScene, createTokenState } from '../../src/domain/tabletop/factories';
import { openGmGame } from './game-route-helpers';

export const filledCharacterName = 'Кадсуанэ';
export const filledEnvironmentName = 'Заброшенная роща';
export const filledAdversaryName = 'Алая Слизь';
export const filledCharacterResources = {
  hope: { value: 2, max: 6 },
  hp: { marked: 1, max: 5 },
  stress: { marked: 2, max: 6 }
} as const;

const fixtureFileName = 'e2e-populated-game.dhgame';
const sceneId = 'e2e-scene';
const sceneBackground = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#26384d" />
        <stop offset="1" stop-color="#9d7045" />
      </linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#sky)" />
    <path d="M0 650 L260 380 L460 620 L760 300 L1040 610 L1280 410 L1600 670 L1600 900 L0 900 Z" fill="#171b20" />
    <circle cx="1260" cy="190" r="90" fill="#e6c273" opacity=".72" />
  </svg>
`)}`;

export async function openFilledGmGame(page: Page): Promise<void> {
  await openGmGame(page);
  await importPopulatedGame(page);
}

export async function importPopulatedGame(page: Page): Promise<void> {
  if (await page.getByRole('button', { name: filledCharacterName, exact: true }).count()) return;

  await page.getByRole('button', { name: 'Инструменты' }).click();
  const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
  await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Настройки' }).click();
  await workspace.getByLabel('Разделы настроек').getByRole('button', { name: 'Игры проекта' }).click();
  await workspace.locator('input[type="file"][accept*=".dhgame"]').setInputFiles({
    name: fixtureFileName,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(createPopulatedGameDocument()))
  });
  await expect(workspace.getByText(`Игра импортирована: ${fixtureFileName}`)).toBeVisible({ timeout: 15_000 });
  await workspace.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.getByRole('button', { name: filledCharacterName, exact: true }).first()).toBeVisible({ timeout: 15_000 });
}

export function createPopulatedGameDocument() {
  const characters = [
    createCharacter({
      id: 'e2e-character-cadsuane',
      name: filledCharacterName,
      playerName: 'Игрок 1',
      className: 'Wizard',
      hope: filledCharacterResources.hope,
      hp: filledCharacterResources.hp,
      stress: filledCharacterResources.stress,
      domainCards: Array.from({ length: 7 }, (_, index) => ({
        id: `e2e-domain-card-${index + 1}`,
        name: `Заклинание ${index + 1}`,
        domain: 'Codex',
        level: 1,
        text: `Длинный тестовый эффект ${index + 1}.`,
        inLoadout: true,
        tokens: { value: 0, max: 0 }
      })),
      notes: 'Хранительница забытых историй.'
    }),
    createCharacter({ id: 'e2e-character-ran', name: 'Ран', playerName: 'Игрок 2', className: 'Guardian', notes: 'Защитник каравана.' }),
    createCharacter({ id: 'e2e-character-iri', name: 'Ири', playerName: 'Игрок 3', className: 'Ranger', notes: 'Следопыт пустошей.' })
  ];
  const adversaries = [
    createAdversary({ id: 'e2e-adversary-ooze', name: filledAdversaryName, summary: 'Подвижная масса алого стекла.' }),
    createAdversary({ id: 'e2e-adversary-raider', name: 'Пепельный налётчик', summary: 'Охотник с обожжённых дорог.' })
  ];
  const environment = createEncounterEnvironment({
    id: 'e2e-environment-grove',
    name: filledEnvironmentName,
    summary: 'Тёмные корни и остатки древнего святилища.',
    featureText: 'Шёпот рощи сбивает путников с дороги.'
  });
  const tokens = [
    createTokenState({ kind: 'character', id: characters[0].id }, { x: 360, y: 260 }),
    createTokenState({ kind: 'character', id: characters[1].id }, { x: 360, y: 430 }),
    createTokenState({ kind: 'character', id: characters[2].id }, { x: 360, y: 600 }),
    createTokenState({ kind: 'adversary', id: adversaries[0].id }, { x: 820, y: 280 }),
    createTokenState({ kind: 'adversary', id: adversaries[1].id }, { x: 850, y: 500, hidden: true }),
    createTokenState({ kind: 'environment', id: environment.id }, { x: 1060, y: 620, width: 96, height: 96 })
  ];
  const scene = createTableScene({
    id: sceneId,
    name: 'Сцена боя',
    subtitle: 'Рынок у заброшенной рощи',
    mode: 'tactical',
    backgroundUrl: sceneBackground,
    tokens
  });
  const participants = {
    'local-gm': createLocalParticipant({ id: 'local-gm', name: 'Мастер', role: 'gm', connected: true }),
    'e2e-seat-1': createLocalParticipant({ id: 'e2e-seat-1', name: 'Игрок 1', role: 'player', actorIds: [characters[0].id], connected: false }),
    'e2e-seat-2': createLocalParticipant({ id: 'e2e-seat-2', name: 'Игрок 2', role: 'player', actorIds: [characters[1].id], connected: false }),
    'e2e-seat-3': createLocalParticipant({ id: 'e2e-seat-3', name: 'Игрок 3', role: 'player', actorIds: [characters[2].id], connected: false })
  };
  const game = {
    ...createGameState(),
    name: 'E2E заполненная кампания',
    sessionTitle: 'Проверка заполненного стола',
    sceneTitle: scene.name
  };
  const encounter = {
    ...createEncounterState(),
    name: 'Столкновение у рощи',
    adversaries: Object.fromEntries(adversaries.map((adversary) => [adversary.id, adversary])),
    order: adversaries.map((adversary) => adversary.id),
    activeAdversaryId: adversaries[0].id,
    environments: { [environment.id]: environment }
  };
  const state: PersistedState = {
    schemaVersion: CURRENT_PERSISTED_STATE_VERSION,
    game,
    characters: {
      entities: Object.fromEntries(characters.map((character) => [character.id, character])),
      order: characters.map((character) => character.id),
      selectedId: characters[0].id,
      updatedAt: game.updatedAt
    },
    encounter,
    rollLog: [],
    feed: [],
    ui: createUiState(),
    sceneTable: createSceneTableState({
      activeSceneId: scene.id,
      liveSceneId: scene.id,
      scenes: { [scene.id]: scene },
      sceneOrder: [scene.id],
      participants
    })
  };
  return createGameDocument(state);
}
