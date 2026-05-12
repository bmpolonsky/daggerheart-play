import type { DaggerheartClass, DomainName, TraitId } from './types';

export const TRAITS: Array<{ id: TraitId; label: string; hint: string }> = [
  { id: 'agility', label: 'Проворность', hint: 'Бег, прыжки, маневрирование' },
  { id: 'strength', label: 'Сила', hint: 'Поднятие, разрушение, захват' },
  { id: 'finesse', label: 'Искусность', hint: 'Контроль, скрытность, тонкая работа' },
  { id: 'instinct', label: 'Инстинкт', hint: 'Восприятие, чутьё, навигация' },
  { id: 'presence', label: 'Влияние', hint: 'Очарование, выступление, обман' },
  { id: 'knowledge', label: 'Знание', hint: 'Вспоминание, анализ, понимание' }
];

export const TRAIT_LABELS: Record<TraitId, string> = TRAITS.reduce(
  (acc, trait) => ({ ...acc, [trait.id]: trait.label }),
  {} as Record<TraitId, string>
);

export const DAGGERHEART_CLASSES: DaggerheartClass[] = [
  'Bard',
  'Druid',
  'Guardian',
  'Ranger',
  'Rogue',
  'Seraph',
  'Sorcerer',
  'Warrior',
  'Wizard',
  'Custom'
];

export const CLASS_LABELS: Record<DaggerheartClass, string> = {
  Bard: 'Бард',
  Druid: 'Друид',
  Guardian: 'Страж',
  Ranger: 'Следопыт',
  Rogue: 'Плут',
  Seraph: 'Серафим',
  Sorcerer: 'Чародей',
  Warrior: 'Воин',
  Wizard: 'Волшебник',
  Custom: 'Свой класс'
};

export const CLASS_DOMAINS: Record<DaggerheartClass, DomainName[]> = {
  Bard: ['Codex', 'Grace'],
  Druid: ['Arcana', 'Sage'],
  Guardian: ['Blade', 'Valor'],
  Ranger: ['Bone', 'Sage'],
  Rogue: ['Grace', 'Midnight'],
  Seraph: ['Splendor', 'Valor'],
  Sorcerer: ['Arcana', 'Midnight'],
  Warrior: ['Blade', 'Bone'],
  Wizard: ['Codex', 'Splendor'],
  Custom: ['Custom']
};

export const CLASS_STARTING_STATS: Record<DaggerheartClass, { evasion: number; hp: number }> = {
  Bard: { evasion: 10, hp: 5 },
  Druid: { evasion: 10, hp: 6 },
  Guardian: { evasion: 9, hp: 7 },
  Ranger: { evasion: 12, hp: 6 },
  Rogue: { evasion: 12, hp: 6 },
  Seraph: { evasion: 9, hp: 7 },
  Sorcerer: { evasion: 10, hp: 6 },
  Warrior: { evasion: 11, hp: 6 },
  Wizard: { evasion: 11, hp: 5 },
  Custom: { evasion: 10, hp: 6 }
};

export const DOMAIN_NAMES: DomainName[] = [
  'Arcana',
  'Blade',
  'Bone',
  'Codex',
  'Grace',
  'Midnight',
  'Sage',
  'Splendor',
  'Valor',
  'Custom'
];

export const DOMAIN_LABELS: Record<DomainName, string> = {
  Arcana: 'Аркана',
  Blade: 'Клинок',
  Bone: 'Кость',
  Codex: 'Кодекс',
  Grace: 'Грация',
  Midnight: 'Полночь',
  Sage: 'Мудрость',
  Splendor: 'Величие',
  Valor: 'Доблесть',
  Custom: 'Свой домен'
};

export function classLabel(value: string): string {
  return Object.prototype.hasOwnProperty.call(CLASS_LABELS, value)
    ? CLASS_LABELS[value as DaggerheartClass]
    : value;
}

export function domainLabel(value: string): string {
  return Object.prototype.hasOwnProperty.call(DOMAIN_LABELS, value)
    ? DOMAIN_LABELS[value as DomainName]
    : value;
}

export const DEFAULT_TRAITS: Record<TraitId, number> = {
  agility: 2,
  strength: 0,
  finesse: 1,
  instinct: 1,
  presence: 0,
  knowledge: -1
};

export const CLASS_RECOMMENDED_TRAITS: Record<DaggerheartClass, Record<TraitId, number>> = {
  Bard: { agility: 0, strength: -1, finesse: 1, instinct: 0, presence: 2, knowledge: 1 },
  Druid: { agility: 1, strength: 0, finesse: 1, instinct: 2, presence: -1, knowledge: 0 },
  Guardian: { agility: 1, strength: 2, finesse: -1, instinct: 0, presence: 1, knowledge: 0 },
  Ranger: { agility: 2, strength: 0, finesse: 1, instinct: 1, presence: -1, knowledge: 0 },
  Rogue: { agility: 1, strength: -1, finesse: 2, instinct: 0, presence: 1, knowledge: 0 },
  Seraph: { agility: 0, strength: 2, finesse: 0, instinct: 1, presence: 1, knowledge: -1 },
  Sorcerer: { agility: 0, strength: -1, finesse: 1, instinct: 2, presence: 1, knowledge: 0 },
  Warrior: { agility: 2, strength: 1, finesse: 0, instinct: 1, presence: -1, knowledge: 0 },
  Wizard: { agility: -1, strength: 0, finesse: 0, instinct: 1, presence: 1, knowledge: 2 },
  Custom: DEFAULT_TRAITS
};

export const DEFAULT_MAX_HOPE = 6;
export const DEFAULT_STARTING_HOPE = 2;
export const DEFAULT_MAX_FEAR = 12;
export const DEFAULT_STRESS = 6;
export const DEFAULT_PROFICIENCY = 1;
export const DEFAULT_ACTION_TOKENS = 3;

export const DAMAGE_TYPE_LABELS = {
  physical: 'Физический',
  magic: 'Магический',
  direct: 'Прямой',
  mixed: 'Смешанный'
} as const;

export const ADVERSARY_TYPES = [
  'Bruiser',
  'Horde',
  'Leader',
  'Minion',
  'Ranged',
  'Skulk',
  'Social',
  'Solo',
  'Standard',
  'Support',
  'Custom'
] as const;

export const RANGES = ['Вплотную', 'Близко', 'Средне', 'Далеко', 'Очень далеко', 'Вне дистанции'] as const;

export const RANGE_LABELS: Record<string, string> = {
  Melee: 'Вплотную',
  melee: 'Вплотную',
  'Very Close': 'Близко',
  'very close': 'Близко',
  Close: 'Средне',
  close: 'Средне',
  Far: 'Далеко',
  far: 'Далеко',
  'Very Far': 'Очень далеко',
  'very far': 'Очень далеко',
  'Out of Range': 'Вне дистанции',
  'out of range': 'Вне дистанции',
  Вплотную: 'Вплотную',
  Близко: 'Близко',
  Средне: 'Средне',
  Далеко: 'Далеко',
  'Очень далеко': 'Очень далеко',
  'Вне дистанции': 'Вне дистанции'
};
