import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Store } from '../../src/core/store/Store';
import { createUnifiedRollDraft, editUnifiedRollDice } from '../../src/domain/rules/unifiedRollDraft';
import { unifiedRollCompleteFormula, applyUnifiedFormulaEdit } from '../../src/domain/rules/unifiedRollPresentation';
import { UnifiedRollExecutionService } from '../../src/services/UnifiedRollExecutionService';
import { buildTableFeedFromEntries, createFeedEntriesFromRollLog } from '../../src/domain/tabletop/feed';
import { dualityDiceRollToPolyhedral } from '../../src/ui/dice/types';
import { characterService, diceService, p2pSessionService } from '../../src/services/serviceRegistry';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import type { PlayerRollIntent } from '../../src/services/SyncService';
import { resetAllStores } from '../../src/stores/gameStores';

function fixture() {
  resetAllStores();
  const actor = characterService.createCharacter({ name: 'Extra actor' });
  const draft = createUnifiedRollDraft({ actor: { key: actor.id, id: actor.id, kind: 'character', name: actor.name }, scopeKey: 'scope',
    mode: 'action', title: 'Check', formula: '2d12', experienceIds: ['chosen'], manualModifier: 3, advantageCount: 1 });
  return { actor, draft };
}

test('palette extra add/remove retains the pair, actor, experience and ordinary advantage', () => {
  const { draft } = fixture();
  const added = editUnifiedRollDice(draft, 6, 1);
  assert.equal(added.requiresManual, false);
  assert.equal(added.draft.mode, 'action');
  assert.equal(added.draft.formula, '2d12');
  assert.deepEqual(added.draft.actor, draft.actor);
  assert.deepEqual(added.draft.experienceIds, ['chosen']);
  assert.equal(added.draft.spendHopeForExperiences, true);
  assert.equal(unifiedRollCompleteFormula(added.draft, 2), '2d12+1d6+5+1d6');
  const removed = editUnifiedRollDice(added.draft, 6, -1, 'extra');
  assert.equal(removed.requiresManual, false);
  assert.deepEqual(removed.draft.extraDice, []);
  assert.equal(removed.draft.formula, '2d12');
  assert.equal(editUnifiedRollDice(added.draft, 12, -1, 'base').requiresManual, true);
});

test('formula edits reserve visible ordinary advantage and keep additive dice separate', () => {
  const { draft } = fixture();
  const edited = applyUnifiedFormulaEdit(draft, '2d12+2d6+7', 2);
  assert.equal(edited.requiresManual, false);
  assert.deepEqual(edited.draft.extraDice, [{ count: 1, sides: 6 }]);
  assert.equal(edited.draft.advantageCount, 1);
  assert.equal(edited.draft.manualModifier, 5);
  assert.equal(applyUnifiedFormulaEdit(draft, '1d12+2d6+7', 2).requiresManual, true);
});

test('unsupported authority refuses typed extras before send, local RNG or payment; supported authority receives the whole pool', async () => {
  const { actor, draft } = fixture();
  const extra = { ...draft, experienceIds: [], extraDice: [{ count: 1, sides: 6 }] };
  const hopeBefore = characterService.getCharacter(actor.id)!.hope.value;
  const session = new Store<P2PSessionState>({ ...p2pSessionService.session$.get(), role: 'player', connected: true, status: 'connected' });
  let localCalls = 0;
  const noLocal = (): never => { localCalls++; return undefined as never; };
  const dice = { rollAction: noLocal, rollReaction: noLocal, rollDamage: noLocal, rollManualDice: noLocal, rollGmAttackCheck: noLocal };
  const sent: PlayerRollIntent[] = [];
  for (const supported of [false, true]) {
    const service = new UnifiedRollExecutionService(dice, { session$: session.toStream(), isConnectedPlayerSession: () => true,
      supportsExtraActionDice: () => supported,
      submitPlayerRollIntent: async (input) => { sent.push(input.intent); return true; }
    }, () => 'scope');
    const result = await service.execute(extra, 'player', 'public', [actor.id]);
    assert.equal(result.ok, supported);
    if (!supported) assert.match(result.error ?? '', /Мастер не подтвердил поддержку/);
  }
  assert.equal(localCalls, 0);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].type === 'duality' ? sent[0].extraDice : undefined, extra.extraDice);
  assert.equal(characterService.getCharacter(actor.id)!.hope.value, hopeBefore);
});

test('individual extra values survive feed and 3D projection exactly once under the original roll ID', () => {
  resetAllStores();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const roll = diceService.rollAction({ difficulty: 12, extraDice: [{ count: 2, sides: 6 }] });
    const dice = buildTableFeedFromEntries({ feed: createFeedEntriesFromRollLog([roll]), role: 'gm' })[0].roll?.dice;
    assert.equal(dice?.kind, 'duality');
    assert.deepEqual(dice?.kind === 'duality' ? dice.extraDiceTerms?.flatMap((term) => term.rolls) : null, [1, 1]);
    const visual = dualityDiceRollToPolyhedral(roll);
    assert.equal(visual.id, roll.id);
    assert.equal(visual.total, roll.total);
    assert.equal(visual.dice.length, 4);
    assert.deepEqual(visual.dice.map((die) => die.sides), [12, 12, 6, 6]);
    assert.equal(new Set(visual.dice.map((die) => die.id)).size, 4);
    assert.deepEqual(roll.extraDiceTerms?.flatMap((term) => term.rolls), [1, 1]);
  } finally { Math.random = originalRandom; }
});
