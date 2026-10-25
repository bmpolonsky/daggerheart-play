import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Store } from '../../src/core/store/Store';
import { createAdversary } from '../../src/domain/rules/factories';
import { createUnifiedRollDraft, type UnifiedRollDraft } from '../../src/domain/rules/unifiedRollDraft';
import { convertUnifiedRollToManual } from '../../src/domain/rules/unifiedRollDraft';
import { editUnifiedRollDice } from '../../src/domain/rules/unifiedRollDraft';
import { applyUnifiedFormulaEdit, unifiedRollDiceConversionFormula } from '../../src/domain/rules/unifiedRollPresentation';
import { UnifiedRollExecutionService } from '../../src/services/UnifiedRollExecutionService';
import { characterService, diceService, p2pSessionService } from '../../src/services/serviceRegistry';
import { charactersStore, encounterStore, gameStore, resetAllStores, rollLogStore } from '../../src/stores/gameStores';
import type { PlayerRollIntentMessage } from '../../src/services/SyncService';
import type { P2PSessionState } from '../../src/services/P2PSessionService';

function actorDraft(overrides: Partial<UnifiedRollDraft> = {}) {
  const character = characterService.createCharacter({ name: 'Scoped actor', className: 'Ranger' });
  const draft = createUnifiedRollDraft({ actor: { key: `character:${character.id}`, kind: 'character', id: character.id, name: character.name },
    mode: 'action', title: 'Check', formula: '2d12', scopeKey: 'scope', ...overrides });
  return { character, draft };
}

test('companion experience is always paid exactly once, even after a stale free-payment draft', async () => {
  resetAllStores();
  gameStore.update((state) => ({ ...state, autoApplyRollConsequences: false }));
  const { character } = actorDraft();
  assert.equal(characterService.ensureRangerCompanion(character.id, { name: 'Companion' }), true);
  characterService.setHope(character.id, 1);
  const experience = characterService.getCharacter(character.id)!.companion!.experiences[0];
  const displayOnly = createUnifiedRollDraft({ actor: { key: 'owner', id: character.id, kind: 'character', name: character.name }, mode: 'action', title: 'Custom card', formula: '2d12', source: { label: 'Компаньон' }, spendHopeForExperiences: false });
  assert.equal(displayOnly.spendHopeForExperiences, false); // display text cannot activate companion rules
  const draft = createUnifiedRollDraft({ actor: { key: 'companion', id: character.id, kind: 'character', name: 'Companion' }, mode: 'action', title: 'Command', formula: '2d12', scopeKey: 'scope',
    source: { label: 'Companion display name', isCompanion: true }, experienceIds: [experience.id], spendHopeForExperiences: false });
  assert.equal(draft.spendHopeForExperiences, true);
  draft.spendHopeForExperiences = false; // stale state must not bypass service-side cost
  const service = new UnifiedRollExecutionService(diceService, p2pSessionService, () => 'scope');
  assert.equal((await service.execute(draft, 'gm', 'public', [])).ok, true);
  assert.equal(characterService.getCharacter(character.id)?.hope.value, 0);
  assert.equal(rollLogStore.get().length, 1);
  assert.match(service.error(draft, 'gm', []) ?? '', /Недостаточно Надежды/);
  assert.equal((await service.execute(draft, 'gm', 'public', [])).ok, false);
  assert.equal(rollLogStore.get().length, 1);
});

test('deleted companion never falls back to its still-existing owner', async () => {
  resetAllStores();
  const { character, draft } = actorDraft({ source: { label: 'Companion display name', isCompanion: true } });
  const service = new UnifiedRollExecutionService(diceService, p2pSessionService, () => 'scope');
  assert.match((await service.execute(draft, 'gm', 'public', [])).error ?? '', /Компаньон.*недоступен/);
  assert.equal(rollLogStore.get().length, 0);
  assert.ok(characterService.getCharacter(character.id));
});

test('stale scope, missing actor and unauthorized player drafts refuse before any roll or payment', async () => {
  resetAllStores();
  const { character, draft } = actorDraft();
  const hope = character.hope.value;
  const service = new UnifiedRollExecutionService(diceService, p2pSessionService, () => 'scope');
  assert.equal((await service.execute({ ...draft, scopeKey: 'old-world' }, 'gm', 'public', [])).ok, false);
  assert.equal((await service.execute(draft, 'player', 'public', [])).ok, false);
  characterService.deleteCharacter(character.id);
  assert.equal((await service.execute(draft, 'gm', 'public', [])).ok, false);
  assert.equal(rollLogStore.get().length, 0);
  assert.equal(character.hope.value, hope);
});

