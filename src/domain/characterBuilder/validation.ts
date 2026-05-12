import type { ContentState, LibraryClassItem, LibraryEquipmentItem } from '../content/types';
import { CLASS_STARTING_ITEMS } from '../rules/equipment';
import type { DaggerheartClass, TraitId } from '../rules/types';
import { buildCharacterBuilderCatalog } from './catalog';

export type CharacterBuilderIssueSeverity = 'blocking' | 'warning';

export type CharacterBuilderIssueId =
  | 'class.required'
  | 'class.invalid'
  | 'ancestry.required'
  | 'ancestry.invalid'
  | 'community.required'
  | 'community.invalid'
  | 'subclass.required'
  | 'subclass.invalid'
  | 'domainCards.required'
  | 'domainCards.invalid'
  | 'domainCards.unavailable'
  | 'experiences.required'
  | 'experiences.duplicate'
  | 'traits.distribution'
  | 'equipment.armor'
  | 'equipment.primaryWeapon'
  | 'equipment.secondaryWeapon'
  | 'equipment.classItem'
  | 'equipment.consumable';

export interface CharacterBuilderIssue {
  id: CharacterBuilderIssueId;
  severity: CharacterBuilderIssueSeverity;
  message: string;
}

export interface CharacterBuilderReadinessInput {
  content: ContentState['generic'];
  classes: LibraryClassItem[];
  equipment: LibraryEquipmentItem[];
  className?: DaggerheartClass;
  ancestryId?: string;
  communityId?: string;
  subclassId?: string;
  selectedCardIds?: string[];
  experienceNames?: string[];
  traits?: Partial<Record<TraitId, number>>;
  armorId?: string;
  primaryWeaponId?: string;
  secondaryWeaponId?: string;
  classItem?: string;
  consumableId?: string;
  includePlaytest?: boolean;
}

export interface CharacterBuilderReadiness {
  canCreate: boolean;
  issues: CharacterBuilderIssue[];
}

export function validateCharacterBuilderReadiness(input: CharacterBuilderReadinessInput): CharacterBuilderReadiness {
  const issues: CharacterBuilderIssue[] = [];
  const className = input.className;

  if (!className) {
    addIssue(issues, 'class.required', 'blocking', 'Выберите класс персонажа.');
    return { canCreate: false, issues };
  }

  const catalog = buildCharacterBuilderCatalog({
    content: input.content,
    classes: input.classes,
    equipment: input.equipment,
    className,
    includePlaytest: input.includePlaytest
  });

  if (!catalog.classOptions.some((option) => option.className === className)) {
    addIssue(issues, 'class.invalid', 'blocking', 'Выбранный класс недоступен для создания персонажа.');
  }

  validateLibrarySelection(issues, 'ancestry', input.ancestryId, catalog.builderContent.ancestries, 'родословную');
  validateLibrarySelection(issues, 'community', input.communityId, catalog.builderContent.communities, 'сообщество');
  validateLibrarySelection(issues, 'subclass', input.subclassId, catalog.classSubclasses, 'подкласс');
  validateDomainCards(issues, input.selectedCardIds ?? [], catalog.availableDomainCards);
  validateExperiences(issues, input.experienceNames ?? []);
  validateTraitDistribution(issues, input.traits);
  validateEquipment(issues, input, catalog);

  return {
    canCreate: !issues.some((issue) => issue.severity === 'blocking'),
    issues
  };
}

function validateTraitDistribution(issues: CharacterBuilderIssue[], traits: Partial<Record<TraitId, number>> | undefined): void {
  if (!traits) return;
  const values = (['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'] as TraitId[])
    .map((trait) => traits[trait])
    .filter((value): value is number => typeof value === 'number')
    .sort((left, right) => right - left);
  if (values.length !== 6 || values.join(',') !== '2,1,1,0,0,-1') {
    addIssue(issues, 'traits.distribution', 'blocking', 'Стартовые характеристики должны быть ровно +2, +1, +1, +0, +0, -1.');
  }
}

function validateLibrarySelection(
  issues: CharacterBuilderIssue[],
  kind: 'ancestry' | 'community' | 'subclass',
  selectedId: string | undefined,
  available: Array<{ id: string }>,
  label: string
): void {
  const cleanId = selectedId?.trim() ?? '';
  if (!cleanId) {
    addIssue(issues, `${kind}.required`, 'blocking', `Выберите ${label}.`);
    return;
  }
  if (!available.some((item) => item.id === cleanId)) {
    addIssue(issues, `${kind}.invalid`, 'blocking', `Выбранная ${label} недоступна для текущего персонажа.`);
  }
}

