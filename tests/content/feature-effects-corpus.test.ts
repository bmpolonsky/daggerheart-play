import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { domainCardFromLibrary } from '../../src/domain/characterBuilder';
import { mapGenericItem } from '../../src/domain/content/mappers';
import type { RawContentItem } from '../../src/domain/content/types';
import { analyzeFeatureRules, type FeatureRuleEffect } from '../../src/domain/rules/featureEffects';
import {
  buildFeatureEffectAudit,
  FEATURE_EFFECT_AUDIT_KEYS,
  type FeatureEffectAuditEntry,
  type SemanticFeatureEffect
} from '../fixtures/feature-effect-audit';

type FeatureGroup = 'features' | 'foundation_features' | 'specialization_features' | 'mastery_features';
type RuleCollection = 'classes' | 'ancestries' | 'communities' | 'subclasses';

interface CorpusFeature {
  id?: string | number;
  main_body?: string | null;
  text?: string | null;
}

interface CorpusItem {
  slug?: string;
  main_body?: string | null;
  text?: string | null;
  [key: string]: unknown;
}

interface EnumeratedFeature {
  key: string;
  text: string;
}

const FEATURE_GROUPS: FeatureGroup[] = ['features', 'foundation_features', 'specialization_features', 'mastery_features'];
const RULE_COLLECTIONS: RuleCollection[] = ['classes', 'ancestries', 'communities', 'subclasses'];
const EXPECTED_ITEM_COUNTS: Record<RuleCollection | 'domain-cards', number> = {
  classes: 13,
  ancestries: 24,
  communities: 15,
  subclasses: 26,
  'domain-cards': 210
};
const EXPECTED_FEATURE_COUNTS: Record<RuleCollection, number> = {
  classes: 36,
  ancestries: 48,
  communities: 15,
  subclasses: 119
};

function loadCollection(collection: RuleCollection | 'domain-cards'): CorpusItem[] {
  const path = fileURLToPath(new URL(`../../public/data/${collection}.json`, import.meta.url));
  const payload = JSON.parse(readFileSync(path, 'utf8')) as { data?: CorpusItem[] };
  return payload.data ?? [];
}

function enumerateFeatures(collection: RuleCollection): EnumeratedFeature[] {
  return loadCollection(collection).flatMap((item) => {
    const itemSlug = String(item.slug ?? '').trim();
    assert.ok(itemSlug, `${collection} item is missing a stable slug`);
    return FEATURE_GROUPS.flatMap((group) => {
      const features = Array.isArray(item[group]) ? item[group] as CorpusFeature[] : [];
      return features.map((feature, index) => {
        const featureId = String(feature.id ?? '').trim();
        assert.ok(featureId, `${collection}/${itemSlug}/${group}/${index} is missing a stable feature id`);
        return {
          key: `${collection}/${itemSlug}/${group}/${featureId}`,
          text: String(feature.main_body ?? feature.text ?? '')
        };
      });
    });
  });
}

function enumerateDomainCards(): EnumeratedFeature[] {
  return loadCollection('domain-cards').map((card) => {
    const slug = String(card.slug ?? '').trim();
    assert.ok(slug, 'domain card is missing a stable slug');
    return {
      key: `domain-cards/${slug}`,
      text: domainCardFromLibrary(mapGenericItem(card as RawContentItem, 'domain-card'), true).text
    };
  });
}

function enumerateTopLevelTexts(): EnumeratedFeature[] {
  return RULE_COLLECTIONS.flatMap((collection) => loadCollection(collection).map((item) => ({
    key: `${collection}/${String(item.slug ?? '').trim()}`,
    text: String(item.main_body ?? item.text ?? '')
  })));
}

function semanticEffect(effect: FeatureRuleEffect): SemanticFeatureEffect {
  const { id: _id, summary: _summary, evidence: _evidence, ...contract } = effect;
  return contract as SemanticFeatureEffect;
}

