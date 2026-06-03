import { test } from "vitest";
import assert from "node:assert/strict";
import { inferExplicitAdversaryFeatureCost, parseAdversaryFeatureCost } from "../../src/domain/rules/adversaries";
import { actionComposerModifierPreview, addAdvantageDie, buildActionComposerRollOptions, normalizeActionComposerState } from "../../src/domain/rules/actionComposer";
import { resetAllStores, charactersStore } from "../../src/stores/gameStores";
import { gameService, characterService, diceService, encounterService } from "../../src/services/serviceRegistry";
import { firstCharacter } from "./helpers";

test('action composer domain maps UI state into dice request options', () => {
  const character = firstCharacter();
  character.experiences = [
    { id: 'scout', name: 'Scout', modifier: 2 },
    { id: 'duelist', name: 'Duelist', modifier: 1 }
  ];

  const normalized = normalizeActionComposerState(character, {
    advantageMode: 1,
    experienceIds: ['scout', 'missing', 'scout'],
    spendHopeForExperiences: true
  });

  assert.deepEqual(normalized.experienceIds, ['scout']);
  assert.deepEqual(buildActionComposerRollOptions(normalized), {
    advantageCount: 1,
    disadvantageCount: 0,
    experienceIds: ['scout'],
    spendHopeForExperiences: true
  });
  assert.equal(actionComposerModifierPreview(character, normalized), 2);
  assert.deepEqual(buildActionComposerRollOptions({ ...normalized, advantageMode: -1 }), {
    advantageCount: 0,
    disadvantageCount: 1,
    experienceIds: ['scout'],
    spendHopeForExperiences: true
  });
  assert.deepEqual(buildActionComposerRollOptions({ ...normalized, advantageMode: 0, advantageCount: 2, disadvantageCount: 0 }), {
    advantageCount: 2,
    disadvantageCount: 0,
    experienceIds: ['scout'],
    spendHopeForExperiences: true
  });
  assert.deepEqual(addAdvantageDie({ advantageCount: 2, disadvantageCount: 0 }, 'disadvantage'), {
    advantageCount: 1,
    disadvantageCount: 0
  });
  assert.deepEqual(addAdvantageDie({ advantageCount: 0, disadvantageCount: 1 }, 'advantage'), {
    advantageCount: 0,
    disadvantageCount: 0
  });
});

test('Experience modifiers spend Hope by default and can be explicitly free', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.setHope(character.id, 2);
  character.experiences = [{ id: 'scout', name: 'Scout', modifier: 2 }];
  charactersStore.update((state) => ({ ...state, entities: { ...state.entities, [character.id]: character } }));
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    diceService.rollAction({ actorId: character.id, trait: 'agility', difficulty: 0, experienceIds: ['scout'], applyConsequences: false });
    assert.equal(characterService.getCharacter(character.id)?.hope.value, 1);
    diceService.rollAction({ actorId: character.id, trait: 'agility', difficulty: 0, experienceIds: ['scout'], spendHopeForExperiences: false, applyConsequences: false });
    assert.equal(characterService.getCharacter(character.id)?.hope.value, 1);
  } finally {
    Math.random = originalRandom;
  }
});

test('adversary feature costs are parsed for display but not applied automatically', () => {
  resetAllStores();
  gameService.setFear(2);
  const adversary = encounterService.createAdversary({
    name: 'Глашатай',
    stress: { marked: 0, max: 2 },
    features: [
      { id: 'feature-fear', name: 'Крик ужаса', kind: 'fear', cost: 'Страх 1', text: 'Все цели рядом дрожат.' },
      { id: 'feature-stress', name: 'Напор', kind: 'action', cost: 'Стресс 1', text: 'Сдвинь цель.' }
    ]
  });

  assert.deepEqual(parseAdversaryFeatureCost(adversary.features[0]), { fear: 1, stress: 0 });
  assert.deepEqual(inferExplicitAdversaryFeatureCost('Spend 2 Fear to strike.'), { kind: 'fear', cost: 'Страх 2' });
  assert.deepEqual(inferExplicitAdversaryFeatureCost('Cost: 2 Stress to keep the shield raised.'), { cost: 'Стресс 2' });
  assert.deepEqual(inferExplicitAdversaryFeatureCost('Цена: Страх, чтобы открыть портал.'), { kind: 'fear', cost: 'Страх 1' });
  assert.deepEqual(inferExplicitAdversaryFeatureCost('Страх окружает цель, но цена не указана.'), { cost: '' });

  assert.equal(gameService.game$.get().fear, 2);
  assert.equal(encounterService.getAdversary(adversary.id)?.stress.marked, 0);
});
