import { DAMAGE_TYPE_LABELS, TRAIT_LABELS, rangeLabel } from './constants';
import type { DamageType } from './types';
import { isStoredWeapon } from './weaponInventory';

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
  const references = [
    weapon.sourceId !== undefined && String(weapon.sourceId) !== '' ? `ID ${weapon.sourceId}` : '',
    weapon.sourceSlug ? `slug ${weapon.sourceSlug}` : ''
  ].filter(Boolean);
  const sourceLabel = references.length > 0 ? references.join(' / ') : undefined;
  const description = [
    [trait, range, `Базовый урон: ${weapon.damageFormula} (${damageType})`].filter(Boolean).join(' / '),
    weapon.featureText ? `Свойства: ${weapon.featureText}` : '',
    weapon.notes ? `Примечания: ${weapon.notes}` : '',
    sourceLabel ? `Источник: ${sourceLabel}` : ''
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
    ...(sourceLabel ? { sourceLabel } : {})
  };
}
