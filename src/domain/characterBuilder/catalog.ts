import type { ContentState, LibraryClassItem, LibraryEquipmentItem } from '../content/types';
import { CLASS_LABELS, DAGGERHEART_CLASSES } from '../rules/constants';
import type { DaggerheartClass } from '../rules/types';
import { buildStartingEquipmentCatalog, CLASS_STARTING_ITEMS } from '../rules/equipment';
import { characterBuilderRuleModifiersForSubclass, startingDomainCardCount } from '../rules/characterRuleModifiers';
import {
  classDefinitionFor,
  classDomainsFor,
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
  const classDefinition = classDefinitionFor(input.classes, input.className, input.includePlaytest);
  const classDomains = classDomainsFor(input.classes, input.className, input.includePlaytest).filter((domain) => domain !== 'Custom');
  const classItems = classStartingItemsFor(input.classes, input.className, input.includePlaytest);
  const equipmentCatalog = buildStartingEquipmentCatalog(input.equipment, input.includePlaytest);
  const classSubclasses = builderContent.subclasses.filter((item) => isSubclassForClass(item, input.className));
  const availableDomainCards = builderContent.domainCards
    .filter((item) => isDomainCardForDomains(item, classDomains))
    .filter((item) => (item.level ?? Number(item.raw.level ?? 1)) === 1)
    .slice(0, 48);
  const subclassRuleModifiers = Object.fromEntries(classSubclasses.map((subclass) => [
    subclass.id,
    characterBuilderRuleModifiersForSubclass(subclass)
  ]));

  return {
    className: input.className,
    builderContent,
    classDefinition,
    classDomains,
    classItems,
    classOptions: buildClassOptions(input.classes),
    classSubclasses,
    subclassRuleModifiers,
    availableDomainCards,
    equipmentCatalog
  };
}

export function buildCharacterBuilderQuickStart(catalog: ReturnType<typeof buildCharacterBuilderCatalog>): CharacterBuilderQuickStart {
  const subclassId = catalog.classSubclasses[0]?.id ?? '';
  const requiredCards = startingDomainCardCount(catalog.subclassRuleModifiers[subclassId] ?? []);
  return {
    ancestryId: catalog.builderContent.ancestries[0]?.id ?? '',
    communityId: catalog.builderContent.communities[0]?.id ?? '',
    subclassId,
    selectedCardIds: catalog.availableDomainCards.slice(0, requiredCards).map((card) => card.id),
    armorId: catalog.equipmentCatalog.armor[0]?.id ?? '',
    primaryWeaponId: catalog.equipmentCatalog.primaryWeapons[0]?.id ?? '',
    secondaryWeaponId: catalog.equipmentCatalog.secondaryWeapons[0]?.id ?? '',
    classItem: catalog.classItems[0] ?? CLASS_STARTING_ITEMS[catalog.className]?.[0] ?? CLASS_STARTING_ITEMS.Custom[0] ?? '',
    consumableId: catalog.equipmentCatalog.consumables[0]?.id ?? ''
  };
}

function buildClassOptions(classes: LibraryClassItem[]): Array<{ className: DaggerheartClass; name: string; domains: string[]; imageUrl: string | null; body: string }> {
  const coreClasses = classes.filter((item) => item.className !== 'Custom' && isSrdClassItem(item));
  if (coreClasses.length > 0) {
    return coreClasses.map((item) => ({
      className: item.className,
      name: item.name,
      domains: item.domains,
      imageUrl: item.imageUrl,
      body: item.body
    }));
  }
  return DAGGERHEART_CLASSES
    .filter((item) => item !== 'Custom')
    .map((item) => ({
      className: item,
      name: CLASS_LABELS[item],
      domains: [],
      imageUrl: null,
      body: ''
    }));
}
