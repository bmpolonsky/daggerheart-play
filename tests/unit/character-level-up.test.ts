import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildCharacterLevelUpPlan,
  characterLevelRank,
  formatLevelUpNotes,
  validateCharacterLevelUp
} from '../../src/domain/rules/levelUp';
import { createCharacter, createDomainCard } from '../../src/domain/rules/factories';
import { CharacterService } from '../../src/services/CharacterService';
import { resetAllStores } from '../../src/stores/gameStores';

test('strict level-up applies one level, rank achievement, two improvements and mandatory domain card', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({
    name: 'Ари',
    className: 'Bard',
    domains: ['Grace', 'Codex'],
    experiences: [{ id: 'exp-scout', name: 'Следопыт', modifier: 2 }]
  });
  const input = {
    actor: { id: 'player-1', name: 'Иван', role: 'player' as const },
    level: 2,
    advancementChoices: ['hp', 'traits'] as const,
    proficiency: character.proficiency + 1,
    experiences: [{ name: 'Герой деревни', modifier: 2 }],
    experienceIncreases: [],
    domainCards: [createDomainCard({ id: 'grace-2', sourceId: 'grace-2', name: 'Grace Card', domain: 'Grace', level: 2 })],
    thresholdBonus: { major: character.thresholds.major + 1, severe: character.thresholds.severe + 1 },
    traitBonuses: { agility: 1, strength: 1 },
    hpMax: character.hp.max + 1,
    stressMax: character.stress.max,
    evasion: character.evasion
  };

  const validation = service.validateLevelUp(character.id, input);
  assert.equal(validation?.strictlyValid, true);
  assert.equal(service.applyLevelUp(character.id, input), true);
  const updated = service.getCharacter(character.id)!;
  assert.equal(updated.level, 2);
  assert.equal(updated.proficiency, character.proficiency + 1);
  assert.equal(updated.hp.max, character.hp.max + 1);
  assert.equal(updated.stress.max, character.stress.max);
  assert.equal(updated.traits.agility, character.traits.agility + 1);
  assert.equal(updated.traits.strength, character.traits.strength + 1);
  assert.equal(updated.domainCards.length, 1);
  assert.equal(updated.experiences.at(-1)?.modifier, 2);
  assert.deepEqual(updated.advancement?.markedTraits.sort(), ['agility', 'strength']);
  assert.equal(updated.changeHistory?.at(-1)?.actor.id, 'player-1');
  assert.equal(updated.changeHistory?.at(-1)?.kind, 'levelUp');
});

test('level-up leaves a new card pending an explicit free Hand choice when the Hand is full', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({
    name: 'Ари',
    className: 'Bard',
    domains: ['Grace', 'Codex'],
    experiences: [{ id: 'exp-scout', name: 'Следопыт', modifier: 2 }],
    domainCards: Array.from({ length: 5 }, (_, index) => createDomainCard({
      id: `hand-${index + 1}`,
      sourceId: `hand-${index + 1}`,
      name: `Hand ${index + 1}`,
      domain: 'Grace',
      level: 1,
      inLoadout: true
    }))
  });
  const input = {
    level: 2,
    advancementChoices: ['hp', 'traits'] as const,
    proficiency: character.proficiency + 1,
    experiences: [{ name: 'Герой деревни', modifier: 2 }],
    experienceIncreases: [],
    domainCards: [createDomainCard({
      id: 'new-at-level-up',
      sourceId: 'new-at-level-up',
      name: 'New at level-up',
      domain: 'Grace',
      level: 2,
      recallCost: 'Стресс 3'
    })],
    thresholdBonus: { major: character.thresholds.major + 1, severe: character.thresholds.severe + 1 },
    traitBonuses: { agility: 1, strength: 1 },
    hpMax: character.hp.max + 1,
    stressMax: character.stress.max,
    evasion: character.evasion
  };

  assert.equal(service.applyLevelUp(character.id, input), true);
  const acquired = service.getCharacter(character.id)?.domainCards.find((card) => card.id === 'new-at-level-up');
  assert.equal(acquired?.inLoadout, false);
  assert.equal(acquired?.loadoutChoicePending, true);

  const selected = service.moveDomainCard(character.id, {
    cardId: 'new-at-level-up',
    to: 'hand',
    context: 'levelUp',
    replaceCardId: 'hand-1'
  });
  assert.equal(selected?.applied, true);
  assert.equal(selected?.plan.stressCost, 0);
  assert.equal(service.getCharacter(character.id)?.domainCards.find((card) => card.id === 'new-at-level-up')?.loadoutChoicePending, false);
});