function analyzeContract(text: string): SemanticFeatureEffect[] {
  return analyzeFeatureRules(text).effects.map(semanticEffect);
}

function sha256Corpus(features: EnumeratedFeature[]): string {
  const rows = features.map(({ key, text }) => [key, text] as const).sort(([left], [right]) => left.localeCompare(right));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function normalizedQuote(value: string): string {
  return analyzeFeatureRules(value).text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
}

function assertAuditEntry(key: string, text: string, entry: FeatureEffectAuditEntry): void {
  const analysis = analyzeFeatureRules(text);
  assert.ok(entry.effects.length + entry.ignored.length > 0, `${key} has an empty audit entry`);
  assert.deepEqual(analysis.effects.map(semanticEffect), entry.effects, `${key} semantic effects changed`);

  const normalizedText = normalizedQuote(text);
  const effectEvidence = analysis.effects.map((effect) => normalizedQuote(effect.evidence.text));
  const seenQuotes = new Set<string>();
  for (const ignored of entry.ignored) {
    const quote = normalizedQuote(ignored.quote);
    assert.ok(quote.length >= 8, `${key} has an ignored quote that is too vague`);
    assert.ok(normalizedText.includes(quote), `${key} no longer contains ignored quote: ${ignored.quote}`);
    assert.ok(
      !effectEvidence.some((evidence) => evidence.includes(quote) || quote.includes(evidence)),
      `${key} ignored quote overlaps a parsed effect instead of describing only the remaining manual rule: ${ignored.quote}`
    );
    assert.ok(ignored.because.trim().length >= 24, `${key} must explain why a rule fragment stays manual`);
    assert.ok(!seenQuotes.has(quote), `${key} repeats an ignored quote`);
    if (ignored.reason === 'handled-by-dedicated-system') {
      assert.ok(ignored.handler?.trim(), `${key} must name the dedicated handler`);
    } else {
      assert.equal(ignored.handler, undefined, `${key} names a handler for a non-dedicated ignored reason`);
    }
    seenQuotes.add(quote);
  }
}

test('audits every current feature rule without an implicit green default', () => {
  const features = RULE_COLLECTIONS.flatMap((collection) => {
    const items = loadCollection(collection);
    assert.equal(items.length, EXPECTED_ITEM_COUNTS[collection], `${collection} item count changed`);
    const collectionFeatures = enumerateFeatures(collection);
    assert.equal(collectionFeatures.length, EXPECTED_FEATURE_COUNTS[collection], `${collection} feature count changed`);
    return collectionFeatures;
  });
  const audit = buildFeatureEffectAudit();
  const corpusKeys = features.map(({ key }) => key).sort();
  const declaredKeys = [...FEATURE_EFFECT_AUDIT_KEYS].sort();

  assert.equal(features.length, 218);
  assert.equal(new Set(FEATURE_EFFECT_AUDIT_KEYS).size, FEATURE_EFFECT_AUDIT_KEYS.length, 'feature audit contains duplicate keys');
  assert.deepEqual(declaredKeys, corpusKeys, 'every corpus feature must have exactly one explicit audit key');
  assert.deepEqual(Object.keys(audit).sort(), corpusKeys, 'built audit must cover exactly the current corpus');
  assert.equal(sha256Corpus(features), '7af7971f66576615ef997203267b41b46fc7272b219e5a591309f78195d82f14');

  for (const feature of features) assertAuditEntry(feature.key, feature.text, audit[feature.key as keyof typeof audit]);
});

test('pins usage limits from the same projected domain-card text used at runtime', () => {
  const cards = enumerateDomainCards();
  assert.equal(cards.length, EXPECTED_ITEM_COUNTS['domain-cards']);
  assert.equal(sha256Corpus(cards), 'cd04c23812707834f132bf5ca593c3e88b582498c08b8a7f715ed67fab0972bd');
  const actual = Object.fromEntries(cards.flatMap((card) => {
    const usage = analyzeContract(card.text).filter((effect) => effect.kind === 'usageLimit');
    return usage.length > 0 ? [[card.key.replace('domain-cards/', ''), usage.map((effect) => `${effect.reset}:${effect.max}`)]] : [];
  }));
  const rest = [
    'deft-maneuvers', 'book-of-illiat', 'enrapture', 'umbral-veil', 'reassurance', 'book-of-vagras', 'troublemaker',
    'bold-presence', 'scramble', 'hypnotic-shimmer', 'shared-trauma', 'towering-stalk', 'second-wind', 'critical-inspiration',
    'deadly-focus', 'book-of-exota', 'signature-move', 'manifest-wall', 'thorn-skin', 'smite', 'rousing-strike', 'banish',
    'share-the-burden', 'arcana-touched', 'bone-touched', 'codex-touched', 'midnight-touched', 'dread-touched', 'sage-touched',
    'rejuvenation-barrier', 'earthquake', 'sensory-projection'
  ];
  const longRest = [
    'mending-touch', 'a-soldiers-bond', 'siphon-essence', 'lean-on-me', 'book-of-grynn', 'healing-field', 'divination',
    'premonition', 'teleport', 'battle-hardened', 'zone-of-protection', 'wild-surge', 'splendor-touched', 'confusing-aura',
    'frenzy', 'battle-cry', 'book-of-vyola', 'astral-projection', 'dark-army', 'full-surge', 'reapers-strike',
    'splintering-strike', 'disintegration-wave', 'book-of-ronin', 'copycat', 'night-terror', 'plant-dominion',
    'transcendent-union', 'eclipse'
  ];
  assert.deepEqual(actual, {
    ...Object.fromEntries(rest.map((slug) => [slug, ['rest:1']])),
    ...Object.fromEntries(longRest.map((slug) => [slug, ['longRest:1']])),
    'book-of-homet': ['longRest:1', 'rest:1']
  });
});

test('pins every current top-level source text, including composite rules outside feature arrays', () => {
  const entries = enumerateTopLevelTexts();
  assert.equal(entries.length, 78);
  assert.equal(sha256Corpus(entries), 'f0caac9ba7d3b4575ab68a4ce8c834f30149c03d2ab7dad933594e12fd6dd393');

  const parsed = Object.fromEntries(entries.flatMap((entry) => {
    const effects = analyzeContract(entry.text);
    return effects.length > 0 ? [[entry.key, effects]] : [];
  }));
  assert.deepEqual(parsed, {
    'subclasses/beastbound': [
      { kind: 'usageLimit', max: 1, reset: 'rest', scope: 'feature', automatic: false }
    ]
  });
});

test('recognizes rule prose without relying on an official feature identity', () => {
  const rule = 'Получите дополнительную ячейку Ран. Возьмите две дополнительные карты домена.';
  const first = analyzeContract(`Совсем новая особенность. ${rule}`);
  const second = analyzeContract(`Домашнее правило с другим названием. ${rule}`);

  assert.deepEqual(first, [
    { kind: 'statDelta', target: 'hpMax', amount: 1, automatic: true },
    { kind: 'domainCardGrant', count: 2, automatic: true }
  ]);
  assert.deepEqual(second, first);
});

test('does not turn temporary or target-facing domain-card prose into permanent character effects', () => {
  const examples = [
    'Пока заклинание действует, вы получаете +2 к Уклонению.',
    'При успехе цель навсегда становится Уязвимой и получает постоянный штраф -1 к Сложности.',
    'Когда союзник отмечает Ячейку Брони, он дополнительно уменьшает тяжесть урона на один порог.'
  ];
  for (const example of examples) assert.deepEqual(analyzeContract(example), []);
});

test('does not infer a cooldown from a domain card that only mentions another limited ability as an example', () => {
  const conditionalExample = 'Когда союзник использовал способность с ограничением (например, один раз до следующего отдыха или один раз за сессию), потратьте Надежду, чтобы разрешить использовать её снова.';
  assert.deepEqual(analyzeContract(conditionalExample), []);
});
