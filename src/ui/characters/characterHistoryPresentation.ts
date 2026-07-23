import type { CharacterChangeValue, CharacterFieldChange } from '../../domain/rules/types';
import { TRAIT_LABELS } from '../../domain/rules/constants';

const FIELD_LABELS: Record<string, string> = {
  name: 'Имя',
  playerName: 'Имя игрока',
  pronouns: 'Местоимения',
  className: 'Класс',
  subclassName: 'Подкласс',
  subclassSlug: 'Подкласс',
  ancestry: 'Родословная',
  community: 'Сообщество',
  level: 'Уровень',
  proficiency: 'Мастерство',
  traits: 'Характеристики',
  evasion: 'Уклонение',
  thresholds: 'Пороги',
  major: 'Тяжёлый',
  severe: 'Критический',
  hp: 'Раны',
  stress: 'Стресс',
  hope: 'Надежда',
  armor: 'Броня',
  marked: 'Отмечено',
  markedSlots: 'Отмечено',
  value: 'Значение',
  max: 'Максимум',
  experiences: 'Опыты',
  domainCards: 'Карты доменов',
  loadoutCards: 'Подготовленные карты',
  sheetCards: 'Свойства',
  usageTrackers: 'Трекеры',
  weapons: 'Оружие',
  inventory: 'Инвентарь',
  conditions: 'Состояния',
  scars: 'Шрамы',
  companion: 'Компаньон',
  domains: 'Домены',
  ruleModifiers: 'Модификаторы правил',
  advancement: 'Повышение',
  choiceUsesByRank: 'Выборы по рангу',
  description: 'Образ',
  appearance: 'Внешность',
  demeanor: 'Манеры',
  backstory: 'Предыстория',
  notes: 'Заметки',
  portraitUrl: 'Портрет',
  imageUrl: 'Изображение'
};

export function characterHistoryFieldLabel(path: string[]): string {
  if (path.length === 0) return 'Персонаж';
  return path
    .map((part) => TRAIT_LABELS[part as keyof typeof TRAIT_LABELS] ?? FIELD_LABELS[part] ?? (/^\d+$/.test(part) ? `№${Number(part) + 1}` : part))
    .join(' — ');
}

export function formatCharacterFieldChange(change: CharacterFieldChange): string {
  const before = change.beforeExists ? change.before : undefined;
  const after = change.afterExists ? change.after : undefined;
  const collectionChange = formatNamedCollectionChange(before, after);
  if (collectionChange) return collectionChange;
  return `${formatCharacterChangeValue(before, change.path)} → ${formatCharacterChangeValue(after, change.path)}`;
}

export function formatCharacterChangeValue(value: CharacterChangeValue | undefined, path: string[] = []): string {
  if (value === undefined) return 'не задано';
  if (value === null) return 'нет';
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (isImageValue(value, path)) return value ? 'изображение' : 'нет';
    return truncate(value || 'пусто');
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'пусто';
    const named = value.map(namedValueLabel).filter((item): item is string => Boolean(item));
    if (named.length === value.length) return summarizeLabels(named);
    const primitives = value.filter((item) => typeof item === 'string' || typeof item === 'number');
    if (primitives.length === value.length) return summarizeLabels(primitives.map(String));
    return `${value.length} ${pluralize(value.length, 'элемент', 'элемента', 'элементов')}`;
  }

  const resourceValue = resourceLabel(value);
  if (resourceValue) return resourceValue;
  const named = namedValueLabel(value);
  if (named) return named;

  const entries = Object.entries(value)
    .filter(([, nested]) => nested !== null && typeof nested !== 'object')
    .slice(0, 4)
    .map(([key, nested]) => `${FIELD_LABELS[key] ?? key}: ${formatCharacterChangeValue(nested, [...path, key])}`);
  return entries.length > 0 ? entries.join(', ') : 'изменено';
}

function formatNamedCollectionChange(
  before: CharacterChangeValue | undefined,
  after: CharacterChangeValue | undefined
): string | null {
  if (!Array.isArray(before) || !Array.isArray(after)) return null;
  if (![...before, ...after].every((item) => item && typeof item === 'object' && !Array.isArray(item) && namedValueLabel(item))) return null;

  const beforeItems = new Map(before.map((item, index) => [namedValueKey(item, index), item]));
  const afterItems = new Map(after.map((item, index) => [namedValueKey(item, index), item]));
  const added = [...afterItems].filter(([key]) => !beforeItems.has(key)).map(([, item]) => namedValueLabel(item)!);
  const removed = [...beforeItems].filter(([key]) => !afterItems.has(key)).map(([, item]) => namedValueLabel(item)!);
  const updated = [...afterItems].filter(([key, item]) => {
    const previous = beforeItems.get(key);
    return previous !== undefined && JSON.stringify(previous) !== JSON.stringify(item);
  }).map(([, item]) => namedValueLabel(item)!);

  const parts = [
    added.length ? `Добавлено: ${summarizeLabels(added)}` : '',
    removed.length ? `Убрано: ${summarizeLabels(removed)}` : '',
    updated.length ? `Обновлено: ${summarizeLabels(updated)}` : ''
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(' — ');

  const beforeOrder = [...beforeItems.keys()];
  const afterOrder = [...afterItems.keys()];
  if (beforeOrder.some((key, index) => key !== afterOrder[index])) {
    return `Изменён порядок: ${summarizeLabels(after.map((item) => namedValueLabel(item)!))}`;
  }
  return 'Состав обновлён';
}

function namedValueKey(value: CharacterChangeValue, index: number): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `index:${index}`;
  const id = value.id;
  if (typeof id === 'string' && id) return `id:${id}`;
  const name = value.name;
  if (typeof name === 'string' && name) return `name:${name}`;
  return `index:${index}`;
}

function namedValueLabel(value: CharacterChangeValue): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = typeof value.name === 'string'
    ? value.name
    : typeof value.label === 'string'
      ? value.label
      : typeof value.title === 'string'
        ? value.title
        : null;
  if (!name) return null;

  if (typeof value.modifier === 'number') return `${name} ${value.modifier >= 0 ? '+' : ''}${value.modifier}`;
  if (typeof value.quantity === 'number' && value.quantity > 1) return `${name} ×${value.quantity}`;
  if (typeof value.level === 'number') return `${name} — уровень ${value.level}`;
  return name;
}

function resourceLabel(value: { [key: string]: CharacterChangeValue }): string | null {
  if (typeof value.max !== 'number') return null;
  if (typeof value.marked === 'number') return `${value.marked}/${value.max}`;
  if (typeof value.markedSlots === 'number') return `${value.markedSlots}/${value.max}`;
  if (typeof value.value === 'number') return `${value.value}/${value.max}`;
  return null;
}

function isImageValue(value: string, path: string[]): boolean {
  const field = path.at(-1);
  return field === 'portraitUrl' || field === 'imageUrl' || value.startsWith('data:image/');
}

function summarizeLabels(labels: string[]): string {
  const visible = labels.slice(0, 4);
  const remaining = labels.length - visible.length;
  return remaining > 0 ? `${visible.join(', ')} и ещё ${remaining}` : visible.join(', ');
}

function pluralize(value: number, one: string, few: string, many: string): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function truncate(value: string): string {
  return value.length > 180 ? `${value.slice(0, 177).trim()}…` : value;
}
