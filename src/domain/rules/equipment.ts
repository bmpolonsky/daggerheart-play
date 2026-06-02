import type { LibraryEquipmentItem } from '../content/types';
import type { ArmorState, CharacterInventoryItem, CharacterSheetCard, DaggerheartClass, DamageType, TraitId, Weapon } from './types';
import { createInventoryItem } from './factories';

const MAX_ARMOR_SCORE = 12;

export interface StartingEquipmentCatalog {
  armor: StartingArmorOption[];
  primaryWeapons: StartingWeaponOption[];
  secondaryWeapons: StartingWeaponOption[];
  consumables: StartingInventoryOption[];
}

export interface StartingEquipmentInput {
  className: DaggerheartClass;
  equipment: LibraryEquipmentItem[];
  primaryWeaponId?: string;
  secondaryWeaponId?: string;
  armorId?: string;
  classItem?: string;
  classItems?: readonly string[];
  consumableId?: string;
  traits: Record<TraitId, number>;
  includePlaytest?: boolean;
}

export interface StartingEquipmentLoadout {
  catalog: StartingEquipmentCatalog;
  primaryWeapon: StartingWeaponOption;
  secondaryWeapon: StartingWeaponOption | null;
  armorOption: StartingArmorOption;
  consumable: StartingInventoryOption | null;
  armor: ArmorState;
  weapons: Weapon[];
  inventory: CharacterInventoryItem[];
  traits: Record<TraitId, number>;
  evasionModifier: number;
  warnings: string[];
}

export interface StartingWeaponOption {
  id: string;
  slug: string;
  name: string;
  category: 'primary' | 'secondary';
  tier: number;
  trait: TraitId;
  range: string;
  damageFormula: string;
  damageType: DamageType;
  burden: 'one-handed' | 'two-handed';
  feature?: string;
  magical?: boolean;
  source: LibraryEquipmentItem;
}

export interface StartingArmorOption {
  id: string;
  slug: string;
  name: string;
  tier: number;
  baseMajor: number;
  baseSevere: number;
  score: number;
  feature?: string;
  evasionModifier?: number;
  traitModifiers?: Partial<Record<TraitId, number>>;
  source: LibraryEquipmentItem;
}

export interface StartingInventoryOption {
  id: string;
  slug: string;
  name: string;
  text: string;
  kind: CharacterInventoryItem['kind'];
  uses: number | null;
  imageUrl?: string | null;
  source: LibraryEquipmentItem;
}

export type EquipmentAttachmentKind = 'armor' | 'weapon' | 'inventory';

export interface EquipmentAttachmentPlan {
  kind: EquipmentAttachmentKind;
  name: string;
  armor?: ArmorState;
  weapon?: Omit<Weapon, 'id'>;
  inventoryItem?: CharacterInventoryItem;
  sheetCard?: Partial<CharacterSheetCard>;
  warnings: string[];
}

export const CLASS_STARTING_ITEMS: Record<DaggerheartClass, [string, string]> = {
  Bard: ['Любовный роман', 'Неоткрытое письмо'],
  Druid: ['Мешочек с камнями и костями', 'Странный кулон'],
  Guardian: ['Тотем наставника', 'Секретный ключ'],
  Ranger: ['Трофей первого убийства', 'Сломанный компас'],
  Rogue: ['Набор для фальсификации', 'Крюк-кошка'],
  Seraph: ['Подношения', 'Символ божества'],
  Sorcerer: ['Шепчущая сфера', 'Семейная реликвия'],
  Warrior: ['Рисунок возлюбленного', 'Точильный камень'],
  Wizard: ['Книга для перевода', 'Питомец-элементаль'],
  Custom: ['Памятный предмет', 'Личный талисман']
};

export const STARTING_BASE_INVENTORY = ['Факел', '50 футов веревки', 'Основные припасы'] as const;

const STARTING_CONSUMABLE_SLUGS = new Set(['minor-health-potion', 'minor-stamina-potion']);

