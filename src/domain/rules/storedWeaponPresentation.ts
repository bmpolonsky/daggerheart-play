import { DAMAGE_TYPE_LABELS, TRAIT_LABELS, rangeLabel } from './constants';
import type { DamageType } from './types';
import { isStoredWeapon } from './weaponInventory';

/** Old transfers copied the same property into notes and item.text. Deduplicate
 * only those exact generated copies; retain independent notes and legacy text. */
export function storedWeaponInventoryText(item: { weapon?: unknown; text?: string }): string {
  if (!isStoredWeapon(item.weapon)) return item.text ?? '';
  const parts = [item.weapon.featureText, item.weapon.notes].map(text => text?.trim() ?? '').filter(Boolean);
  const unique = [...new Set(parts)];
  const legacy = item.text?.trim() ?? '';
  if (legacy && legacy !== parts.join('\n\n') && legacy !== unique.join('\n\n') && !unique.includes(legacy)) unique.push(legacy);
  return unique.join('\n\n');
}

export interface StoredWeaponPresentation {
  description: string;
  baseDamageFormula: string;
  traitLabel: string;
  rangeLabel: string;
  damageType: DamageType;
  damageTypeLabel: string;
  properties?: string;
  notes?: string;
  sourceId?: string | number;
  sourceSlug?: string;
  sourceLabel?: string;
}

/** Present the complete stored item, never effective equipped-character values. */
export function storedWeaponPresentation(item: unknown): StoredWeaponPresentation | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const weapon = (item as { weapon?: unknown }).weapon;
  if (!isStoredWeapon(weapon)) return null;
  const trait = TRAIT_LABELS[weapon.trait];
  const range = rangeLabel(weapon.range);
  const damageType = DAMAGE_TYPE_LABELS[weapon.damageType];
  const description = [
    [trait, range, `Базовый урон: ${weapon.damageFormula} (${damageType})`].filter(Boolean).join(' / '),
    weapon.featureText ? `Свойства: ${weapon.featureText}` : '',
    weapon.notes?.trim() && weapon.notes.trim() !== weapon.featureText?.trim() ? `Примечания: ${weapon.notes}` : '',
  ].filter(Boolean).join('\n\n');
  return {
    description,
    baseDamageFormula: weapon.damageFormula,
    traitLabel: trait,
    rangeLabel: range,
    damageType: weapon.damageType,
    damageTypeLabel: damageType,
    ...(weapon.featureText !== undefined ? { properties: weapon.featureText } : {}),
    ...(weapon.notes !== undefined ? { notes: weapon.notes } : {}),
    ...(weapon.sourceId !== undefined ? { sourceId: weapon.sourceId } : {}),
    ...(weapon.sourceSlug !== undefined ? { sourceSlug: weapon.sourceSlug } : {}),
  };
}