function validateDomainCards(issues: CharacterBuilderIssue[], selectedIds: string[], available: Array<{ id: string; name: string }>): void {
  const availableIds = new Set(available.map((card) => card.id));
  const uniqueSelected = Array.from(new Set(selectedIds.map((id) => id.trim()).filter(Boolean)));
  const validSelected = uniqueSelected.filter((id) => availableIds.has(id));
  const invalidSelected = uniqueSelected.filter((id) => !availableIds.has(id));

  if (available.length < 2) {
    addIssue(issues, 'domainCards.unavailable', 'blocking', 'Недостаточно стартовых карт домена для выбранного класса. Обновите справочники или выберите другой класс.');
    return;
  }

  if (validSelected.length !== 2) {
    addIssue(issues, 'domainCards.required', 'blocking', 'Выберите ровно две стартовые карты домена 1 уровня для выбранного класса.');
  }
  if (invalidSelected.length > 0) {
    addIssue(issues, 'domainCards.invalid', 'blocking', 'Одна или несколько выбранных карт домена недоступны для выбранного класса.');
  }
}

function validateExperiences(issues: CharacterBuilderIssue[], experienceNames: string[]): void {
  const names = experienceNames.map((name) => name.trim()).filter(Boolean);
  if (names.length !== 2) {
    addIssue(issues, 'experiences.required', 'blocking', 'Укажите ровно два опыта персонажа.');
    return;
  }
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    addIssue(issues, 'experiences.duplicate', 'warning', 'Опыты персонажа лучше сделать разными.');
  }
}

function validateEquipment(
  issues: CharacterBuilderIssue[],
  input: CharacterBuilderReadinessInput,
  catalog: ReturnType<typeof buildCharacterBuilderCatalog>
): void {
  const armorId = input.armorId?.trim() ?? '';
  const primaryWeaponId = input.primaryWeaponId?.trim() ?? '';
  const secondaryWeaponId = input.secondaryWeaponId?.trim() ?? '';
  const classItem = input.classItem?.trim() ?? '';
  const consumableId = input.consumableId?.trim() ?? '';
  const primaryWeapon = catalog.equipmentCatalog.primaryWeapons.find((weapon) => matchesOption(weapon, primaryWeaponId));
  const classItems = catalog.classItems.length ? catalog.classItems : CLASS_STARTING_ITEMS[input.className ?? 'Custom'] ?? CLASS_STARTING_ITEMS.Custom;

  if (!armorId || !catalog.equipmentCatalog.armor.some((armor) => matchesOption(armor, armorId))) {
    addIssue(issues, 'equipment.armor', 'blocking', 'Выберите стартовую броню.');
  }
  if (!primaryWeaponId || !primaryWeapon) {
    addIssue(issues, 'equipment.primaryWeapon', 'blocking', 'Выберите основное стартовое оружие.');
  }
  if (primaryWeapon?.burden === 'one-handed' && catalog.equipmentCatalog.secondaryWeapons.length > 0 && !catalog.equipmentCatalog.secondaryWeapons.some((weapon) => matchesOption(weapon, secondaryWeaponId))) {
    addIssue(issues, 'equipment.secondaryWeapon', 'blocking', 'Выберите дополнительное стартовое оружие или щит.');
  }
  if (classItems.length > 0 && (!classItem || !classItems.includes(classItem))) {
    addIssue(issues, 'equipment.classItem', 'blocking', 'Выберите стартовый предмет класса.');
  }
  if (catalog.equipmentCatalog.consumables.length > 0 && (!consumableId || !catalog.equipmentCatalog.consumables.some((item) => matchesOption(item, consumableId)))) {
    addIssue(issues, 'equipment.consumable', 'blocking', 'Выберите стартовый расходуемый предмет.');
  }
}

function matchesOption(option: { id: string; slug: string }, value: string): boolean {
  return option.id === value || option.slug === value;
}

function addIssue(
  issues: CharacterBuilderIssue[],
  id: CharacterBuilderIssueId,
  severity: CharacterBuilderIssueSeverity,
  message: string
): void {
  issues.push({ id, severity, message });
}