export function buildStartingEquipmentCatalog(equipment: LibraryEquipmentItem[], includePlaytest = false): StartingEquipmentCatalog {
  const available = includePlaytest ? equipment : equipment.filter(isSrdEquipment);
  return {
    armor: available.filter((item) => item.type === 'armor' && item.tier === 1).map(toArmorOption).filter(Boolean) as StartingArmorOption[],
    primaryWeapons: available.filter((item) => item.type === 'primary-weapon' && item.tier === 1).map(toWeaponOption).filter(Boolean) as StartingWeaponOption[],
    secondaryWeapons: available.filter((item) => item.type === 'secondary-weapon' && item.tier === 1).map(toWeaponOption).filter(Boolean) as StartingWeaponOption[],
    consumables: available
      .filter((item) => item.type === 'consumable' && (STARTING_CONSUMABLE_SLUGS.has(item.slug) || item.name.toLowerCase().startsWith('малое зелье')))
      .map(toInventoryOption)
  };
}

export function buildStartingEquipmentLoadout(input: StartingEquipmentInput): StartingEquipmentLoadout {
  const warnings: string[] = [];
  const catalog = buildStartingEquipmentCatalog(input.equipment, input.includePlaytest);
  const armorOption = selectByIdOrSlug(catalog.armor, input.armorId) ?? catalog.armor[0];
  const primaryWeapon = selectByIdOrSlug(catalog.primaryWeapons, input.primaryWeaponId) ?? catalog.primaryWeapons[0];
  const requestedSecondary = selectByIdOrSlug(catalog.secondaryWeapons, input.secondaryWeaponId) ?? catalog.secondaryWeapons[0] ?? null;
  const secondaryWeapon = primaryWeapon?.burden === 'one-handed' ? requestedSecondary : null;
  const consumable = selectByIdOrSlug(catalog.consumables, input.consumableId) ?? catalog.consumables[0] ?? null;

  if (!armorOption) warnings.push('No tier 1 armor loaded from /api/equipment.');
  if (!primaryWeapon) warnings.push('No tier 1 primary weapon loaded from /api/equipment.');
  if (input.armorId && armorOption && !matchesIdOrSlug(armorOption, input.armorId)) warnings.push(`Armor ${input.armorId} is not available at character creation.`);
  if (input.primaryWeaponId && primaryWeapon && !matchesIdOrSlug(primaryWeapon, input.primaryWeaponId)) warnings.push(`Primary weapon ${input.primaryWeaponId} is not available at character creation.`);
  if (input.secondaryWeaponId && requestedSecondary && !matchesIdOrSlug(requestedSecondary, input.secondaryWeaponId)) warnings.push(`Secondary weapon ${input.secondaryWeaponId} is not available at character creation.`);
  if (input.secondaryWeaponId && primaryWeapon?.burden === 'two-handed') warnings.push(`${primaryWeapon.name} занимает обе руки, второе оружие не добавлено.`);

  const safeArmor = armorOption ?? emptyArmorOption();
  const safePrimary = primaryWeapon ?? emptyWeaponOption();
  const armor = armorToState(safeArmor);
  const evasionModifier = 0;
  const traits = { ...input.traits };
  const classItems = input.classItems?.length ? input.classItems : CLASS_STARTING_ITEMS[input.className] ?? CLASS_STARTING_ITEMS.Custom;
  const selectedClassItem = classItems.includes(input.classItem ?? '') ? input.classItem : classItems[0];
  warnings.push(
    ...runtimeModifierWarnings(safeArmor),
    ...runtimeModifierWarnings(safePrimary),
    ...(secondaryWeapon ? runtimeModifierWarnings(secondaryWeapon) : [])
  );

  return {
    catalog,
    primaryWeapon: safePrimary,
    secondaryWeapon,
    armorOption: safeArmor,
    consumable,
    armor,
    weapons: [safePrimary, secondaryWeapon].filter((weapon) => weapon && weapon.name).map((weapon) => weaponToRecord(weapon as StartingWeaponOption)),
    inventory: [
      ...STARTING_BASE_INVENTORY.map((name) => createInventoryItem({ name })),
      consumable ? inventoryOptionToRecord(consumable) : null,
      selectedClassItem ? createInventoryItem({ name: selectedClassItem }) : null
    ].filter(Boolean) as CharacterInventoryItem[],
    traits,
    evasionModifier,
    warnings
  };
}

export function armorToState(armor: StartingArmorOption): ArmorState {
  return {
    name: armor.name,
    sourceId: armor.source.sourceId ?? armor.source.id,
    sourceSlug: armor.slug,
    tier: armor.tier,
    baseMajor: armor.baseMajor,
    baseSevere: armor.baseSevere,
    score: clampArmorScore(armor.score),
    markedSlots: 0,
    feature: armor.feature ?? '',
    featureText: armor.feature ?? ''
  };
}

