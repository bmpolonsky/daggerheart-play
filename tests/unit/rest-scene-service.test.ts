import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { resetAllStores } from '../../src/stores/gameStores';
import { characterService, diceService, feedService, gameService, sceneTableService, tabletopService } from '../../src/services/serviceRegistry';
import { createTokenState } from '../../src/domain/tabletop/factories';

test('rest snapshots scene PCs, deduplicates tokens, and finishes once without resetting other world characters', () => {
  resetAllStores();
  const characters = Array.from({ length: 8 }, (_, index) => characterService.createCharacter({
    name: `Rest PC ${index}`,
    usageTrackers: [{ id: `track-${index}`, targetKind: 'feature', targetId: 'rest-test', label: 'Отдых', current: 1, max: 2, reset: 'long' }]
  }));
  const actor = characters[0];
  sceneTableService.createScene({ tokens: [
    createTokenState({ kind: 'character', id: actor.id }),
    createTokenState({ kind: 'character', id: actor.id }),
    createTokenState({ kind: 'adversary', id: 'enemy' })
  ] });
  const entry = tabletopService.requestSceneRest('long');
  assert.deepEqual(entry.rest.participants.map((participant) => participant.actorId), [actor.id]);
  sceneTableService.createScene({ tokens: [createTokenState({ kind: 'character', id: characters[1].id })] });
  const plan = tabletopService.completeRest(entry.id, { rng: () => 0 });
  assert.equal(plan?.total, 2);
  assert.equal(plan?.pcCount, 1);
  assert.equal(gameService.game$.get().fear, 2);
  assert.equal(characterService.getCharacter(actor.id)?.usageTrackers?.[0].current, 0);
  for (const other of characters.slice(1)) assert.equal(characterService.getCharacter(other.id)?.usageTrackers?.[0].current, 1);
  assert.equal(tabletopService.completeRest(entry.id, { rng: () => 0.99 }), null);
  assert.equal(gameService.game$.get().fear, 2);
});

test('rest reports actual healing and Hope after caps, and completed rest cannot apply a move', () => {
  resetAllStores();
  const actor = characterService.createCharacter({ hp: { marked: 1, max: 6 }, hope: { value: 6, max: 6 } });
  const entry = feedService.requestRest('short', {
    participants: [{ actorId: actor.id, actorName: actor.name, choices: [{ id: 'heal', label: 'Залечить Раны', count: 1 }, { id: 'prepare', label: 'Подготовка', count: 1 }] }]
  });
  const original = diceService.rollManualDice.bind(diceService);
  const rollSpy = vi.spyOn(diceService, 'rollManualDice');
  rollSpy.mockImplementation((request) => ({ ...original(request), total: 6 }));
  try {
    const healed = tabletopService.resolveRestMove(entry.id, actor.id, 'heal');
    assert.equal(healed.result?.total, 6);
    assert.equal(healed.result?.appliedAmount, 1);
    assert.equal(healed.result?.note, 'Исцелено ран: 1.');
    assert.equal(characterService.getCharacter(actor.id)?.hp.marked, 0);
    assert.equal(tabletopService.resolveRestMove(entry.id, actor.id, 'heal').applied, false);
    const prepared = tabletopService.resolveRestMove(entry.id, actor.id, 'prepare');
    assert.equal(prepared.result?.appliedAmount, 0);
    tabletopService.completeRest(entry.id, { rng: () => 0 });
    assert.equal(tabletopService.resolveRestMove(entry.id, actor.id, 'prepare').applied, false);
  } finally {
    rollSpy.mockRestore();
  }
});
