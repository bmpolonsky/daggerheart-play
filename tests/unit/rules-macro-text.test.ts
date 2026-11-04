import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { DomainCardTextMacro } from '../../src/domain/rules/domainCards';
import type { FeatureRuleEffect } from '../../src/domain/rules/featureEffects';
import { MessageFeedCard } from '../../src/ui/vtt/playerView/playerChrome/feedCards/MessageFeedCard';
import { renderRulesText } from '../../src/ui/vtt/playerView/sheetText';
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

// Render only the already-sliced presentation text. Macro/effect offsets keep
// referring to the authored source, including its markup.
function visibleText(value: unknown): string {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(visibleText).join('');
  if (typeof value === 'object') return visibleText((value as { props?: { children?: unknown } }).props?.children);
  return String(value);
}

test('rule display removes authored HTML after slicing without joining macro words', () => {
  const text = 'Выберите: <p class="card-centered">Воздух · Вода</p> Сделайте Бросок Заклинания и получите +2.';
  const start = text.indexOf('Бросок Заклинания');
  const macro: DomainCardTextMacro = { id: 'spellcast', kind: 'actionRoll', start, end: start + 'Бросок Заклинания'.length, label: 'Бросок Заклинания', difficulty: null, traitHint: 'spellcast' };
  const ranges = buildRulesTextRanges(text, [macro], []);
  const actual = ranges.map(range => visibleText(renderRulesText(text.slice(range.start, range.end), { cleanHtml: true }))).join('');
  assert.ok(actual.includes('Воздух · Вода'));
  assert.ok(actual.includes('Сделайте Бросок Заклинания и получите +2.'));
  assert.ok(!actual.includes('<p'));
  assert.equal(text.slice(macro.start, macro.end), macro.label);
  assert.equal(ranges.find(range => range.macro)?.start, start);
});

test('rule display cleans encoded paragraph emphasis while preserving comparisons and ordinary chat literals', () => {
  const source = '**&lt;p class="card-centered"&gt;Воздух · Вода&lt;/p&gt;**\nБонус +3, результат < 12 и > 1.';
  const actual = visibleText(renderRulesText(source, { cleanHtml: true }));
  assert.ok(actual.includes('Воздух · Вода'));
  assert.ok(actual.includes('Бонус +3, результат < 12 и > 1.'));
  assert.ok(!actual.includes('<p'));
  assert.ok(!actual.includes('**'));
  assert.equal(visibleText(renderRulesText('<p>буквальный текст чата</p>')), '<p>буквальный текст чата</p>');
});


test('saved system messages render heading markup without rewriting stored text or ordinary chat', () => {
  const body = '### Элементалист\n<p>Воздух · Вода</p> Бонус **+2**; результат < 12.';
  const item = { id: 'saved-system', kind: 'system' as const, publication: 'public' as const, title: 'Стихийное начало', body, createdAt: '', authorName: 'Система', kicker: 'Система', tone: '' };
  const system = visibleText(MessageFeedCard({ item }));
  assert.ok(system.includes('Элементалист'));
  assert.ok(system.includes('Воздух · Вода'));
  assert.ok(system.includes('Бонус +2; результат < 12.'));
  assert.ok(!system.includes('###'));
  assert.ok(!system.includes('<p>'));
  assert.equal(item.body, body);
  const chat = visibleText(MessageFeedCard({ item: { ...item, kind: 'message' } }));
  assert.ok(chat.includes('###'));
  assert.ok(chat.includes('<p>'));
});
