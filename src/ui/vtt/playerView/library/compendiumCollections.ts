import type { ContentCollectionKey } from '../../../../domain/content/types';

export type CompendiumCollectionOption = {
  key: ContentCollectionKey;
  label: string;
  shortLabel: string;
};

export const COMPENDIUM_COLLECTIONS: CompendiumCollectionOption[] = [
  { key: 'rules', label: 'Правила', shortLabel: 'Правила' },
  { key: 'classes', label: 'Классы', shortLabel: 'Классы' },
  { key: 'subclasses', label: 'Подклассы', shortLabel: 'Подклассы' },
  { key: 'ancestries', label: 'Родословные', shortLabel: 'Родословные' },
  { key: 'communities', label: 'Сообщества', shortLabel: 'Сообщества' },
  { key: 'domainCards', label: 'Карты доменов', shortLabel: 'Домены' },
  { key: 'equipment', label: 'Снаряжение', shortLabel: 'Снаряжение' },
  { key: 'adversaries', label: 'Противники', shortLabel: 'Противники' },
  { key: 'environments', label: 'Окружения', shortLabel: 'Окружения' },
  { key: 'beastforms', label: 'Звероформы', shortLabel: 'Звероформы' }
];

export function compendiumCollectionLabel(key: ContentCollectionKey): string {
  return COMPENDIUM_COLLECTIONS.find((collection) => collection.key === key)?.label ?? 'Компендиум';
}
