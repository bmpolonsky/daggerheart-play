import { test } from "vitest";
import assert from "node:assert/strict";
import { buildCharacterLevelUpPlan, characterLevelRank, formatLevelUpNotes } from "../../src/domain/rules/levelUp";
import { resetAllStores } from "../../src/stores/gameStores";
import { characterService } from "../../src/services/serviceRegistry";
import { firstCharacter } from "./helpers";

test('character service level-up workflow updates level, proficiency, choices and notes', () => {
  resetAllStores();
  const character = firstCharacter();
  const plan = buildCharacterLevelUpPlan(character, {
    targetLevel: 5,
    advancementChoices: ['multiclass', 'domainCard'],
    multiclassClass: 'Wizard',
    multiclassDomain: 'Codex'
  });
  assert.equal(characterLevelRank(1), 1);
  assert.equal(characterLevelRank(5), 3);
  assert.equal(plan.targetRank, 3);
  assert.equal(plan.multiclassAvailable, true);
  assert.equal(plan.multiclassDomainCardMaxLevel, 3);
  assert.deepEqual(plan.rankAchievements, ['Новый Опыт +2', '+1 к Мастерству', 'Снять отметки характеристик']);
  assert.equal(plan.warnings.some((warning) => warning.includes('стоит два улучшения')), true);
  const notes = formatLevelUpNotes({
    plan,
    choices: ['multiclass', 'domainCard'],
    multiclassClass: 'Wizard',
    multiclassDomain: 'Codex',
    traitBonuses: { agility: 1 },
    extraNotes: 'Level 5 advancement.'
  });
  assert.match(notes, /Мультикласс: Wizard \/ Codex/);
  assert.match(notes, /agility \+1/);
  const applied = characterService.applyLevelUp(character.id, {
    level: 5,
    proficiency: 2,
    advancementChoices: ['multiclass', 'domainCard'],
    traitBonuses: { agility: 1 },
    hpMax: 7,
    stressMax: 8,
    evasion: 12,
    experiences: [{ name: 'Veteran', modifier: 2 }],
    domainCards: [{ id: 'level-card', name: 'Level Card', domain: 'Blade', level: 5, text: 'New trick.', inLoadout: true }],
    notes
  });
  const updated = characterService.getCharacter(character.id);
  assert.equal(applied, true);
  assert.equal(updated?.level, 5);
  assert.equal(updated?.proficiency, 2);
  assert.equal(updated?.traits.agility, character.traits.agility + 1);
  assert.equal(updated?.hp.max, 7);
  assert.equal(updated?.stress.max, 8);
  assert.equal(updated?.evasion, 12);
  assert.equal(updated?.experiences.some((experience) => experience.name === 'Veteran'), true);
  assert.equal(updated?.domainCards.some((card) => card.id === 'level-card'), true);
  assert.equal(updated?.notes.includes('Level 5 advancement.'), true);
  assert.equal(updated?.notes.includes('Улучшения:'), true);
});
