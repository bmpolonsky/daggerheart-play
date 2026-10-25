import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { cleanMarkdownText } from '../../src/core/utils/markdownText';
import { mapGenericItem } from '../../src/domain/content/mappers';
import { domainCardFromLibrary } from '../../src/domain/characterBuilder';
import { parseDomainCardTextMacros } from '../../src/domain/rules/domainCards';
import { contextualDiceBindingDomainSlugs, resolveContextualDiceBinding, type ContextualDiceActor, type ContextualDiceSource } from '../../src/domain/rules/contextualDiceBindings';
import { createUnifiedRollDraft, setUnifiedRollQuantity } from '../../src/domain/rules/unifiedRollDraft';

interface RawCard { slug: string; name: string; features: Array<{ id: number; name?: string | null; main_body: string }> }
const cards = (JSON.parse(readFileSync(new URL('../../public/data/domain-cards.json', import.meta.url), 'utf8')) as { data: RawCard[] }).data;
const actor: ContextualDiceActor = { proficiency: 3, level: 5, spellcastTrait: 'instinct', traits: { instinct: 2 } };

function sourceCard(slug: string): ContextualDiceSource {
  const card = cards.find((item) => item.slug === slug)!;
  return { cardId: `domain-card:${slug}`, sourceId: `domain-card:${slug}`, name: card.name,
    text: cleanMarkdownText(card.features.map((feature) => feature.main_body).join('\n\n'), { stripEmphasis: true, stripCodeTicks: true }) };
}
function resolve(source: ContextualDiceSource, formula: string, who = actor, occurrence = 0) {
  const macros = parseDomainCardTextMacros(source.text).filter((macro) => macro.kind === 'diceRoll' && macro.formula === formula);
  const macro = macros[occurrence];
  assert.ok(macro && macro.kind === 'diceRoll', `Missing ${formula} in ${source.cardId ?? source.name}`);
  return resolveContextualDiceBinding(source, macro, who);
}

// Complete declared corpus coverage is intentional; per-source semantics are
// separately checked below instead of treating every bare die as proficiency.
test('declarative table covers the 64 existing domain cards with dice notation', () => {
  const withDice = cards.filter((card) => card.features.some((feature) => /(?:\d+)?d(?:4|6|8|10|12|20)\b/i.test(feature.main_body)));
  assert.equal(withDice.length, 64);
  assert.deepEqual([...contextualDiceBindingDomainSlugs].sort(), withDice.map((card) => card.slug).sort());
});

test('P0 spent-token sources require explicit event quantity, never actor proficiency or remaining tokens', () => {
  for (const [slug, formula, template] of [
    ['unleash-chaos', 'd10', '{count}d10'], ['twilight-toll', 'd12', '{count}d12']
  ]) {
    const result = resolve(sourceCard(slug), formula);
    assert.equal(result.formula, '');
    assert.equal(result.quantity?.value, null);
    assert.equal(result.quantity?.formulaTemplate, template);
    assert.match(result.quantity?.label ?? '', /потрачено на эту атаку/);
    assert.match(result.hint ?? '', /не остаток/);
  }
});

test('P0 mastery damage and conditional Siphon branch are source-specific', () => {
  assert.equal(resolve(sourceCard('telekinesis'), 'd12+4').formula, '3d12+4');
  const siphon = resolve(sourceCard('siphon-essence'), 'd12+4');
  assert.equal(siphon.formula, '');
  assert.equal(siphon.selectedBranchId, undefined);
  assert.deepEqual(siphon.branches?.map((branch) => branch.formula), ['3d12+4', '4d12+4']);
  assert.match(siphon.hint ?? '', /именно этой успешной атаки/);
  const tongue = { cardId: 'sheet-ancestryFeature-ribbet-253', sourceId: 'ancestry:ribbet', featureId: 253,
    text: 'Отметьте Стресс, чтобы использовать язык как оружие Искусности, наносящее d12 физического урона, используя ваше Мастерство.' };
  assert.equal(resolve(tongue, 'd12').formula, '3d12');
});

