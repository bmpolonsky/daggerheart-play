import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildStartingEquipmentLoadout } from '../../src/domain/rules/equipment';
import { DEFAULT_TRAITS } from '../../src/domain/rules/constants';
import { validateCharacterBuilderReadiness } from '../../src/domain/characterBuilder/validation';
import { CharacterBuilderService } from '../../src/ui/characters/CharacterBuilderService';
import { equipmentFixture } from './helpers';

const equipment = equipmentFixture();
const content = { ancestries: [], communities: [], subclasses: [], domainCards: [] };
const base = { className: 'Bard' as const, equipment, traits: DEFAULT_TRAITS };

test('explicit no-secondary choice differs from legacy default and never adds an offhand item', () => {
  assert.equal(buildStartingEquipmentLoadout(base).weapons.length, 2);
  const none = buildStartingEquipmentLoadout({ ...base, secondaryWeaponId: null });
  assert.equal(none.secondaryWeapon, null);
  assert.equal(none.weapons.length, 1);
  const readiness = validateCharacterBuilderReadiness({ ...base, content, classes: [], primaryWeaponId: 'equipment:broadsword', secondaryWeaponId: null });
  assert.equal(readiness.issues.some((issue) => issue.id === 'equipment.secondaryWeapon'), false);
});

test('two-handed primary excludes a secondary and switching back preserves explicit none', () => {
  const service = new CharacterBuilderService();
  const model = () => service.buildModel({ content, classes: [], equipment, draft: service.draft$.get() });
  model().handlers.selectSecondaryWeapon(null);
  model().handlers.selectPrimaryWeapon('equipment:longbow');
  assert.equal(model().options.showSecondaryWeapon, false);
  assert.equal(model().result.draft.weapons!.length, 1);
  model().handlers.selectPrimaryWeapon('equipment:broadsword');
  assert.equal(model().options.showSecondaryWeapon, true);
  assert.equal(model().fields.secondaryWeaponId, null);
  assert.equal(model().result.draft.weapons!.length, 1);
});