export function weaponToRecord(option: StartingWeaponOption): Weapon {
  return {
    id: `weapon-${option.slug}`,
    ...weaponToInput(option)
  };
}

export function equipmentItemToArmorOption(item: LibraryEquipmentItem): StartingArmorOption | null {
  if (!item.baseThresholds || item.armorScore === null || item.tier === null) return null;
  const modifiers = parseModifierText(item.featureText);
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    tier: item.tier,
    baseMajor: item.baseThresholds.major,
    baseSevere: item.baseThresholds.severe,
    score: item.armorScore,
    feature: item.featureText,
    evasionModifier: modifiers.evasionModifier,
    traitModifiers: modifiers.traitModifiers,
    source: item
  };
}

export function equipmentItemToWeaponOption(item: LibraryEquipmentItem): StartingWeaponOption | null {
  if (!item.trait || !item.burden || !item.damageFormula || item.tier === null) return null;
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    category: item.type === 'secondary-weapon' ? 'secondary' : 'primary',
    tier: item.tier,
    trait: item.trait,
    range: item.range,
    damageFormula: item.damageFormula,
    damageType: item.damageType,
    burden: item.burden,
    feature: item.featureText,
    magical: item.damageType === 'magic',
    source: item
  };
}

export function weaponToInput(option: StartingWeaponOption): Omit<Weapon, 'id'> {
  return {
    name: option.name,
    sourceId: option.source.sourceId ?? option.source.id,
    sourceSlug: option.slug,
    category: option.category,
    trait: option.trait,
    range: option.range,
    damageFormula: option.damageFormula,
    damageType: option.damageType,
    burden: option.burden,
    featureText: option.feature ?? '',
    notes: [option.feature, option.magical ? 'Магическое оружие' : ''].filter(Boolean).join('\n')
  };
}

export function equipmentItemToInventoryOption(item: LibraryEquipmentItem): StartingInventoryOption {
  return toInventoryOption(item);
}

export function buildEquipmentAttachmentPlan(item: LibraryEquipmentItem): EquipmentAttachmentPlan {
  if (item.type === 'armor') {
    const option = equipmentItemToArmorOption(item);
    if (option) {
      return {
        kind: 'armor',
        name: option.name,
        armor: armorToState(option),
        warnings: runtimeModifierWarnings(option)
      };
    }
  }

  if (item.type === 'primary-weapon' || item.type === 'secondary-weapon') {
    const option = equipmentItemToWeaponOption(item);
    if (option) {
      return {
        kind: 'weapon',
        name: option.name,
        weapon: weaponToInput(option),
        warnings: runtimeModifierWarnings(option)
      };
    }
  }

  return {
    kind: 'inventory',
    name: item.name,
    inventoryItem: inventoryOptionToRecord(equipmentItemToInventoryOption(item)),
    sheetCard: {
      kind: item.type === 'consumable' || item.type === 'item' ? 'item' : 'custom',
      name: item.name,
      subtitle: item.typeName,
      text: item.featureText,
      imageUrl: item.imageUrl,
      sourceId: item.sourceId ?? item.id
    },
    warnings: []
  };
}

function toInventoryOption(item: LibraryEquipmentItem): StartingInventoryOption {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    text: item.featureText,
    kind: item.type === 'consumable' ? 'consumable' : item.type === 'item' || item.type === 'combat-wheelchair' ? 'item' : 'custom',
    uses: item.uses,
    imageUrl: item.imageUrl,
    source: item
  };
}

export function inventoryOptionToRecord(option: StartingInventoryOption): CharacterInventoryItem {
  const uses = option.uses && option.uses > 0 ? { current: option.uses, max: option.uses } : undefined;
  return createInventoryItem({
    name: option.name,
    kind: option.kind,
    quantity: 1,
    uses,
    text: option.text,
    imageUrl: option.imageUrl ?? null,
    sourceId: option.source.sourceId ?? option.source.id,
    sourceSlug: option.slug
  });
}

const toArmorOption = equipmentItemToArmorOption;
const toWeaponOption = equipmentItemToWeaponOption;

