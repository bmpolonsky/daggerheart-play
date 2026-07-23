import { buildEffectiveCharacterStats } from './effects';
import type { Adversary, AdversaryFeature, Character, CharacterInventoryItem, CharacterSheetCard, DomainCardRecord, SubclassFeatureTier, TraitId, Weapon } from './types';

export type CharacterSidecarTab = 'overview' | 'features' | 'actions' | 'gear' | 'cards';

export interface CharacterSidecarModel {
  overviewResources: CharacterSidecarResource[];
  traits: CharacterSidecarTrait[];
  actions: CharacterSidecarActions;
  weapons: Weapon[];
  gear: CharacterSidecarGear;
  inventory: CharacterInventoryItem[];
  features: CharacterSheetCard[];
  loadoutCards: DomainCardRecord[];
  archivedCards: DomainCardRecord[];
  experiences: Character['experiences'];
  hasActions: boolean;
  hasGear: boolean;
  hasFeatures: boolean;
  hasCards: boolean;
}

export interface CharacterSidecarResource {
  id: 'hope' | 'hp' | 'stress' | 'armor' | 'evasion' | 'majorThreshold' | 'severeThreshold' | 'actionTokens';
  value: number;
  max?: number;
  marked?: number;
}

export interface CharacterSidecarTrait {
  id: TraitId;
  value: number;
}

export interface CharacterSidecarActions {
  weapons: Weapon[];
}

export interface CharacterSidecarGear {
  armor: Character['armor'];
  inventory: CharacterInventoryItem[];
}

export interface AdversarySidecarModel {
  features: AdversaryFeature[];
  hasFeatures: boolean;
}

const TRAIT_ORDER: TraitId[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

export function buildCharacterSidecarModel(character: Character): CharacterSidecarModel {
  const features = [...(character.sheetCards ?? [])].filter(isCharacterFeatureSheetCard).sort(sortSheetCards);
  const loadoutCards = character.domainCards.filter((card) => card.inLoadout).sort(sortDomainCards);
  const archivedCards = character.domainCards.filter((card) => !card.inLoadout).sort(sortDomainCards);
  const weapons = [...character.weapons];
  const inventory = [...character.inventory];
  const experiences = [...character.experiences].sort((left, right) => right.modifier - left.modifier || left.name.localeCompare(right.name, 'ru'));
  const effective = buildEffectiveCharacterStats(character);
  return {
    overviewResources: buildOverviewResources(character),
    traits: TRAIT_ORDER.map((trait) => ({ id: trait, value: effective.traits[trait] })),
    actions: {
      weapons
    },
    weapons,
    gear: {
      armor: { ...character.armor },
      inventory
    },
    inventory,
    features,
    loadoutCards,
    archivedCards,
    experiences,
    hasActions: weapons.length > 0,
    hasGear: inventory.length > 0 || hasArmor(character.armor),
    hasFeatures: features.length > 0,
    hasCards: loadoutCards.length > 0 || archivedCards.length > 0
  };
}

export function buildAdversarySidecarModel(adversary: Adversary): AdversarySidecarModel {
  const features = [...adversary.features].sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  return {
    features,
    hasFeatures: features.length > 0
  };
}

export function isCharacterFeatureSheetCard(card: CharacterSheetCard): boolean {
  return ['classFeature', 'ancestryFeature', 'communityFeature', 'subclassFeature', 'custom'].includes(card.kind);
}

export function subclassFeatureTierLabel(value: SubclassFeatureTier | string | undefined): string {
  const subtitle = value?.trim() ?? '';
  const labels: Record<string, string> = {
    foundation: 'Основа',
    specialization: 'Специализация',
    mastery: 'Мастерство'
  };
  return labels[subtitle.toLowerCase()] ?? subtitle;
}

export function sheetCardKindLabel(kind: CharacterSheetCard['kind']): string {
  switch (kind) {
    case 'classFeature':
      return 'Класс';
    case 'ancestry':
    case 'ancestryFeature':
      return 'Родословная';
    case 'community':
    case 'communityFeature':
      return 'Сообщество';
    case 'subclass':
    case 'subclassFeature':
      return 'Подкласс';
    case 'domainCard':
      return 'Домен';
    case 'weapon':
      return 'Оружие';
    case 'item':
      return 'Предмет';
    case 'note':
      return 'Заметка';
    case 'custom':
    default:
      return 'Особенность';
  }
}

export function characterSheetCardSourceLabel(
  card: Pick<CharacterSheetCard, 'kind' | 'subtitle' | 'subclassTier'>
): string {
  const source = sheetCardKindLabel(card.kind);
  const tier = card.subclassTier
    ? subclassFeatureTierLabel(card.subclassTier)
    : card.kind === 'subclassFeature'
      ? subclassFeatureTierLabel(card.subtitle)
      : '';
  return [source, tier].filter(Boolean).join(' — ');
}

function buildOverviewResources(character: Character): CharacterSidecarResource[] {
  const effective = buildEffectiveCharacterStats(character);
  return [
    { id: 'hope', value: effective.hope.value, max: effective.hope.max },
    { id: 'hp', value: effective.hp.max - effective.hp.marked, marked: effective.hp.marked, max: effective.hp.max },
    { id: 'stress', value: effective.stress.max - effective.stress.marked, marked: effective.stress.marked, max: effective.stress.max },
    { id: 'armor', value: Math.max(0, effective.armorScore - character.armor.markedSlots), marked: Math.min(character.armor.markedSlots, effective.armorScore), max: effective.armorScore },
    { id: 'evasion', value: effective.evasion },
    { id: 'majorThreshold', value: effective.thresholds.major },
    { id: 'severeThreshold', value: effective.thresholds.severe },
    { id: 'actionTokens', value: character.actionTokens }
  ];
}

function hasArmor(armor: Character['armor']): boolean {
  return Boolean(armor.name.trim()) || armor.score > 0 || armor.baseMajor > 0 || armor.baseSevere > 0 || Boolean(armor.feature?.trim());
}

function sortSheetCards(left: CharacterSheetCard, right: CharacterSheetCard): number {
  const leftRank = sheetCardRank(left.kind);
  const rightRank = sheetCardRank(right.kind);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.name.localeCompare(right.name, 'ru');
}

function sheetCardRank(kind: CharacterSheetCard['kind']): number {
  switch (kind) {
    case 'classFeature':
      return 1;
    case 'subclass':
    case 'subclassFeature':
      return 2;
    case 'ancestry':
    case 'ancestryFeature':
      return 3;
    case 'community':
    case 'communityFeature':
      return 4;
    case 'domainCard':
      return 5;
    case 'weapon':
      return 6;
    case 'item':
      return 7;
    default:
      return 8;
  }
}

function sortDomainCards(left: DomainCardRecord, right: DomainCardRecord): number {
  if (left.level !== right.level) return left.level - right.level;
  if (left.domain !== right.domain) return left.domain.localeCompare(right.domain, 'ru');
  return left.name.localeCompare(right.name, 'ru');
}
