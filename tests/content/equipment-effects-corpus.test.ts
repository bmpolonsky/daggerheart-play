import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { mapRawEquipmentItem } from '../../src/domain/content/mappers';
import type { RawEquipmentItem } from '../../src/domain/content/types';
import { equipmentFeatureModifiers, type EquipmentFeatureModifiers } from '../../src/domain/rules/equipmentFeatureModifiers';

const EMPTY_MODIFIERS = { armorScoreModifier: 0, evasionModifier: 0, traitModifiers: {} };
const expectedModifiers = (overrides: Partial<EquipmentFeatureModifiers>): EquipmentFeatureModifiers => ({ ...EMPTY_MODIFIERS, ...overrides });
const EXPECTED_MODIFIERS: Record<string, EquipmentFeatureModifiers> = {
  'gambeson-armor': expectedModifiers({ evasionModifier: 1 }),
  'chainmail-armor': expectedModifiers({ evasionModifier: -1 }),
  'full-plate-armor': expectedModifiers({ evasionModifier: -2, traitModifiers: { agility: -1 } }),
  'improved-gambeson-armor': expectedModifiers({ evasionModifier: 1 }),
  'improved-chainmail-armor': expectedModifiers({ evasionModifier: -1 }),
  'improved-full-plate-armor': expectedModifiers({ evasionModifier: -2, traitModifiers: { agility: -1 } }),
  'bellamoi-fine-armor': expectedModifiers({ traitModifiers: { presence: 1 } }),
  'advanced-gambeson-armor': expectedModifiers({ evasionModifier: 1 }),
  'advanced-chainmail-armor': expectedModifiers({ evasionModifier: -1 }),
  'advanced-full-plate-armor': expectedModifiers({ evasionModifier: -2, traitModifiers: { agility: -1 } }),
  'legendary-gambeson-armor': expectedModifiers({ evasionModifier: 1 }),
  'legendary-chainmail-armor': expectedModifiers({ evasionModifier: -1 }),
  'legendary-full-plate-armor': expectedModifiers({ evasionModifier: -2, traitModifiers: { agility: -1 } }),
  'savior-chainmail': expectedModifiers({
    evasionModifier: -1,
    traitModifiers: { agility: -1, strength: -1, finesse: -1, instinct: -1, presence: -1, knowledge: -1 }
  }),
  halberd: expectedModifiers({ traitModifiers: { finesse: -1 } }),
  warhammer: expectedModifiers({ evasionModifier: -1 }),
  greatsword: expectedModifiers({ evasionModifier: -1 }),
  longbow: expectedModifiers({ traitModifiers: { finesse: -1 } }),
  'improved-halberd': expectedModifiers({ traitModifiers: { finesse: -1 } }),
  'improved-warhammer': expectedModifiers({ evasionModifier: -1 }),
  'improved-greatsword': expectedModifiers({ evasionModifier: -1 }),
  'improved-longbow': expectedModifiers({ traitModifiers: { finesse: -1 } }),
  bravesword: expectedModifiers({ evasionModifier: -1 }),
  'advanced-halberd': expectedModifiers({ traitModifiers: { finesse: -1 } }),
  'advanced-warhammer': expectedModifiers({ evasionModifier: -1 }),
  'advanced-greatsword': expectedModifiers({ evasionModifier: -1 }),
  'advanced-longbow': expectedModifiers({ traitModifiers: { finesse: -1 } }),
  'labrys-axe': expectedModifiers({ armorScoreModifier: 1 }),
  'legendary-halberd': expectedModifiers({ traitModifiers: { finesse: -1 } }),
  'legendary-warhammer': expectedModifiers({ evasionModifier: -1 }),
  'legendary-greatsword': expectedModifiers({ evasionModifier: -1 }),
  'legendary-longbow': expectedModifiers({ traitModifiers: { finesse: -1 } }),
  'sledge-axe': expectedModifiers({ traitModifiers: { agility: -1 } }),
  'tower-shield': expectedModifiers({ armorScoreModifier: 2, evasionModifier: -1 }),
  'round-shield': expectedModifiers({ armorScoreModifier: 1 }),
  'improved-tower-shield': expectedModifiers({ armorScoreModifier: 3, evasionModifier: -1 }),
  'improved-round-shield': expectedModifiers({ armorScoreModifier: 2 }),
  'spiked-shield': expectedModifiers({ armorScoreModifier: 1 }),
  'advanced-tower-shield': expectedModifiers({ armorScoreModifier: 4, evasionModifier: -1 }),
  'advanced-round-shield': expectedModifiers({ armorScoreModifier: 3 }),
  'legendary-tower-shield': expectedModifiers({ armorScoreModifier: 5, evasionModifier: -1 }),
  'legendary-round-shield': expectedModifiers({ armorScoreModifier: 4 }),
  'heavy-frame-wheelchair': expectedModifiers({ evasionModifier: -1 }),
  'improved-heavy-frame-wheelchair': expectedModifiers({ evasionModifier: -1 }),
  'advanced-heavy-frame-wheelchair': expectedModifiers({ evasionModifier: -1 }),
  'legendary-heavy-frame-wheelchair': expectedModifiers({ evasionModifier: -1 }),
  'control-relic': expectedModifiers({ traitModifiers: { finesse: 1 } }),
  'stride-relic': expectedModifiers({ traitModifiers: { agility: 1 } }),
  'attune-relic': expectedModifiers({ traitModifiers: { instinct: 1 } }),
  'charm-relic': expectedModifiers({ traitModifiers: { presence: 1 } }),
  'enlighten-relic': expectedModifiers({ traitModifiers: { knowledge: 1 } }),
  'bolster-relic': expectedModifiers({ traitModifiers: { strength: 1 } })
};

test('audits recognized stat modifiers for every current equipment item', () => {
  const path = fileURLToPath(new URL('../../public/data/equipment.json', import.meta.url));
  const payload = JSON.parse(readFileSync(path, 'utf8')) as { data?: RawEquipmentItem[] };
  const equipment = (payload.data ?? []).map(mapRawEquipmentItem);

  assert.equal(equipment.length, 358, 'equipment item count changed');
  assert.equal(new Set(equipment.map((item) => item.slug)).size, equipment.length, 'equipment slugs must be unique');
  const rows = equipment.map(({ slug, featureText }) => [slug, featureText] as const).sort(([left], [right]) => left.localeCompare(right));
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'), 'b41404e67fe41de865013cd24d09c70044b05b818d6aa0746db03400bc5004ba');

  const corpusSlugs = new Set(equipment.map((item) => item.slug));
  for (const slug of Object.keys(EXPECTED_MODIFIERS)) assert.ok(corpusSlugs.has(slug), `audited equipment is missing: ${slug}`);
  for (const item of equipment) {
    assert.deepEqual(
      equipmentFeatureModifiers(item.featureText),
      EXPECTED_MODIFIERS[item.slug] ?? EMPTY_MODIFIERS,
      `${item.slug} equipment modifiers changed`
    );
  }
});