test('Cannonball asks for throwing ally mastery instead of owner mastery', () => {
  const source = { sourceId: 282, featureId: 2005,
    text: 'Союзник бросает вас в противника. При успехе противник получает d12+2 физического урона, используя Мастерство бросающего.' };
  const result = resolve(source, 'd12+2');
  assert.equal(result.formula, '');
  assert.equal(result.quantity?.value, null);
  assert.equal(result.quantity?.formulaTemplate, '{count}d12+2');
  assert.match(result.quantity?.label ?? '', /бросающего союзника/);
});

test('single bonus dice stay single while mastery damage including d20 scales', () => {
  for (const [slug, formula, expected] of [
    ['forceful-push', 'd6', '1d6'], ['strategic-approach', 'd8', '1d8'],
    ['natural-familiar', 'd6', '1d6'], ['boost', 'd10', '1d10'],
    ['book-of-ava', 'd10+2', '3d10+2'], ['book-of-ava', 'd6', '3d6'],
    ['book-of-norai', 'd20+5', '3d20+5'], ['rain-of-blades', 'd8+2', '3d8+2'],
    ['rain-of-blades', '1d8', '1d8']
  ]) assert.equal(resolve(sourceCard(slug), formula).formula, expected, slug);
});

test('Spellcast trait count is distinct from mastery and zero never becomes a default die', () => {
  assert.equal(resolve(sourceCard('midnight-spirit'), 'd6').formula, '2d6');
  assert.equal(resolve(sourceCard('preservation-blast'), 'd8+3').formula, '2d8+3');
  assert.equal(resolve(sourceCard('banish'), 'd20').formula, '2d20');
  assert.match(resolve(sourceCard('banish'), 'd20').hint ?? '', /наивысшее отдельное/);
  assert.equal(resolve(sourceCard('midnight-spirit'), 'd6', { ...actor, traits: { instinct: 0 } }).formula, '0');
  const missing = resolve(sourceCard('midnight-spirit'), 'd6', { ...actor, spellcastTrait: null });
  assert.equal(missing.quantity?.value, null);
  assert.equal(missing.formula, '');
});

test('fixed area damage does not multiply by targets or resource choice', () => {
  for (const [slug, formula] of [['book-of-tyfar', '2d6'], ['book-of-korvax', '2d12+4'], ['ground-pound', '4d10+8'], ['stunning-sunlight', '3d20+3'], ['stunning-sunlight', '4d20+5']]) {
    const result = resolve(sourceCard(slug), formula);
    assert.equal(result.formula, formula);
    assert.equal(result.quantity, undefined);
  }
  const nether = resolve(sourceCard('nether-flames'), 'd8+6');
  assert.equal(nether.formula, '2d8+6');
  assert.match(nether.hint ?? '', /Надежда определяет число целей/);
});

test('explicit 1d8 per spent token still needs a count and Falling Sky scales its whole per-count packet', () => {
  const army = resolve(sourceCard('dark-army'), '1d8');
  assert.equal(army.quantity?.value, null);
  assert.equal(army.quantity?.formulaTemplate, '{count}d8');
  const falling = resolve(sourceCard('falling-sky'), '1d20+2');
  assert.equal(falling.quantity?.flatPerCount, 2);
  assert.equal(falling.quantity?.formulaTemplate, '{count}d20');
  const draft = createUnifiedRollDraft({ actor: { key: 'pc', id: 'pc', name: 'PC', kind: 'character' }, mode: 'manual', title: 'Falling Sky', ...falling });
  assert.equal(setUnifiedRollQuantity(draft, 3).formula, '3d20+6');
});

