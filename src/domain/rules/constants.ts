import type { AdversaryType, DaggerheartClass, DomainName, TraitId } from './types';

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

export function adversaryTypeLabel(type: AdversaryType): string {
  const labels: Record<AdversaryType, string> = {
    Bruiser: 'Громила',
    Horde: 'Орда',
    Leader: 'Лидер',
    Minion: 'Приспешник',
    Ranged: 'Дальнобойный',
    Skulk: 'Скрытный',
    Social: 'Социальный',
    Solo: 'Одиночка',
    Standard: 'Рядовой',
    Support: 'Поддержка',
    Custom: 'Свой тип'
  };
  return labels[type] ?? type;
}

export const DAGGERHEART_CLASSES: DaggerheartClass[] = [
  'Assassin',
  'Bard',
  'Druid',
  'Fighter',
  'Guardian',
  'Ranger',
  'Rogue',
  'Seraph',
  'Sorcerer',
  'Warlock',
  'Warrior',
  'Witch',
  'Wizard',
  'Custom'
];

export const PLAYTEST_CLASSES: DaggerheartClass[] = ['Assassin', 'Fighter', 'Warlock', 'Witch'];

export const CLASS_LABELS: Record<DaggerheartClass, string> = {
  Assassin: 'Ассасин',
  Bard: 'Бард',
  Druid: 'Друид',
  Fighter: 'Боец',
  Guardian: 'Страж',
  Ranger: 'Следопыт',
  Rogue: 'Плут',
  Seraph: 'Серафим',
  Sorcerer: 'Чародей',
  Warlock: 'Колдун',
  Warrior: 'Воин',
  Witch: 'Ведьма',
  Wizard: 'Волшебник',
  Custom: 'Свой класс'
};

export const CLASS_DOMAINS: Record<DaggerheartClass, DomainName[]> = {
  Assassin: ['Blade', 'Midnight'],
  Bard: ['Codex', 'Grace'],
  Druid: ['Arcana', 'Sage'],
  Fighter: ['Valor', 'Bone'],
  Guardian: ['Blade', 'Valor'],
  Ranger: ['Bone', 'Sage'],
  Rogue: ['Grace', 'Midnight'],
  Seraph: ['Splendor', 'Valor'],
  Sorcerer: ['Arcana', 'Midnight'],
  Warlock: ['Dread', 'Grace'],
  Warrior: ['Blade', 'Bone'],
  Witch: ['Dread', 'Sage'],
  Wizard: ['Codex', 'Splendor'],
  Custom: ['Custom']
};

export const CLASS_STARTING_STATS: Record<DaggerheartClass, { evasion: number; hp: number }> = {
  Assassin: { evasion: 12, hp: 5 },
  Bard: { evasion: 10, hp: 5 },
  Druid: { evasion: 10, hp: 6 },
  Fighter: { evasion: 10, hp: 6 },
  Guardian: { evasion: 9, hp: 7 },
  Ranger: { evasion: 12, hp: 6 },
  Rogue: { evasion: 12, hp: 6 },
  Seraph: { evasion: 9, hp: 7 },
  Sorcerer: { evasion: 10, hp: 6 },
  Warlock: { evasion: 11, hp: 5 },
  Warrior: { evasion: 11, hp: 6 },
  Witch: { evasion: 10, hp: 6 },
  Wizard: { evasion: 11, hp: 5 },
  Custom: { evasion: 10, hp: 6 }
};

export const DOMAIN_NAMES: DomainName[] = [
  'Arcana',
  'Blade',
  'Bone',
  'Codex',
  'Dread',
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
  Dread: 'Ужас',
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

export function characterClassLabel(character: { className: DaggerheartClass; classDisplayName?: string }): string {
  return character.classDisplayName?.trim() || classLabel(character.className);
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
  Assassin: DEFAULT_TRAITS,
  Bard: { agility: 0, strength: -1, finesse: 1, instinct: 0, presence: 2, knowledge: 1 },
  Druid: { agility: 1, strength: 0, finesse: 1, instinct: 2, presence: -1, knowledge: 0 },
  Fighter: DEFAULT_TRAITS,
  Guardian: { agility: 1, strength: 2, finesse: -1, instinct: 0, presence: 1, knowledge: 0 },
  Ranger: { agility: 2, strength: 0, finesse: 1, instinct: 1, presence: -1, knowledge: 0 },
  Rogue: { agility: 1, strength: -1, finesse: 2, instinct: 0, presence: 1, knowledge: 0 },
  Seraph: { agility: 0, strength: 2, finesse: 0, instinct: 1, presence: 1, knowledge: -1 },
  Sorcerer: { agility: 0, strength: -1, finesse: 1, instinct: 2, presence: 1, knowledge: 0 },
  Warlock: DEFAULT_TRAITS,
  Warrior: { agility: 2, strength: 1, finesse: 0, instinct: 1, presence: -1, knowledge: 0 },
  Witch: DEFAULT_TRAITS,
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

export const RANGES = ['Вплотную', 'Близкая', 'Средняя', 'Далёкая', 'Очень далёкая', 'Вне дистанции'] as const;

export const RANGE_LABELS: Record<string, string> = {
  Melee: 'Вплотную',
  melee: 'Вплотную',
  'Very Close': 'Близкая',
  'very close': 'Близкая',
  veryclose: 'Близкая',
  Close: 'Средняя',
  close: 'Средняя',
  Far: 'Далёкая',
  far: 'Далёкая',
  'Very Far': 'Очень далёкая',
  'very far': 'Очень далёкая',
  veryfar: 'Очень далёкая',
  'Out of Range': 'Вне дистанции',
  'out of range': 'Вне дистанции',
  outofrange: 'Вне дистанции',
  Any: 'Любая',
  any: 'Любая',
  Вплотную: 'Вплотную',
  Близко: 'Близкая',
  Близкая: 'Близкая',
  Средне: 'Средняя',
  Средняя: 'Средняя',
  Далеко: 'Далёкая',
  Далёкая: 'Далёкая',
  'Очень далеко': 'Очень далёкая',
  'Очень далёкая': 'Очень далёкая',
  'Вне дистанции': 'Вне дистанции'
};

export function rangeLabel(value: string | null | undefined): string {
  const range = value?.trim() ?? '';
  if (!range) return '';
  const compact = range.toLowerCase().replace(/[\s_-]+/g, '');
  return RANGE_LABELS[range] ?? RANGE_LABELS[compact] ?? range;
}

export const RANGE_OPTIONS = [
  { id: 'melee', name: rangeLabel('melee') },
  { id: 'very-close', name: rangeLabel('very-close') },
  { id: 'close', name: rangeLabel('close') },
  { id: 'far', name: rangeLabel('far') },
  { id: 'very-far', name: rangeLabel('very-far') },
  { id: 'any', name: rangeLabel('any') }
] as const;
