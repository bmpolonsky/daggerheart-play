import { test } from 'vitest';
import assert from 'node:assert/strict';
import { resetAllStores } from '../../src/stores/gameStores';
import { characterService } from '../../src/services/serviceRegistry';
import { buildCharacterSummary } from '../../src/domain/tabletop/playerView';

test('manual condition details survive service edits and invalid updates leave the sheet unchanged', () => {
  resetAllStores();
  const actor = characterService.createCharacter();
  assert.equal(characterService.addCustomCondition(actor.id, { name: ' Проклятие ', notes: ' Не спит ', removalCondition: ' После обряда ' }), true);
  const condition = characterService.getCharacter(actor.id)!.conditions[0];
  assert.equal(condition.name, 'Проклятие');
  assert.equal(condition.notes, 'Не спит');
  assert.equal(condition.removalCondition, 'После обряда');
  const displayed = buildCharacterSummary(characterService.getCharacter(actor.id)!).conditions[0];
  assert.equal(displayed.name, 'Проклятие');
  assert.equal(displayed.removalCondition, 'После обряда');
  assert.equal(characterService.updateCustomCondition(actor.id, condition.id, { name: 'Проклятие', notes: 'Ослаблено', removalCondition: 'Снять вручную' }), true);
  assert.equal(characterService.getCharacter(actor.id)!.conditions[0].id, condition.id);
  const before = characterService.getCharacter(actor.id);
  assert.equal(characterService.updateCustomCondition(actor.id, 'missing', { name: 'Другое' }), false);
  assert.equal(characterService.addCustomCondition(actor.id, { name: 'Побеждён' }), false);
  assert.equal(characterService.getCharacter(actor.id), before);
});
