import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { FeatureRuleEffect, FeatureUsageLimitEffect } from '../../src/domain/rules/featureEffects';
import { analyzeFeatureRules, featureUsageSuggestion, featureUsageSuggestions } from '../../src/domain/rules/featureEffects';
import { automaticUsageTrackerCandidates } from '../../src/domain/rules/usageTrackers';
import { usageTrackerSuggestionDefaults } from '../../src/ui/characters/UsageTrackerControl';
import { ruleEffectApplicationLabel, ruleEffectTooltipText, uniqueRuleEffectMessages } from '../../src/ui/components/common/RuleEffectText';

function usageEffect(
  reset: FeatureUsageLimitEffect['reset'],
  scope: FeatureUsageLimitEffect['scope'] = 'feature',
  max = 1
): FeatureUsageLimitEffect {
  return {
    id: `usage-${reset}-${scope}`,
    kind: 'usageLimit',
    max,
    reset,
    scope,
    summary: `Лимит ${max}: ${reset}`,
    automatic: false,
    evidence: { text: 'ограничение', start: 0, end: 11 }
  };
}

test('rule effect presentation merges identical user-facing effects from internal stat targets', () => {
  const shared = {
    summary: 'Оба порога: +1',
    automatic: true,
    evidence: { text: 'получите +1 к порогам', start: 0, end: 22 }
  } as const;
  const effects: FeatureRuleEffect[] = [
    { ...shared, id: 'major', kind: 'statDelta', target: 'thresholdMajor', amount: 1 },
    { ...shared, id: 'severe', kind: 'statDelta', target: 'thresholdSevere', amount: 1 }
  ];

  assert.equal(uniqueRuleEffectMessages(effects).length, 1);
  assert.equal(ruleEffectTooltipText(effects), 'Применено: Оба порога: +1');
});

test('presentation distinguishes live rules from creation-time grants', () => {
  const [inventory] = analyzeFeatureRules('Добавьте в свой инвентарь Походную сумку.').effects;
  const [cards] = analyzeFeatureRules('Возьмите дополнительную карту домена.').effects;
  const [evasion] = analyzeFeatureRules('Получаете постоянный бонус +1 к Уклонению.').effects;

  assert.equal(ruleEffectApplicationLabel(inventory), 'При создании');
  assert.equal(ruleEffectApplicationLabel(cards), 'При выборе карт');
  assert.equal(ruleEffectApplicationLabel(evasion), 'Применено');
});

test('usage tracker suggestions map supported rest cadences and leave session/scene manual', () => {
  assert.deepEqual(usageTrackerSuggestionDefaults(usageEffect('rest', 'feature', 2)), {
    label: 'До следующего отдыха',
    max: 2,
    reset: 'short',
    summary: 'Лимит 2: rest',
    manualReset: false
  });
  assert.equal(usageTrackerSuggestionDefaults(usageEffect('longRest'))?.reset, 'long');
  assert.deepEqual(usageTrackerSuggestionDefaults(usageEffect('session'))?.reset, 'manual');
  assert.equal(usageTrackerSuggestionDefaults(usageEffect('scene'))?.manualReset, true);
});

test('only a limit on the feature itself becomes its tracker suggestion', () => {
  assert.equal(usageTrackerSuggestionDefaults(usageEffect('longRest', 'targetFeature')), null);
  assert.equal(usageTrackerSuggestionDefaults(usageEffect('longRest', 'perOption')), null);
  const parsed = featureUsageSuggestion('Эту способность можно использовать два раза до следующего продолжительного отдыха.');
  assert.equal(parsed?.scope, 'feature');
  assert.equal(parsed?.max, 2);
  assert.equal(parsed?.reset, 'longRest');
});

test('a target-feature override replaces the original feature tracker suggestion', () => {
  const features = [
    { name: 'Контакты повсюду', text: 'Один раз за сессию вы можете обратиться к контакту.' },
    { name: 'Надёжный сообщник', text: 'Вы можете использовать "Контакты Повсюду" три раза за сессию.' }
  ];
  const suggestion = featureUsageSuggestion(features[0].text, features[0].name, features);
  assert.equal(suggestion?.scope, 'feature');
  assert.equal(suggestion?.max, 3);
  assert.equal(suggestion?.reset, 'session');
});

test('multiple independent limits and explicit per-option limits become separate trackers', () => {
  const book = automaticUsageTrackerCandidates({
    targetKind: 'card',
    targetId: 'book-of-homet',
    targetName: 'Книга Гомета',
    text: 'Один раз до следующего отдыха откройте проход. Один раз до следующего продолжительного отдыха откройте врата.'
  });
  assert.deepEqual(book.map(({ tracker }) => [tracker.label, tracker.max, tracker.reset]), [
    ['До отдыха', 1, 'short'],
    ['До продолжительного отдыха', 1, 'long']
  ]);

  const features = [
    {
      name: 'Одарённый исполнитель',
      text: 'Вы можете исполнить каждую песню один раз до следующего Продолжительного отдыха:\n- Расслабляющая песня: снимите Рану.\n- Эпическая песня: цель Уязвима.\n- Душераздирающая песня: получите Надежду.'
    },
    {
      name: 'Виртуоз',
      text: 'Вы можете исполнить каждую из ваших песен “Одаренного Исполнителя” не один, а два раза до следующего Продолжительного отдыха.'
    }
  ];
  const effects = featureUsageSuggestions(features[0].text, features[0].name, features);
  assert.equal(effects[0]?.max, 2);
  assert.deepEqual(automaticUsageTrackerCandidates({
    targetKind: 'feature', targetId: 'troubadour-songs', targetName: features[0].name, text: features[0].text, allFeatures: features
  }).map(({ tracker }) => [tracker.label, tracker.max]), [
    ['Расслабляющая песня', 2],
    ['Эпическая песня', 2],
    ['Душераздирающая песня', 2]
  ]);
});
