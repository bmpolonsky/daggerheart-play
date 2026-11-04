import { TRAIT_LABELS, rangeLabel } from '../rules/constants';
import { equipmentLibraryDisplay } from './libraryPresentation';
import type { LibraryEquipmentItem } from './types';
import { portablePublicAssetPath } from './publicAssets';

/** The shipped equipment WebPs are transparent dark-ink drawings, not photos. */
export function equipmentPickerImageBackdrop(imageUrl: string | null): 'paper' | undefined {
  const path = imageUrl ? portablePublicAssetPath(imageUrl) : '';
  return /^\.\/image\/equipment\/[^/?#]+\.webp(?:[?#].*)?$/.test(path) ? 'paper' : undefined;
}

/** Prefer normalized catalog fields over the upstream English fallback block. */
export function equipmentPickerDescription(source: LibraryEquipmentItem): string {
  const item = equipmentLibraryDisplay(source);
  const damageTypes: Record<string, string> = { physical: 'физ.', magic: 'маг.', magical: 'маг.', direct: 'прям.', mixed: 'смеш.', any: 'Любой' };
  const damageType = damageTypes[item.damageType] ?? item.damageType;
  return [
    item.trait ? `Характеристика: ${TRAIT_LABELS[item.trait]}` : item.usesSpellcastTrait ? 'Характеристика: Заклинание' : '',
    item.range ? `Дистанция: ${rangeLabel(item.range)}` : '',
    item.damageFormula ? `Урон: ${item.damageFormula}${damageType ? ` ${damageType}` : ''}` : '',
    item.burden ? `Хват: ${item.burden === 'one-handed' ? 'Одноручное' : 'Двуручное'}` : '',
    item.type === 'armor' && item.armorScore !== null ? `Показатель брони: ${item.armorScore}` : '',
    item.baseThresholds ? `Пороги: ${item.baseThresholds.major} / ${item.baseThresholds.severe}` : '',
    item.uses !== null ? `Использований: ${item.uses}` : '',
    item.featureText
  ].filter(Boolean).join('\n\n');
}
