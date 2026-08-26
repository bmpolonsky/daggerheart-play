import type { ContentState, LibraryClassItem, LibraryEquipmentItem } from '../content/types';
import { CLASS_LABELS, DAGGERHEART_CLASSES, PLAYTEST_CLASSES } from '../rules/constants';
import type { DaggerheartClass } from '../rules/types';
import { buildStartingEquipmentCatalog, CLASS_STARTING_ITEMS } from '../rules/equipment';
import { characterBuilderRuleModifiersForSubclass, startingDomainCardCount } from '../rules/characterRuleModifiers';
import {
  classDefinitionFor,
  classDomainsFor,
  classFeatureListText,
  classStartingItemsFor,
  filterBuilderContent,
  isDomainCardForDomains,
  isSrdClassItem,
  isSubclassForClass
} from './index';

export interface CharacterBuilderCatalogInput {
  content: ContentState['generic'];
  classes: LibraryClassItem[];
  equipment: LibraryEquipmentItem[];
  className: DaggerheartClass;
  classId?: string;
  includePlaytest?: boolean;
}

export interface CharacterBuilderQuickStart {
  ancestryId: string;
  communityId: string;
  subclassId: string;
  selectedCardIds: string[];
  armorId: string;
  primaryWeaponId: string;
  secondaryWeaponId: string;
  classItem: string;
  consumableId: string;
}

export function buildCharacterBuilderCatalog(input: CharacterBuilderCatalogInput) {
  const builderContent = filterBuilderContent(input.content, input.includePlaytest);
  const classDefinition = classDefinitionFor(input.classes, input.className, input.includePlaytest, input.classId);
  const className = classDefinition?.className ?? input.className;
  const classDomains = (classDefinition?.domains ?? classDomainsFor(input.classes, className, input.includePlaytest)).filter((domain) => domain !== 'Custom');
  const classItems = classDefinition?.classItems.length ? classDefinition.classItems : classStartingItemsFor(input.classes, className, input.includePlaytest);
  const equipmentCatalog = buildStartingEquipmentCatalog(input.equipment, input.includePlaytest);
  const classSubclasses = builderContent.subclasses.filter((item) => isSubclassForClass(item, className, classDefinition));
  const availableDomainCards = builderContent.domainCards
    .filter((item) => isDomainCardForDomains(item, classDomains))
    .filter((item) => (item.level ?? Number(item.raw.level ?? 1)) === 1)
    .slice(0, 48);
  const subclassRuleModifiers = Object.fromEntries(classSubclasses.map((subclass) => [
    subclass.id,
    characterBuilderRuleModifiersForSubclass(subclass)
  ]));

  return {
    className,
    builderContent,
    classDefinition,
    classDomains,
    classItems,
    classOptions: buildClassOptions(input.classes, input.includePlaytest),
    classSubclasses,
    subclassRuleModifiers,
    availableDomainCards,
    equipmentCatalog
  };
}

export function buildCharacterBuilderQuickStart(
  catalog: ReturnType<typeof buildCharacterBuilderCatalog>,
  random: () => number = () => 0
): CharacterBuilderQuickStart {
  const subclassId = chooseRandom(catalog.classSubclasses, random)?.id ?? '';
  const requiredCards = startingDomainCardCount(catalog.subclassRuleModifiers[subclassId] ?? []);
  const primaryWeaponId = chooseRandom(catalog.equipmentCatalog.primaryWeapons, random)?.id ?? '';
  const primaryWeapon = catalog.equipmentCatalog.primaryWeapons.find((weapon) => weapon.id === primaryWeaponId);
  const classItems = catalog.classItems.length ? catalog.classItems : CLASS_STARTING_ITEMS[catalog.className]?.length ? CLASS_STARTING_ITEMS[catalog.className] : CLASS_STARTING_ITEMS.Custom;
  return {
    ancestryId: chooseRandom(catalog.builderContent.ancestries, random)?.id ?? '',
    communityId: chooseRandom(catalog.builderContent.communities, random)?.id ?? '',
    subclassId,
    selectedCardIds: randomDomainCardSelection(catalog.availableDomainCards, requiredCards, random),
    armorId: chooseRandom(catalog.equipmentCatalog.armor, random)?.id ?? '',
    primaryWeaponId,
    secondaryWeaponId: primaryWeapon?.burden === 'one-handed'
      ? chooseRandom(catalog.equipmentCatalog.secondaryWeapons, random)?.id ?? ''
      : '',
    classItem: chooseRandom(classItems, random) ?? '',
    consumableId: chooseRandom(catalog.equipmentCatalog.consumables, random)?.id ?? ''
  };
}

function randomDomainCardSelection(
  items: Array<{ id: string }>,
  required: number,
  random: () => number
): string[] {
  const selected: string[] = [];
  const remaining = [...items];
  while (selected.length < required && remaining.length > 0) {
    const index = randomIndex(remaining.length, random);
    const [next] = remaining.splice(index, 1);
    if (next) selected.push(next.id);
  }
  return selected;
}

function chooseRandom<T>(items: T[], random: () => number): T | undefined {
  return items[randomIndex(items.length, random)];
}

function randomIndex(length: number, random: () => number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

function buildClassOptions(classes: LibraryClassItem[], includePlaytest = false): Array<{ id: string; className: DaggerheartClass; name: string; domains: string[]; imageUrl: string | null; body: string; featureText: string }> {
  const availableClasses = classes.filter((item) => (
    (includePlaytest || isSrdClassItem(item))
  ));
  if (availableClasses.length > 0) {
    return availableClasses.map((item) => ({
      id: item.id,
      className: item.className,
      name: item.name,
      domains: item.domains,
      imageUrl: item.imageUrl,
      body: item.body,
      featureText: classFeatureListText(item)
    }));
  }
  return DAGGERHEART_CLASSES
    .filter((item) => item !== 'Custom' && (includePlaytest || !PLAYTEST_CLASSES.includes(item)))
    .map((item) => ({
      id: `class:${item.toLowerCase()}`,
      className: item,
      name: CLASS_LABELS[item],
      domains: [],
      imageUrl: null,
      body: '',
      featureText: ''
    }));
}
