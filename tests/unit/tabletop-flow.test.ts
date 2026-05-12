import { test } from "vitest";
import assert from "node:assert/strict";
import { buildEncounterFlow } from "../../src/domain/rules/encounterFlow";
import { buildTableFeed } from "../../src/domain/tabletop/feed";
import { resetAllStores } from "../../src/stores/gameStores";
import { tabletopService } from "../../src/services/serviceRegistry";
import {
  closeTabletopOverlay,
  openTabletopBuilder,
  openTabletopCardActivation,
  openTabletopDrawer,
  openTabletopLeftRail,
  openTabletopPanel,
  openTabletopSheet,
  tabletopPanelFromOverlay
} from "../../src/ui/layout/tabletopOverlay";
import type { RollLogEntry } from "../../src/domain/rules/types";
import { firstCharacter } from "./helpers";

test('tabletop overlay state keeps heavy surfaces exclusive', () => {
  let overlay = openTabletopPanel({ kind: 'none' }, 'party');
  assert.equal(tabletopPanelFromOverlay(overlay), 'party');
  overlay = openTabletopPanel(overlay, 'party');
  assert.deepEqual(overlay, { kind: 'none' });

  overlay = openTabletopLeftRail(overlay, 'feed');
  assert.deepEqual(overlay, { kind: 'leftRail', rail: 'feed' });
  assert.equal(tabletopPanelFromOverlay(overlay), null);
  overlay = openTabletopLeftRail(overlay, 'feed');
  assert.deepEqual(overlay, { kind: 'none' });

  overlay = openTabletopPanel(overlay, 'handouts');
  assert.equal(tabletopPanelFromOverlay(overlay), 'handouts');
  overlay = openTabletopDrawer();
  assert.deepEqual(overlay, { kind: 'drawer' });
  assert.equal(tabletopPanelFromOverlay(overlay), null);

  overlay = openTabletopSheet({ type: 'character', id: 'pc-1' });
  assert.deepEqual(overlay, { kind: 'sheet', sheet: { type: 'character', id: 'pc-1' } });
  overlay = openTabletopBuilder();
  assert.deepEqual(overlay, { kind: 'builder' });
  overlay = openTabletopCardActivation({ actorId: 'pc-1', cardId: 'card-1' });
  assert.deepEqual(overlay, { kind: 'cardActivation', card: { actorId: 'pc-1', cardId: 'card-1' } });
  assert.equal(tabletopPanelFromOverlay(overlay), null);
  assert.deepEqual(closeTabletopOverlay(), { kind: 'none' });
});

test('table feed maps table history into cinematic activity events', () => {
  resetAllStores();
  const character = firstCharacter();
  character.domainCards = [{
    id: 'card-flight',
    name: 'Вдохновляющие слова',
    domain: 'Grace',
    level: 1,
    cost: 'Стресс 1',
    text: 'Когда союзник слышит ваши слова, он получает поддержку.',
    inLoadout: true,
    imageUrl: './image/domain/grace-1.jpg',
    tokens: { value: 1, max: 3 }
  }];
  const rollLog: RollLogEntry[] = [
    {
      id: 'log-card',
      type: 'manual',
      createdAt: '2026-05-21T08:00:00.000Z',
      title: 'Карта активирована',
      text: 'Вдохновляющие слова: эффект применен.'
    },
    {
      id: 'log-roll',
      type: 'action',
      createdAt: '2026-05-21T07:58:00.000Z',
      actorId: character.id,
      actorName: character.name,
      trait: 'agility',
      difficulty: 12,
      hopeDie: 7,
      fearDie: 2,
      advantageRolls: [],
      disadvantageRolls: [],
      keptExtraDie: 0,
      modifiers: [],
      total: 14,
      success: true,
      isCritical: false,
      outcome: 'successWithHope',
      consequenceApplied: false
    },
    {
      id: 'log-message',
      type: 'manual',
      createdAt: '2026-05-21T07:55:00.000Z',
      title: character.name,
      text: 'Открываю дверь.'
    }
  ];

  const feed = buildTableFeed({ rollLog, characters: [character], maxItems: 3 });

  assert.equal(feed[0].kind, 'card');
  assert.equal(feed[0].title, 'Вдохновляющие слова');
  assert.equal(feed[0].authorName, character.name);
  assert.equal(feed[1].kind, 'roll');
  assert.equal(feed[1].title, `${character.name}: 14 с Надеждой`);
  assert.equal(feed[1].body, 'Проворность / Надежда 7 / Страх 2 / Сложность 12');
  assert.equal(feed[1].roll?.total, 14);
  assert.equal(feed[2].kind, 'message');
  assert.equal(feed[2].authorName, character.name);
  assert.equal(feed[2].kicker, 'Сообщение');
});

test('tabletop service maps every encounter flow action to a real UI or state effect', () => {
  const base = {
    selectedCharacter: null,
    trait: 'agility' as const,
    difficulty: 12
  };

  assert.deepEqual(tabletopService.executeEncounterFlowAction('select', base), { kind: 'openPanel', panel: 'party' });
  assert.deepEqual(tabletopService.executeEncounterFlowAction('review', base), { kind: 'openDrawer', tab: 'gm' });
});

test('encounter flow suggests the next GM live-session action outside UI', () => {
  const game = { spotlight: 'players' as const, fear: 2 };
  const prep = buildEncounterFlow({
    game,
    encounter: { status: 'prep', activeAdversaryId: null },
    selectedActor: null
  });
  assert.equal(prep.primary.action, 'start');

  const selected = buildEncounterFlow({
    game,
    encounter: { status: 'active', activeAdversaryId: 'adv-1' },
    selectedActor: { kind: 'adversary', name: 'Raider' }
  });
  assert.equal(selected.primary.action, 'roll');
  assert.match(selected.primary.detail, /без автоматического применения/);
});
