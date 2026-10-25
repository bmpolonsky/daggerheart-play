import { test } from 'vitest';
import assert from 'node:assert/strict';
import { actionRollFormulaPreview, parseManualRollModifier } from '../../src/domain/rules/manualRollModifier';
import { buildActionComposerRollOptions, normalizeActionComposerState } from '../../src/domain/rules/actionComposer';
import { CharacterRollService } from '../../src/services/CharacterRollService';
import { characterService, diceService } from '../../src/services/serviceRegistry';
import { resetAllStores } from '../../src/stores/gameStores';

test('manual modifier accepts signed safe integers and refuses malformed values without truncation', () => {
  for (const [text, value] of [['', 0], [' +6 ', 6], ['-2', -2], ['−2', -2], ['0', 0]] as const) {
    assert.deepEqual(parseManualRollModifier(text), { valid: true, value });
  }
  for (const text of ['+', '6.5', '1e3', 'NaN', 'Infinity', '9007199254740992', '6+2']) {
    assert.equal(parseManualRollModifier(text).valid, false);
  }
});

test('manual modifier composes with trait and experience and does not replace other terms', () => {
  assert.equal(actionRollFormulaPreview({ traitModifier: 2, experienceModifier: 3, manualModifier: -2, advantageCount: 1, disadvantageCount: 0 }), '2d12 + 2 + 3 − 2 + d6');
  assert.equal(actionRollFormulaPreview({ traitModifier: 0, experienceModifier: 0, manualModifier: 6, advantageCount: 1, disadvantageCount: 1 }), '2d12 + 6');
  assert.equal(actionRollFormulaPreview({ traitModifier: 0, experienceModifier: 0, manualModifier: 0, advantageCount: 3, disadvantageCount: 1 }), '2d12 + d6');
  assert.equal(actionRollFormulaPreview({ traitModifier: 0, experienceModifier: 0, manualModifier: 0, advantageCount: 0, disadvantageCount: 3 }), '2d12 − d6');
  const state = { advantageMode: 0 as const, experienceIds: [], spendHopeForExperiences: true, manualModifier: -2 };
  assert.equal(normalizeActionComposerState(null, state).manualModifier, -2);
  assert.equal(buildActionComposerRollOptions(state).manualModifier, -2);
  assert.equal('manualModifier' in buildActionComposerRollOptions({ ...state, manualModifier: 0 }), false);
});

test('ordinary action and reaction sources cancel pairwise and leave at most one newly rolled d6', () => {
  resetAllStores();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    for (const rollType of ['action', 'reaction'] as const) {
      for (const [advantageCount, disadvantageCount, sign] of [[4, 1, 1], [1, 4, -1], [3, 3, 0]] as const) {
        const request = { difficulty: 12, advantageCount, disadvantageCount, manualModifier: 6 };
        const result = rollType === 'action' ? diceService.rollAction(request) : diceService.rollReaction(request);
        assert.equal(result.advantageRolls.length, sign > 0 ? 1 : 0);
        assert.equal(result.disadvantageRolls.length, sign < 0 ? 1 : 0);
        assert.equal(result.keptExtraDie, sign);
        assert.equal(result.modifiers.find((part) => part.label === 'Вручную')?.value, 6);
      }
    }
  } finally { Math.random = originalRandom; }
});

test('existing local dice manual modifier applies exactly once without Hope payment or an extra advantage die', () => {
  resetAllStores();
  const actor = characterService.createCharacter({ name: 'Manual modifier actor' });
  const hopeBefore = actor.hope.value;
  const action = diceService.rollAction({ actorId: actor.id, difficulty: 12, manualModifier: 6, applyConsequences: false });
  assert.equal(action.total, action.hopeDie + action.fearDie + 6);
  assert.deepEqual(action.modifiers, [{ label: 'Вручную', value: 6 }]);
  assert.deepEqual(action.advantageRolls, []);
  assert.equal(characterService.getCharacter(actor.id)?.hope.value, hopeBefore);
  const reaction = diceService.rollReaction({ actorId: actor.id, difficulty: 12, manualModifier: -2 });
  assert.equal(reaction.total, reaction.hopeDie + reaction.fearDie - 2);
  assert.equal(characterService.getCharacter(actor.id)?.hope.value, hopeBefore);
});

test('shared roll service forwards existing manualModifier unchanged to local and remote execution', () => {
  for (const connected of [false, true]) {
    const calls: Array<{ kind: string; request: any }> = [];
    const record = (kind: string) => (request: unknown): never => { calls.push({ kind, request }); return undefined as never; };
    const service = new CharacterRollService({
      dice: { rollAction: record('action'), rollReaction: record('reaction'), rollDamage: record('damage'), rollManualDice: record('manual') },
      session: { isConnectedPlayerSession: () => connected, submitPlayerRollIntent: async (request) => { calls.push({ kind: 'remote', request }); return true; } },
      autoApplyConsequences: () => false
    });
    service.action({ id: 'manual-actor', name: 'Actor' }, { kind: 'trait', title: 'Trait', trait: 'agility' },
      { advantageCount: 0, disadvantageCount: 0, experienceIds: [], spendHopeForExperiences: true, manualModifier: -2 }, 'action', 'public', 'player');
    assert.equal(calls.length, 1);
    assert.equal(connected ? calls[0].request.intent.manualModifier : calls[0].request.manualModifier, -2);
    assert.equal(calls[0].kind, connected ? 'remote' : 'action');
  }
});
