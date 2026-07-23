import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { DomainCardTextMacro } from '../../src/domain/rules/domainCards';
import type { FeatureRuleEffect } from '../../src/domain/rules/featureEffects';
import { buildRulesTextRanges } from '../../src/ui/vtt/playerView/domainCards/RulesMacroText';

test('rules text ranges preserve a clickable macro nested inside a recognized effect', () => {
  const text = 'Получите дополнительную карту домена и совершите Бросок Заклинания.';
  const effectStart = text.indexOf('Получите');
  const effectEnd = text.indexOf(' и совершите');
  const macroStart = text.indexOf('Бросок Заклинания');
  const macroEnd = macroStart + 'Бросок Заклинания'.length;
  const macro: DomainCardTextMacro = {
    id: 'spellcast',
    kind: 'actionRoll',
    start: macroStart,
    end: macroEnd,
    label: 'Бросок Заклинания',
    difficulty: null,
    traitHint: 'spellcast'
  };
  const effect: FeatureRuleEffect = {
    id: 'grant',
    kind: 'domainCardGrant',
    count: 1,
    summary: 'Дополнительных карт домена: 1',
    automatic: true,
    evidence: { text: text.slice(effectStart, effectEnd), start: effectStart, end: effectEnd }
  };

  const ranges = buildRulesTextRanges(text, [macro], [effect]);
  assert.equal(ranges.map((range) => text.slice(range.start, range.end)).join(''), text);
  assert.equal(ranges.find((range) => range.macro?.id === macro.id)?.effects.length, 0);
  assert.ok(ranges.some((range) => range.effects[0]?.id === effect.id));
});

test('rules text ranges retain both meanings when a macro and effect overlap', () => {
  const text = 'Потратьте Надежду, чтобы получить дополнительную карту домена.';
  const macroEnd = text.indexOf(',');
  const macro: DomainCardTextMacro = {
    id: 'hope',
    kind: 'spendHope',
    start: 0,
    end: macroEnd,
    label: text.slice(0, macroEnd),
    amount: 1
  };
  const effect: FeatureRuleEffect = {
    id: 'grant',
    kind: 'domainCardGrant',
    count: 1,
    summary: 'Дополнительных карт домена: 1',
    automatic: true,
    evidence: { text, start: 0, end: text.length }
  };

  const ranges = buildRulesTextRanges(text, [macro], [effect]);
  const overlap = ranges.find((range) => range.macro?.id === macro.id);
  assert.equal(overlap?.effects[0]?.id, effect.id);
  assert.equal(ranges.map((range) => text.slice(range.start, range.end)).join(''), text);
});
