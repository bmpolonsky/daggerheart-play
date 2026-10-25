import { test } from 'vitest';
import assert from 'node:assert/strict';
import { eventRollCompatibility, type EventRollContext } from '../../src/domain/rules/eventRoll';
import { createUnifiedRollDraft, convertUnifiedRollToManual, editUnifiedRollDice, unlinkUnifiedRollEvent } from '../../src/domain/rules/unifiedRollDraft';
import { applyUnifiedFormulaEdit } from '../../src/domain/rules/unifiedRollPresentation';
import { UnifiedRollExecutionService, type EventRollDelegate } from '../../src/services/UnifiedRollExecutionService';
import { characterService, p2pSessionService } from '../../src/services/serviceRegistry';
import { resetAllStores } from '../../src/stores/gameStores';

function fixture(kind: 'rest' | 'death' | 'teamwork' = 'teamwork') {
  resetAllStores();
  const actor = characterService.createCharacter({ name: 'Event actor' });
  const base = { scopeKey: 'scope', entryId: 'event-1', actorId: actor.id, fingerprint: 'request-v1' };
  const context: EventRollContext = kind === 'rest' ? { ...base, kind, choiceId: 'choice-1', formula: '1d4' }
    : kind === 'death' ? { ...base, kind, deathChoice: 'avoidDeath' }
    : { ...base, kind, teamworkRole: 'leader', rollType: 'action', trait: 'agility', difficulty: 12, supportModifier: 0 };
  const draft = createUnifiedRollDraft({ actor: { key: `character:${actor.id}`, kind: 'character', id: actor.id, name: actor.name },
    mode: kind === 'teamwork' ? 'action' : 'manual', title: 'Bound event', formula: kind === 'rest' ? '1d4' : kind === 'death' ? '1d12' : '2d12',
    trait: kind === 'teamwork' ? 'agility' : undefined, difficulty: kind === 'teamwork' ? 12 : undefined,
    scopeKey: 'scope', eventContext: context });
  let ordinaryCalls = 0;
  const record = (): never => { ordinaryCalls++; return undefined as never; };
  const dice = { rollAction: record, rollReaction: record, rollDamage: record, rollManualDice: record, rollGmAttackCheck: record };
  return { actor, context, draft, dice, ordinaryCalls: () => ordinaryCalls };
}

test('event identity survives formula editing, dice editing and explicit manual conversion', () => {
  const { context, draft } = fixture();
  assert.notEqual(draft.eventContext, context);
  const adjusted = applyUnifiedFormulaEdit(draft, '2d12+3', 0).draft;
  assert.equal(adjusted.eventContext?.entryId, context.entryId);
  const edit = editUnifiedRollDice(adjusted, 6, 1);
  assert.equal(edit.requiresManual, true);
  const manual = convertUnifiedRollToManual(adjusted, '2d12+1d6+3');
  assert.equal(manual.eventContext?.entryId, context.entryId);
  assert.equal(manual.eventContext?.fingerprint, 'request-v1');
  assert.equal(manual.eventContext?.manualOverride, undefined);
  assert.equal(eventRollCompatibility(manual.eventContext!, manual).manualOverrideRequired, true);
});

test('missing event delegate refuses before any ordinary RNG or fallback', async () => {
  const { actor, draft, dice, ordinaryCalls } = fixture();
  const service = new UnifiedRollExecutionService(dice, p2pSessionService, () => 'scope');
  const result = await service.execute(draft, 'gm', 'public', [actor.id]);
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /событийного броска недоступна/);
  assert.equal(ordinaryCalls(), 0);
});

test('event delegate executes exactly once and returns the same committed roll ID without ordinary RNG', async () => {
  const { actor, draft, dice, ordinaryCalls } = fixture();
  let delegatedCalls = 0;
  const delegate: EventRollDelegate = {
    error: () => null,
    execute: (received) => { delegatedCalls++; assert.equal(received.eventContext?.entryId, 'event-1'); return { ok: true, rollId: 'one-committed-roll' }; }
  };
  const service = new UnifiedRollExecutionService(dice, p2pSessionService, () => 'scope', delegate);
  assert.deepEqual(await service.execute(draft, 'gm', 'public', [actor.id]), { ok: true, rollId: 'one-committed-roll' });
  assert.equal(delegatedCalls, 1);
  assert.equal(ordinaryCalls(), 0);
});

test('closed-event preflight and delegate failure never fall back to an ordinary roll', async () => {
  const { actor, draft, dice, ordinaryCalls } = fixture();
  let executed = 0;
  const closed: EventRollDelegate = { error: () => 'Событие закрыто.', execute: () => { executed++; return { ok: true }; } };
  assert.equal((await new UnifiedRollExecutionService(dice, p2pSessionService, () => 'scope', closed).execute(draft, 'gm', 'public', [actor.id])).ok, false);
  assert.equal(executed, 0);
  const failing: EventRollDelegate = { error: () => null, execute: () => { executed++; throw new Error('commit failure'); } };
  assert.equal((await new UnifiedRollExecutionService(dice, p2pSessionService, () => 'scope', failing).execute(draft, 'gm', 'public', [actor.id])).ok, false);
  assert.equal(executed, 1);
  assert.equal(ordinaryCalls(), 0);
});

test('death pool remains bound and incompatible after editing or conversion, even with a manual-override flag', () => {
  const { draft } = fixture('death');
  assert.equal(eventRollCompatibility(draft.eventContext!, draft).error, undefined);
  const changed = editUnifiedRollDice(draft, 6, 1).draft;
  assert.equal(changed.eventContext?.entryId, 'event-1');
  const converted = convertUnifiedRollToManual(changed, '2d12');
  assert.match(eventRollCompatibility({ ...converted.eventContext!, manualOverride: true }, converted).error ?? '', /предсмертный ход требует 1d12/);
});

test('rest overrides remain explicit and explicit unlink is the only route to an ordinary roll', async () => {
  const { actor, draft, dice, ordinaryCalls } = fixture('rest');
  const modified = applyUnifiedFormulaEdit(draft, '2d4+2', 0).draft;
  assert.equal(modified.eventContext?.entryId, 'event-1');
  assert.equal(modified.eventContext?.manualOverride, undefined);
  assert.equal(eventRollCompatibility(modified.eventContext!, modified).manualOverrideRequired, true);
  const ordinary = unlinkUnifiedRollEvent(modified);
  assert.equal(ordinary.eventContext, undefined);
  assert.equal(ordinary.eventUnlinked, true);
  assert.equal(ordinary.actor.id, actor.id);
  const service = new UnifiedRollExecutionService(dice, p2pSessionService, () => 'scope');
  assert.equal((await service.execute(ordinary, 'gm', 'public', [actor.id])).ok, true);
  assert.equal(ordinaryCalls(), 1);
});
