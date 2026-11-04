import { test, expect } from 'vitest';
import { mapRawEquipmentItem } from '../../src/domain/content/mappers';
import { equipmentPickerDescription, equipmentPickerImageBackdrop } from '../../src/domain/content/equipmentPresentation';

test('only shipped equipment artwork opts into the paper backdrop', () => {
  expect(equipmentPickerImageBackdrop('/image/equipment/blade.webp')).toBe('paper');
  expect(equipmentPickerImageBackdrop('./image/equipment/leather-armor.webp')).toBe('paper');
  expect(equipmentPickerImageBackdrop('/image/domain/card/untouchable.webp')).toBeUndefined();
  expect(equipmentPickerImageBackdrop('asset:qa-colored-photo')).toBeUndefined();
  expect(equipmentPickerImageBackdrop('https://example.com/color.webp')).toBeUndefined();
  expect(equipmentPickerImageBackdrop(null)).toBeUndefined();
});

test('weapon preview uses localized fields and the translated feature without an English duplicate', () => {
  const item = mapRawEquipmentItem({
    slug: 'legendary-returning-blade', name: 'Легендарный Возвращающийся клинок', type_slug: 'primary-weapon',
    char_trait: 'finesse', range: 'close', die_num: 1, die_size: 8, bonus: 9, damage_ty: 'magical', burden: 1,
    features: [{ name: 'Возвращающееся', main_body: 'Когда это оружие брошено, оно появляется в вашей руке.' }],
    main_body: '**Trait:** Finesse; **Range:** Close; **Damage:** d8+9 mag; **Burden:** One-Handed\n\n**Feature:** Returning: When thrown, it returns.'
  });
  const original = structuredClone(item);
  const text = equipmentPickerDescription(item);
  expect(text).toContain('Характеристика: Искусность');
  expect(text).toContain('Дистанция: Средняя');
  expect(text).toContain('Урон: 1d8+9 маг.');
  expect(text).toContain('Хват: Одноручное');
  expect(text.match(/Когда это оружие брошено/g)).toHaveLength(1);
  expect(text).not.toMatch(/Trait:|Feature:|Returning:|One-Handed/);
  expect(item).toEqual(original);
});

test('armor preview retains zero armor and thresholds without weapon editor defaults', () => {
  const item = mapRawEquipmentItem({ slug: 'qa-armor', type_slug: 'armor', armor_score: 0, base_thresholds: [5, 11], char_trait: 'agility', range: 'melee', die_num: 1, die_size: 8, burden: 1 });
  const text = equipmentPickerDescription(item);
  expect(text).toContain('Показатель брони: 0');
  expect(text).toContain('Пороги: 5 / 11');
  expect(text).not.toMatch(/Характеристика:|Дистанция:|Урон:|Хват:/);
});

test('ordinary item prose from the body remains available when structured features are absent', () => {
  const item = mapRawEquipmentItem({ slug: 'qa-rope', type_slug: 'item', main_body: 'Верёвка длиной 15 метров.' });
  expect(equipmentPickerDescription(item)).toContain('Верёвка длиной 15 метров.');
});