test('strict level-up rejects arbitrary resources, legacy manual choice and omitted mandatory card', () => {
  const character = createCharacter({ level: 2, domains: ['Blade', 'Bone'] });
  const input = {
    level: 3,
    advancementChoices: ['stress', 'manual'] as const,
    proficiency: character.proficiency,
    experiences: [],
    experienceIncreases: [],
    domainCards: [],
    thresholdBonus: { major: character.thresholds.major + 1, severe: character.thresholds.severe + 1 },
    traitBonuses: {},
    hpMax: character.hp.max,
    stressMax: character.stress.max + 5,
    evasion: character.evasion
  };
  const validation = validateCharacterLevelUp(character, input);
  assert.equal(validation.canApply, false);
  assert.equal(validation.issues.some((issue) => issue.code === 'choices.manualForbidden'), true);
  assert.equal(validation.issues.some((issue) => issue.code === 'stress.invalid'), true);
  assert.equal(validation.issues.some((issue) => issue.code === 'domainCards.count'), true);
});

test('level-up rule modifiers extend choices, card grants and stat effects without weakening validation', () => {
  const character = createCharacter({ level: 2, domains: ['Blade', 'Bone'] });
  const modifiers = [
    { id: 'bonus-choice', kind: 'levelUpChoices' as const, source: 'homebrew' as const, label: 'Bonus choice', amount: 1 },
    { id: 'bonus-card', kind: 'levelUpDomainCards' as const, source: 'feature' as const, label: 'Bonus card', amount: 1 },
    { id: 'sturdy', kind: 'levelUpStatDelta' as const, source: 'feature' as const, label: 'Sturdy', choice: 'hp' as const, amount: 1 }
  ];
  const input = {
    level: 3,
    advancementChoices: ['hp', 'stress', 'evasion'] as const,
    ruleModifiers: modifiers,
    proficiency: character.proficiency,
    experiences: [],
    experienceIncreases: [],
    domainCards: [
      createDomainCard({ id: 'blade-a', sourceId: 'blade-a', domain: 'Blade', level: 3 }),
      createDomainCard({ id: 'bone-a', sourceId: 'bone-a', domain: 'Bone', level: 3 })
    ],
    thresholdBonus: { major: character.thresholds.major + 1, severe: character.thresholds.severe + 1 },
    traitBonuses: {},
    hpMax: character.hp.max + 2,
    stressMax: character.stress.max + 1,
    evasion: character.evasion + 1
  };
  const plan = buildCharacterLevelUpPlan(character, {
    targetLevel: 3,
    advancementChoices: [...input.advancementChoices],
    ruleModifiers: modifiers
  });
  assert.equal(plan.requiredAdvancementChoices, 3);
  assert.equal(plan.requiredDomainCards, 2);
  assert.equal(validateCharacterLevelUp(character, input).strictlyValid, true);
});