test('damage ignores hidden trait and experience selections and preserves its explicit formula', async () => {
  resetAllStores();
  const { character, draft } = actorDraft({ mode: 'damage', formula: '2d6+3', damageType: 'physical', trait: 'agility', experienceIds: ['old-experience'], manualModifier: 0 });
  const hope = character.hope.value;
  const service = new UnifiedRollExecutionService(diceService, p2pSessionService, () => 'scope');
  assert.equal((await service.execute(draft, 'gm', 'public', [])).ok, true);
  const result = rollLogStore.get()[0];
  assert.equal(result.type, 'damage');
  assert.equal(result.type === 'damage' ? result.formula : '', '2d6+3');
  assert.equal(characterService.getCharacter(character.id)?.hope.value, hope);
});

test('NPC attack retains its attack modifier, experience and Fear payment in the same execution path', async () => {
  resetAllStores();
  const npc = createAdversary({ id: 'npc', name: 'Scoped NPC', attackModifier: 2, experiences: [{ id: 'xp', name: 'Sneak', modifier: 3 }] });
  encounterStore.update((state) => ({ ...state, adversaries: { [npc.id]: npc } }));
  gameStore.update((state) => ({ ...state, fear: 2 }));
  const draft = createUnifiedRollDraft({ actor: { key: 'adversary:npc', kind: 'adversary', id: npc.id, name: npc.name }, mode: 'gmAttack', title: 'Attack', formula: '1d20', scopeKey: 'scope', experienceIds: ['xp'], manualModifier: 1 });
  const service = new UnifiedRollExecutionService(diceService, p2pSessionService, () => 'scope');
  assert.equal((await service.execute(draft, 'gm', 'public', [])).ok, true);
  assert.equal(gameStore.get().fear, 1);
  const result = rollLogStore.get()[0];
  assert.equal(result.type === 'manual' && 'formula' in result ? result.formula : '', '1d20+6');
});

test('online player refusal or transport exception cannot fall back to local execution', async () => {
  resetAllStores();
  const { character, draft } = actorDraft({ manualModifier: -2 });
  const session = new Store<P2PSessionState>({ ...p2pSessionService.session$.get(), role: 'player', connected: true, status: 'connected', message: 'Refused' });
  const sent: PlayerRollIntentMessage['intent'][] = [];
  for (const shouldThrow of [false, true]) {
    const service = new UnifiedRollExecutionService(diceService, {
      session$: session.toStream(), isConnectedPlayerSession: () => true,
      submitPlayerRollIntent: async (input) => { sent.push(input.intent); if (shouldThrow) throw new Error('transport'); return false; }
    }, () => 'scope');
    assert.equal((await service.execute(draft, 'player', 'public', [character.id])).ok, false);
    assert.equal(rollLogStore.get().length, 0);
  }
  assert.equal(sent.length, 2);
  assert.equal(sent[0].type === 'duality' ? sent[0].manualModifier : undefined, -2);
});

test('typed dice palette conversion preserves current ordinary advantage or disadvantage as an explicit die', () => {
  resetAllStores();
  for (const [advantageCount, disadvantageCount, suffix] of [[1, 0, '+1d6'], [0, 1, '-1d6']] as const) {
    const { draft } = actorDraft({ advantageCount, disadvantageCount, manualModifier: 3, extraDice: [{ count: 1, sides: 8 }] });
    const edit = editUnifiedRollDice(draft, 12, -1, 'base');
    assert.equal(edit.requiresManual, true);
    const complete = unifiedRollDiceConversionFormula(draft, edit.proposedFormula, 2);
    assert.equal(complete, `1d12+1d8+5${suffix}`);
    const manual = convertUnifiedRollToManual(draft, complete);
    assert.equal(manual.formula, complete);
    assert.equal(manual.advantageCount, 0);
    assert.equal(manual.disadvantageCount, 0);
  }
});

test('ordinary flat edits keep typed outcome while dice pool changes require explicit conversion', () => {
  resetAllStores();
  const { draft } = actorDraft({ manualModifier: 0 });
  const edited = applyUnifiedFormulaEdit(draft, '2d12+7', 2);
  assert.equal(edited.requiresManual, false);
  assert.equal(edited.draft.mode, 'action');
  assert.equal(edited.draft.manualModifier, 5);
  const additive = applyUnifiedFormulaEdit(draft, '3d12+7', 2);
  assert.equal(additive.requiresManual, false);
  assert.deepEqual(additive.draft.extraDice, [{ count: 1, sides: 12 }]);
  assert.equal(applyUnifiedFormulaEdit(draft, '1d12+7', 2).requiresManual, true);
  assert.equal(draft.formula, '2d12');
});