function runtimeModifierWarnings(option: StartingArmorOption | StartingWeaponOption): string[] {
  if ('evasionModifier' in option && (option.evasionModifier || Object.keys(option.traitModifiers ?? {}).length > 0)) {
    return ['Численные модификаторы свойства не применены автоматически: проверьте характеристики и уклонение вручную.'];
  }
  if ('category' in option) {
    const modifiers = weaponEquipmentModifiers(option);
    if (modifiers.evasionModifier || modifiers.armorScoreModifier || Object.keys(modifiers.traitModifiers).length > 0) {
      return ['Численные модификаторы свойства не применены автоматически: проверьте броню, характеристики и уклонение вручную.'];
    }
  }
  return [];
}

function isSrdEquipment(item: LibraryEquipmentItem): boolean {
  const sources = item.raw.source_slugs;
  if (!Array.isArray(sources)) return true;
  return sources.some((source) => source === 'core' || source === 'srd');
}

function selectByIdOrSlug<T extends { id: string; slug: string }>(items: T[], id: string | undefined): T | null {
  return id ? items.find((item) => matchesIdOrSlug(item, id)) ?? null : null;
}

function matchesIdOrSlug(item: { id: string; slug: string }, id: string): boolean {
  return item.id === id || item.slug === id;
}

function parseModifierText(text: string): {
  evasionModifier?: number;
  armorScoreModifier: number;
  traitModifiers: Partial<Record<TraitId, number>>;
} {
  const normalized = text.replace(/−/g, '-').toLowerCase();
  return {
    evasionModifier: signedNumberForTerms(normalized, ['уклон', 'evasion']),
    armorScoreModifier: signedNumberForTerms(normalized, ['показател', 'брони', 'armor score']) ?? 0,
    traitModifiers: parseTraitModifiers(normalized)
  };
}

function parseTraitModifiers(text: string): Partial<Record<TraitId, number>> {
  const traits: Array<[TraitId, string[]]> = [
    ['agility', ['провор', 'agility']],
    ['strength', ['сил', 'strength']],
    ['finesse', ['искус', 'finesse']],
    ['instinct', ['инстинкт', 'instinct']],
    ['presence', ['влия', 'presence']],
    ['knowledge', ['знан', 'knowledge']]
  ];
  const result: Partial<Record<TraitId, number>> = {};
  for (const [trait, names] of traits) {
    if (!names.some((name) => text.includes(name))) continue;
    const value = signedNumberForTerms(text, names);
    if (value) result[trait] = value;
  }
  return result;
}

function weaponEquipmentModifiers(option: StartingWeaponOption | null | undefined): {
  armorScoreModifier: number;
  evasionModifier: number;
  traitModifiers: Partial<Record<TraitId, number>>;
} {
  if (!option) return { armorScoreModifier: 0, evasionModifier: 0, traitModifiers: {} };
  const modifiers = parseModifierText(option.feature ?? '');
  return {
    armorScoreModifier: modifiers.armorScoreModifier,
    evasionModifier: modifiers.evasionModifier ?? 0,
    traitModifiers: modifiers.traitModifiers
  };
}

function firstSignedNumber(text: string): number | undefined {
  const match = text.match(/[+-]\s*\d+/);
  return match ? Number(match[0].replace(/\s+/g, '')) : undefined;
}

function signedNumberForTerms(text: string, terms: string[]): number | undefined {
  for (const term of terms) {
    const index = text.indexOf(term);
    if (index < 0) continue;
    const before = text.slice(Math.max(0, index - 24), index);
    const after = text.slice(index, Math.min(text.length, index + 24));
    return firstSignedNumber(before) ?? firstSignedNumber(after);
  }
  return undefined;
}

function emptyArmorOption(): StartingArmorOption {
  return {
    id: 'missing-armor',
    slug: 'missing-armor',
    name: '',
    tier: 1,
    baseMajor: 6,
    baseSevere: 13,
    score: 3,
    source: {} as LibraryEquipmentItem
  };
}

function emptyWeaponOption(): StartingWeaponOption {
  return {
    id: 'missing-weapon',
    slug: 'missing-weapon',
    name: '',
    category: 'primary',
    tier: 1,
    trait: 'agility',
    range: 'Вплотную',
    damageFormula: '1d8',
    damageType: 'physical',
    burden: 'one-handed',
    source: {} as LibraryEquipmentItem
  };
}

function clampArmorScore(value: number): number {
  return Math.min(MAX_ARMOR_SCORE, Math.max(0, Math.trunc(value)));
}