test('CharacterService automatically applies persisted modifiers and ignores caller-only rule escalation', () => {
  resetAllStores();
  const service = new CharacterService();
  const stored = service.createCharacter({
    level: 2,
    domains: ['Blade', 'Bone'],
    ruleModifiers: [
      { id: 'feature:bonus-choice', kind: 'levelUpChoices', source: 'feature', label: 'Bonus choice', amount: 1 },
      { id: 'feature:bonus-card', kind: 'levelUpDomainCards', source: 'feature', label: 'Bonus card', amount: 1 }
    ]
  });
  const input = {
    level: 3,
    advancementChoices: ['hp', 'stress', 'evasion'] as const,
    proficiency: stored.proficiency,
    experiences: [],
    experienceIncreases: [],
    domainCards: [
      createDomainCard({ id: 'blade-persisted', sourceId: 'blade-persisted', domain: 'Blade', level: 3 }),
      createDomainCard({ id: 'bone-persisted', sourceId: 'bone-persisted', domain: 'Bone', level: 3 })
    ],
    thresholdBonus: { major: stored.thresholds.major + 1, severe: stored.thresholds.severe + 1 },
    traitBonuses: {},
    hpMax: stored.hp.max + 1,
    stressMax: stored.stress.max + 1,
    evasion: stored.evasion + 1
  };
  assert.equal(service.validateLevelUp(stored.id, input)?.strictlyValid, true);
  assert.equal(service.applyLevelUp(stored.id, input), true);
  assert.equal(service.getCharacter(stored.id)?.domainCards.length, 2);

  const ordinary = service.createCharacter({ level: 2, domains: ['Blade', 'Bone'] });
  const escalatedOnlyByCaller = service.validateLevelUp(ordinary.id, {
    ...input,
    ruleModifiers: stored.ruleModifiers
  });
  assert.equal(escalatedOnlyByCaller?.canApply, false);
  assert.equal(escalatedOnlyByCaller?.issues.some((issue) => issue.code === 'choices.required'), true);
  assert.equal(escalatedOnlyByCaller?.issues.some((issue) => issue.code === 'domainCards.count'), true);
});

test('only an explicit GM override with a reason can bypass strict level-up rules', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({ level: 2 });
  const invalid = {
    level: 7,
    advancementChoices: ['manual'] as const,
    proficiency: 6,
    experiences: [],
    domainCards: [],
    hpMax: 12,
    stressMax: 12,
    evasion: 30
  };

  assert.equal(validateCharacterLevelUp(character, {
    ...invalid,
    freeformOverride: { enabled: true, actor: { id: 'player', name: 'Player', role: 'player' }, reason: 'Try' }
  }).canApply, false);
  const result = service.applyLevelUpDetailed(character.id, {
    ...invalid,
    freeformOverride: { enabled: true, actor: { id: 'gm', name: 'Master', role: 'gm' }, reason: 'Импорт бумажного листа' }
  });
  assert.equal(result.applied, true);
  assert.equal(result.validation.overridden, true);
  const updated = service.getCharacter(character.id)!;
  assert.equal(updated.level, 7);
  assert.equal(updated.changeHistory?.at(-1)?.kind, 'freeform');
  assert.equal(updated.changeHistory?.at(-1)?.overrideReason, 'Импорт бумажного листа');
});

test('advancement usage is bounded per rank and rank boundaries clear trait marks', () => {
  const character = createCharacter({
    level: 2,
    advancement: {
      choiceUsesByRank: { 2: { hp: 2 } },
      markedTraits: ['agility', 'strength'],
      multiclass: null
    }
  });
  const plan = buildCharacterLevelUpPlan(character, { targetLevel: 3, advancementChoices: ['hp', 'stress'] });
  assert.equal(plan.warnings.some((warning) => warning.includes('доступных отметок')), true);
  assert.equal(characterLevelRank(1), 1);
  assert.equal(characterLevelRank(5), 3);

  const rankPlan = buildCharacterLevelUpPlan({ ...character, level: 4 }, { targetLevel: 5, advancementChoices: ['traits', 'stress'] });
  const notes = formatLevelUpNotes({ plan: rankPlan, choices: ['traits', 'stress'], traitBonuses: { agility: 1, knowledge: 1 } });
  assert.match(notes, /agility \+1/);
});

test('multiclass validates class domains and remains mutually exclusive with subclass advancement in a rank', () => {
  const character = createCharacter({
    level: 5,
    className: 'Bard',
    domains: ['Grace', 'Codex'],
    advancement: {
      choiceUsesByRank: { 3: { subclass: 1 } },
      markedTraits: [],
      multiclass: null
    }
  });
  const plan = buildCharacterLevelUpPlan(character, {
    targetLevel: 6,
    advancementChoices: ['multiclass'],
    multiclassClass: 'Warrior',
    multiclassDomain: 'Arcana'
  });
  assert.equal(plan.warnings.some((warning) => warning.includes('нельзя одновременно')), true);
  assert.equal(plan.warnings.some((warning) => warning.includes('недоступен классу')), true);
});
