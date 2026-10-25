import type { Character, CharacterInventoryItem, Weapon } from './types';

/** Legacy names/descriptions never imply a weapon payload. */
export function isStoredWeapon(value: unknown): value is Weapon {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const weapon = value as Record<string, unknown>;
  return typeof weapon.id === 'string' && weapon.id.length > 0 && typeof weapon.name === 'string'
    && typeof weapon.trait === 'string' && ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'].includes(weapon.trait)
    && typeof weapon.range === 'string' && typeof weapon.damageFormula === 'string'
    && typeof weapon.damageType === 'string' && ['physical', 'magic', 'direct', 'mixed'].includes(weapon.damageType)
    && (weapon.category === undefined || (typeof weapon.category === 'string' && ['primary', 'secondary', 'custom'].includes(weapon.category)))
    && (weapon.burden === undefined || weapon.burden === null || (typeof weapon.burden === 'string' && ['one-handed', 'two-handed'].includes(weapon.burden)))
    && (weapon.sourceId === undefined || typeof weapon.sourceId === 'string' || (typeof weapon.sourceId === 'number' && Number.isFinite(weapon.sourceId)))
    && (weapon.sourceSlug === undefined || typeof weapon.sourceSlug === 'string')
    && (weapon.featureText === undefined || typeof weapon.featureText === 'string')
    && (weapon.notes === undefined || typeof weapon.notes === 'string');
}

export type WeaponTransferPlan =
  | { applied: true; character: Character }
  | { applied: false; message: string };

export function planUnequipWeapon(character: Character, weaponId: string): WeaponTransferPlan {
  const matches = character.weapons.filter((weapon) => weapon.id === weaponId);
  if (matches.length !== 1 || !isStoredWeapon(matches[0])) return { applied: false, message: 'Оружие не найдено или его данные неполны. Предмет не изменён.' };
  const weapon = matches[0];
  const itemId = `stowed-weapon:${weapon.id}`;
  if (character.inventory.some((item) => item.id === itemId || item.weapon?.id === weapon.id)) {
    return { applied: false, message: 'Это оружие уже есть в инвентаре. Предмет не изменён.' };
  }
  const item: CharacterInventoryItem = {
    id: itemId, name: weapon.name, kind: 'item', quantity: 1,
    text: [weapon.featureText, weapon.notes].filter(Boolean).join('\n\n'),
    sourceId: weapon.sourceId, sourceSlug: weapon.sourceSlug,
    weapon: { ...weapon }
  };
  return { applied: true, character: {
    ...character,
    weapons: character.weapons.filter((entry) => entry.id !== weaponId),
    inventory: [...character.inventory, item]
  } };
}

export function planEquipWeapon(character: Character, itemId: string): WeaponTransferPlan {
  const matches = character.inventory.filter((item) => item.id === itemId);
  const item = matches[0];
  if (matches.length !== 1 || item.quantity !== 1 || !isStoredWeapon(item.weapon)) {
    return { applied: false, message: 'Не удалось надеть оружие: нужна одна вещь с полными данными оружия. Предмет остаётся в инвентаре.' };
  }
  const weapon = item.weapon;
  if (character.weapons.some((entry) => entry.id === weapon.id) || character.inventory.some((entry) => entry.id !== itemId && entry.weapon?.id === weapon.id)) {
    return { applied: false, message: 'Это оружие уже надето или продублировано. Предмет остаётся в инвентаре.' };
  }
  const occupiedHands = character.weapons.filter((entry) => entry.burden === 'one-handed' || entry.burden === 'two-handed');
  if ((weapon.burden === 'two-handed' && occupiedHands.length > 0) || occupiedHands.some((entry) => entry.burden === 'two-handed')) {
    return { applied: false, message: 'Для этого оружия не хватает свободных рук. Сначала снимите другое оружие.' };
  }
  if (weapon.burden === 'one-handed' && occupiedHands.length >= 2) {
    return { applied: false, message: 'Обе руки уже заняты оружием. Сначала снимите другое оружие.' };
  }
  if ((weapon.burden === 'one-handed' || weapon.burden === 'two-handed') &&
    (weapon.category === 'primary' || weapon.category === 'secondary') &&
    occupiedHands.some((entry) => entry.category === weapon.category)) {
    return { applied: false, message: weapon.category === 'primary' ? 'Основное оружие уже надето. Сначала снимите его.' : 'Дополнительное оружие уже надето. Сначала снимите его.' };
  }
  return { applied: true, character: {
    ...character,
    weapons: [...character.weapons, { ...weapon }],
    inventory: character.inventory.filter((entry) => entry.id !== itemId)
  } };
}