test('current accumulated dice, active layers and event wounds stay unresolved rather than using caps or historical counters', () => {
  const sigil = resolve(sourceCard('sigil-of-retribution'), 'd8');
  assert.equal(sigil.nonRoll, true);
  assert.equal(sigil.quantity, undefined);
  assert.match(sigil.hint ?? '', /реально накопленных костей/);
  assert.match(sigil.hint ?? '', /уровень — только предел/);
  const aura = resolve(sourceCard('confusing-aura'), 'd6');
  assert.equal(aura.quantity?.value, null);
  assert.match(aura.quantity?.label ?? '', /Активных слоёв/);
  const earth = resolve({ sourceId: 'subclass:warden-of-the-elements', featureId: 161,
    text: 'Земля: Когда вы отмечаете Рану, бросьте d6 за каждую отмеченную ячейку. За каждый результат 6 уменьшите количество отмеченных Ран на 1.' }, 'd6');
  assert.equal(earth.quantity?.value, null);
  assert.match(earth.quantity?.label ?? '', /именно этим событием/);
});

test('choose/any/max remain ordinary pools with manual-reading hints, not invented reducers', () => {
  const witch = resolve({ cardId: 'sheet-class-witch-2077', name: 'Гадание',
    text: 'Бросьте количество d6, равное вашей Характеристике Заклинателя. Выберите одно значение из полученных результатов.' }, 'd6');
  assert.equal(witch.formula, '2d6');
  assert.match(witch.hint ?? '', /Можно выбрать не наибольшее/);
  assert.equal(resolve(sourceCard('troublemaker'), 'd4').formula, '3d4');
  assert.match(resolve(sourceCard('troublemaker'), 'd4').hint ?? '', /не по сумме/);
  assert.match(resolve(sourceCard('redirect'), 'd6').hint ?? '', /хотя бы одной 6/);
  assert.equal('reducer' in witch, false);
});

test('counter and duality replacement mentions are non-roll references', () => {
  for (const [slug, formula] of [['wild-surge', 'd6'], ['zone-of-protection', '1d6'], ['tactician', 'd20'], ['signature-move', 'd20']]) {
    const result = resolve(sourceCard(slug), formula);
    assert.equal(result.nonRoll, true, slug);
    assert.equal(result.quantity, undefined);
    assert.ok(result.hint);
  }
});

test('stable source plus expected fragment are both required; names and stale offsets never authorize automatic mastery', () => {
  const known = sourceCard('telekinesis');
  const nameOnly = resolve({ name: known.name, text: known.text }, 'd12+4');
  assert.equal(nameOnly.quantity?.value, null);
  const edited = resolve({ ...known, text: 'Бросьте d12+4 для произвольного домашнего эффекта.' }, 'd12+4');
  assert.equal(edited.quantity?.value, null);
  const macro = parseDomainCardTextMacros(known.text).find((item) => item.kind === 'diceRoll')!;
  assert.ok(macro.kind === 'diceRoll');
  const stale = resolveContextualDiceBinding(known, { ...macro, start: 0, end: 1 }, actor);
  assert.equal(stale.quantity?.value, null);
  const fixed = resolve({ text: 'Восстановите 1d4 Ран.' }, '1d4');
  assert.equal(fixed.formula, '1d4');
});

