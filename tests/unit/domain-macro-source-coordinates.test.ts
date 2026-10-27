import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCharacter } from '../../src/domain/rules/factories';
import { buildCharacterSummary } from '../../src/domain/tabletop/playerView';
import { parseContextualDiceMacros, type ContextualDiceSource } from '../../src/domain/rules/contextualDiceBindings';
import { runDomainCardMacroAction } from '../../src/ui/vtt/playerView/domainCards/domainCardMacroActions';
import type { PreparedDiceRoll } from '../../src/services/CharacterRollService';
import type { PlayerViewDomainCard } from '../../src/ui/vtt/playerView/domainCards/types';
import { cleanMarkdownText } from '../../src/core/utils/markdownText';
import { analyzeFeatureRules } from '../../src/domain/rules/featureEffects';
import { buildCharacterFeaturePreviewFeedItem } from '../../src/domain/tabletop/feed';

function source(collection: string, slug: string, featureId: number): ContextualDiceSource {
  const raw = JSON.parse(readFileSync(new URL(`../../public/data/${collection}.json`, import.meta.url), 'utf8')).data.find((item: any) => item.slug === slug);
  const feature = [raw.features, raw.foundation_features, raw.specialization_features, raw.mastery_features].flatMap(items => items ?? []).find((item: any) => item.id === featureId);
  const kind = collection === 'classes' ? 'class' : 'subclass';
  return { cardId: `arbitrary-durable-${featureId}`, sourceId: `${kind}:${slug}`, collection: kind, slug, featureId, text: feature.main_body };
}
function card(source: ContextualDiceSource): PlayerViewDomainCard {
  return { id: source.cardId!, sourceId: source.sourceId, featureId: source.featureId, collection: source.collection, slug: source.slug,
    name: 'Контекстное свойство', domain: 'Codex', domainLabel: 'Особенность', level: 1, cost: '', recallCost: '', text: source.text,
    imageUrl: '', inHand: false, permanentlyVaulted: false, tokens: { value: 0, max: 0 }, macros: parseContextualDiceMacros(source) };
}
function actor() {
  const upgrade = source('subclasses', 'divine-wielder', 189);
  return buildCharacterSummary(createCharacter({
    id: 'contextual-source-test', level: 5, spellcastTrait: 'strength',
    traits: { agility: 0, strength: 2, finesse: 0, instinct: 0, presence: 0, knowledge: 0 },
    sheetCards: [{ id: 'sheet-subclass-divine-wielder-foundation-189', kind: 'subclassFeature', sourceId: upgrade.sourceId, name: 'Набожный', text: upgrade.text }]
  }));
}
function prepare(source: ContextualDiceSource, macro = parseContextualDiceMacros(source).find(macro => macro.kind === 'diceRoll')!) {
  const prepared: PreparedDiceRoll[] = [];
  runDomainCardMacroAction(card(source), macro, { character: actor(), role: 'gm', openRollDraft: () => assert.fail('Not an action roll'), openDiceDraft: draft => prepared.push(draft) });
  assert.equal(prepared.length, 1);
  return prepared[0];
}

test('Prayer macro retains exact marked-source coordinates and known upgrade count', () => {
  const prayer = source('classes', 'seraph', 135);
  assert.match(prayer.text, /\*\*d4\*\*/);
  const result = prepare(prayer);
  assert.equal(result.formula, '3d4');
  assert.equal(result.quantity, undefined);
});

test('already normalized rendered source follows the same binding without a second coordinate transform', () => {
  const prayer = source('classes', 'seraph', 135);
  const result = prepare({ ...prayer, text: cleanMarkdownText(prayer.text, { stripEmphasis: true, stripCodeTicks: true }) });
  assert.equal(result.formula, '3d4');
  assert.equal(result.quantity, undefined);
});

test('feature preview keeps source identity for arbitrary durable ids through rendering and activation', () => {
  const prayer = source('classes', 'seraph', 135);
  const who = actor();
  assert.equal(who.traits.find(trait => trait.id === 'strength')?.value, 2);
  const item = buildCharacterFeaturePreviewFeedItem({ id: 'preview', createdAt: '2026-10-27T09:00:00Z', authorName: who.name,
    feature: { id: prayer.cardId!, sourceId: prayer.sourceId, featureId: prayer.featureId, collection: prayer.collection, slug: prayer.slug,
      name: 'Кости Молитвы', text: prayer.text, sourceLabel: 'Класс' } });
  assert.equal(item.feature?.sourceId, 'class:seraph');
  assert.equal(item.feature?.featureId, 135);
  const analysis = analyzeFeatureRules(item.feature!.text);
  const rendered = { ...prayer, text: analysis.text };
  assert.equal(prepare(rendered).formula, '3d4');
});

test('named Patron pool preserves markdown offsets and tier-sized dice', () => {
  const patron = source('subclasses', 'playtest-pact-of-the-wraithful', 1978);
  const macro = parseContextualDiceMacros(patron).find(macro => macro.kind === 'diceRoll' && macro.contextualBinding)!;
  assert.ok(macro, 'Canonical Patron text has a named pool macro');
  assert.ok(macro.kind === 'diceRoll');
  const result = prepare(patron, macro);
  assert.equal(result.formula, '3d8');
  assert.equal(result.quantity, undefined);
});

test('a stale span after source edits cannot silently reuse canonical Prayer mechanics', () => {
  const prayer = source('classes', 'seraph', 135);
  const macro = parseContextualDiceMacros(prayer).find(macro => macro.kind === 'diceRoll')!;
  const result = prepare({ ...prayer, text: `Другой префикс. ${prayer.text}` }, macro);
  assert.equal(result.formula, '');
  assert.equal(result.quantity?.value, null);
});
