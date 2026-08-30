import assert from 'node:assert/strict';
import { test } from 'vitest';
import { analyzeFeatureRules } from '../../src/domain/rules/featureEffects';

function semanticEffects(text: string) {
  return analyzeFeatureRules(text).effects.map((effect) => {
    const { id: _id, evidence: _evidence, summary: _summary, ...semantic } = effect;
    return semantic;
  });
}

test('recognizes feature-local, target, per-option, additional, and scene usage rules separately', () => {
  assert.deepEqual(semanticEffects('Раз за сессию вы можете потратить Надежду.'), [{
    kind: 'usageLimit', max: 1, reset: 'session', scope: 'feature', automatic: false
  }]);
  assert.deepEqual(semanticEffects('При провале, один раз за отдых, он отмечает Рану.'), [{
    kind: 'usageLimit', max: 1, reset: 'rest', scope: 'feature', automatic: false
  }]);
  assert.deepEqual(semanticEffects('Первый раз в сцене, когда вы преуспеваете, удвойте урон.'), [{
    kind: 'usageLimit', max: 1, reset: 'scene', scope: 'feature', automatic: false
  }]);
  assert.deepEqual(semanticEffects('Вы можете инициировать Командный Бросок один дополнительный раз за сессию.'), [{
    kind: 'usageAllowance', count: 1, reset: 'session', targetLabel: 'Командный Бросок', automatic: false
  }]);
  assert.deepEqual(semanticEffects('Вы можете использовать “Касание Милости” два раза, вместо одного, до следующего Продолжительного отдыха.'), [{
    kind: 'usageLimit', max: 2, reset: 'longRest', scope: 'targetFeature', targetLabel: 'Касание Милости', automatic: false
  }]);

  const songs = semanticEffects(`Вы можете исполнить каждую песню один раз до следующего Продолжительного отдыха:
- Расслабляющая песня: снимите Рану.
- Эпическая песня: цель Уязвима.
- Душераздирающая песня: получите Надежду.`);
  assert.deepEqual(songs, [{
    kind: 'usageLimit',
    max: 1,
    reset: 'longRest',
    scope: 'perOption',
    targetLabel: 'песня',
    options: ['Расслабляющая песня', 'Эпическая песня', 'Душераздирающая песня'],
    automatic: false
  }]);
});

test('recognizes exact short and long rest frequency wording without treating durations as uses', () => {
  const cases = [
    ['Один раз за короткий отдых вы можете получить преимущество.', 'rest'],
    ['Один раз за Продолжительный Отдых вы можете активировать амулет.', 'longRest'],
    ['You can use this two times per short rest.', 'rest'],
    ['You can use this three times per long rest.', 'longRest']
  ] as const;
  for (const [text, reset] of cases) {
    assert.equal(semanticEffects(text)[0]?.kind, 'usageLimit', text);
    assert.equal((semanticEffects(text)[0] as { reset?: string }).reset, reset, text);
  }

  for (const text of [
    'Эффект действует до следующего отдыха.',
    'Вы не можете лечить ту же цель снова до следующего продолжительного отдыха.',
    'Некоторые свойства говорят, что вы можете использовать их один раз за сессию.'
  ]) assert.deepEqual(semanticEffects(text), [], text);
});

test('recognizes generic creation, inventory, companion, resource, and rest structures without content ids', () => {
  const text = [
    'При создании персонажа выберите один из Опытов и получите постоянный бонус +1 к нему.',
    'Добавьте в свой инвентарь Походную сумку.',
    'Начните с 3 очками Милости.',
    'Во время отдыха, потратьте один из своих Ходов Отдыха в качестве дани вашему покровителю.'
  ].join(' ');
  assert.deepEqual(semanticEffects(text), [
    { kind: 'inventoryGrant', name: 'Походная сумка', count: 1, automatic: true },
    { kind: 'creationChoice', choice: 'experienceBonus', count: 1, bonus: 1, automatic: false },
    { kind: 'resourceInit', resource: 'Милость', value: 3, automatic: false },
    { kind: 'restMoveGrant', rest: 'any', scope: 'self', label: 'Дань покровителю', automatic: false }
  ]);

  assert.deepEqual(semanticEffects('Вы начинаете с двух боевых стоек 1 Ранга. Когда вы достигаете нового ранга, вы можете взять две дополнительные стойки своего ранга или ниже.'), [{
    kind: 'creationChoice', choice: 'stance', count: 2, perRankCount: 2, automatic: false
  }]);
  assert.deepEqual(semanticEffects('Выберите дополнительную опцию повышения уровня для вашего компаньона.'), [{
    kind: 'advancementGrant', target: 'companion', count: 1, automatic: false
  }]);
  assert.deepEqual(semanticEffects('Выберите сферы его влияния, например Природа и Раздор и т.д., запишите их и выставите им значение +2. Каждый раз, когда вы повышаете свой ранг, эти сферы получают постоянный бонус +1.'), [{
    kind: 'creationChoice', choice: 'customField', bonus: 2, perRankBonus: 1, automatic: false
  }]);
});

test('keeps ally rest rerolls available to the party and records their scope', () => {
  assert.deepEqual(semanticEffects('Во время короткого отдыха вы или ваш союзник можете перебросить одну кость хода отдыха.'), [{
    kind: 'restReroll', rest: 'short', max: 1, scope: 'selfOrAlly', automatic: false
  }]);
});

test('keeps conditional structural phrases inert instead of making them permanent character rules', () => {
  const examples = [
    'Пока вы держите щит, вы получаете бонус +1 к Показателю Брони и Порогам Урона.',
    'Когда вы входите в стойку, получите дополнительную ячейку Ран.',
    'После успешной атаки возьмите дополнительную карту домена.',
    'Если Мастер согласен, добавьте в свой инвентарь Волшебный ключ.',
    'При ношении тяжёлой брони получите дополнительную ячейку Стресса.',
    'В начале сцены возьмите дополнительную карту домена.',
    'You gain +1 to your Armor Score and Damage Thresholds while wielding a shield.'
  ];
  for (const example of examples) assert.deepEqual(semanticEffects(example), [], example);
});

test('still recognizes permanent properties established during character creation', () => {
  const examples = [
    'Получите дополнительную ячейку Ран при создании персонажа.',
    'Во время создания персонажа получите дополнительную ячейку Ран.'
  ];
  for (const example of examples) {
    assert.deepEqual(semanticEffects(example), [{
      kind: 'statDelta', target: 'hpMax', amount: 1, automatic: true
    }], example);
  }

  const englishExamples = [
    'During character creation, gain a permanent +1 to your Evasion.',
    'When creating your character, gain a permanent +1 to your Evasion.',
    'At character creation, gain a permanent +1 to your Evasion.'
  ];
  for (const example of englishExamples) {
    assert.deepEqual(semanticEffects(example), [{
      kind: 'statDelta', target: 'evasion', amount: 1, automatic: true
    }], example);
  }
});