test('all 74 actual corpus dice spans resolve with P2/S3 to explicit formulas, semantic input or honest non-roll references', () => {
  const unresolvedSources = new Set(['unleash-chaos', 'book-of-illiat', 'thorn-skin', 'confusing-aura', 'arcane-reflection', 'spellcharge', 'dark-army', 'night-terror', 'twilight-toll', 'damnation', 'invigoration', 'falling-sky', 'avatar-of-malice']);
  const nonRollSources = new Set(['tactician', 'signature-move', 'sigil-of-retribution', 'zone-of-protection', 'wild-surge']);
  const who: ContextualDiceActor = { proficiency: 2, level: 5, spellcastTrait: 'instinct', traits: { instinct: 3 } };
  let count = 0;
  for (const slug of contextualDiceBindingDomainSlugs) {
    const source = sourceCard(slug);
    for (const macro of parseDomainCardTextMacros(source.text)) {
      if (macro.kind !== 'diceRoll') continue;
      count++;
      const result = resolveContextualDiceBinding(source, macro, who);
      assert.notEqual(result.quantity?.label, 'Количество костей: уточните по тексту', `${slug}:${macro.start} unexpectedly fell back`);
      assert.notEqual(result.hint, 'Формула взята из текста. Условия и эффекты способности применяются вручную.', `${slug}:${macro.start} unexpectedly fell back`);
      if (unresolvedSources.has(slug)) {
        assert.equal(result.quantity?.value, null, slug);
        assert.equal(result.formula, '', slug);
        assert.ok(result.quantity?.formulaTemplate.includes('{count}'), slug);
      } else if (nonRollSources.has(slug)) {
        assert.equal(result.nonRoll, true, slug);
      } else if (slug === 'siphon-essence') {
        assert.deepEqual(result.branches?.map((branch) => branch.formula), ['2d12+4', '3d12+4']);
        assert.equal(result.selectedBranchId, undefined);
      } else {
        assert.ok(result.formula, slug);
        assert.equal(result.quantity, undefined, slug);
      }
    }
  }
  assert.equal(count, 74);
});


test('edited canonical source cannot borrow a nearby mastery clause for an unrelated bonus die', () => {
  const source = { sourceId: 'domain-card:book-of-ava', text: 'Добавьте d6 к Уклонению. Затем нанесите d10+2 урона, используя ваше Мастерство.' };
  const result = resolve(source, 'd6', { ...actor, proficiency: 2 });
  assert.equal(result.formula, '');
  assert.equal(result.quantity?.value, null);
  assert.match(result.quantity?.label ?? '', /уточните по тексту/);
  assert.notEqual(result.formula, '2d6');
});

test('actual mapper-rendered full cards and individual feature bodies remain recognized', () => {
  let mappedSpans = 0;
  let bodySpans = 0;
  for (const card of cards) {
    if (!contextualDiceBindingDomainSlugs.includes(card.slug)) continue;
    const mapped = domainCardFromLibrary(mapGenericItem(card as unknown as Parameters<typeof mapGenericItem>[0], 'domain-card'), true);
    const texts = [mapped.text, ...card.features.map((feature) => cleanMarkdownText(feature.main_body, { stripEmphasis: true, stripCodeTicks: true }))];
    for (const [textIndex, text] of texts.entries()) {
      for (const macro of parseDomainCardTextMacros(text)) {
        if (macro.kind !== 'diceRoll') continue;
        const result = resolveContextualDiceBinding({ sourceId: mapped.sourceId, cardId: mapped.id, text }, macro, actor);
        assert.notEqual(result.quantity?.label, 'Количество костей: уточните по тексту', `${card.slug}:${textIndex}:${macro.start}`);
        assert.notEqual(result.hint, 'Формула взята из текста. Условия и эффекты способности применяются вручную.', `${card.slug}:${textIndex}:${macro.start}`);
        if (textIndex === 0) mappedSpans++; else bodySpans++;
      }
    }
  }
  assert.equal(mappedSpans, 74);
  assert.equal(bodySpans, 74);
});

test('outside mastery and trait bindings require their own immediate count clause', () => {
  const tongue = { sourceId: 'ancestry:ribbet', featureId: 253,
    text: 'Добавьте d12 к Уклонению. Язык наносит d12 физического урона, используя ваше Мастерство.' };
  assert.equal(resolve(tongue, 'd12').quantity?.value, null);
  assert.equal(resolve(tongue, 'd12', actor, 1).formula, '3d12');
  const witch = { cardId: 'sheet-class-witch-2077',
    text: 'Добавьте d6 к Уклонению. Бросьте количество d6, равное вашей Характеристике Заклинателя. Выберите одно значение из полученных результатов.' };
  assert.equal(resolve(witch, 'd6').quantity?.value, null);
  assert.equal(resolve(witch, 'd6', actor, 1).formula, '2d6');
});
