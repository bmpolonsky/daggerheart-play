import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createAdversary } from '../../src/domain/rules/factories';
import { previewAdversaryDamage } from '../../src/domain/rules/adversaryDamage';
import { EncounterService } from '../../src/services/EncounterService';
import { encounterStore, resetAllStores } from '../../src/stores/gameStores';

for (const [amount, wounds] of [[0, 0], [1, 1], [6, 1], [7, 2], [13, 2], [14, 3], [200, 3]]) {
  test(`incoming damage ${amount} uses this adversary's7/14 thresholds => ${wounds} wounds`, () => {
    const adversary = createAdversary({ thresholds: { major: 7, severe: 14 }, hp: { marked: 0, max: 5 } });
    const result = previewAdversaryDamage(adversary, amount);
    assert.equal(result.valid, true);
    if (result.valid) assert.equal(result.appliedWounds, wounds);
  });
}

test('actual remaining wounds and duplicate/stale apply are safe; incoming does not roll outgoing damage', () => {
  resetAllStores();
  const service = new EncounterService();
  const adversary = service.createAdversary({ hp: { marked: 3, max: 4 }, thresholds: { major: 7, severe: 14 } });
  const preview = previewAdversaryDamage(adversary, 20);
  assert.equal(preview.valid, true);
  if (!preview.valid) throw new Error('Expected valid plan');
  assert.equal(preview.wounds, 3);
  assert.equal(preview.appliedWounds, 1);
  assert.equal(service.applyAdversaryDamage(preview).appliedWounds, 1);
  assert.equal(encounterStore.get().adversaries[adversary.id].hp.marked, 4);
  assert.equal(encounterStore.get().adversaries[adversary.id].conditions.some(item => item.name === 'defeated'), true);
  assert.equal(service.applyAdversaryDamage(preview).applied, false);
  assert.equal(encounterStore.get().adversaries[adversary.id].hp.marked, 4);
  assert.deepEqual(encounterStore.get().adversaries[adversary.id].standardAttack, adversary.standardAttack);
});

test('invalid amount/threshold and changed or removed target cannot apply a stale preview', () => {
  resetAllStores();
  const service = new EncounterService();
  const adversary = service.createAdversary({ hp: { marked: 0, max: 5 }, thresholds: { major: 7, severe: 14 } });
  for (const amount of [null, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(previewAdversaryDamage(adversary, amount).valid, false);
  assert.equal(previewAdversaryDamage({ ...adversary, thresholds: { major: 20, severe: 10 } }, 5).valid, false);
  const preview = previewAdversaryDamage(adversary, 10);
  if (!preview.valid) throw new Error('Expected valid plan');
  service.updateAdversarySlots(adversary.id, 'hp', { marked: 1 });
  assert.equal(service.applyAdversaryDamage(preview).applied, false);
  assert.equal(encounterStore.get().adversaries[adversary.id].hp.marked, 1);
  encounterStore.update(state => ({ ...state, adversaries: {} }));
  assert.equal(service.applyAdversaryDamage(preview).applied, false);
});
