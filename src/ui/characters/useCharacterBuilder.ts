import { useState } from 'preact/hooks';
import type { ContentState, LibraryClassItem, LibraryEquipmentItem } from '../../domain/content/types';
import {
  backgroundQuestionsFor,
  buildCharacterDraft,
  connectionQuestionsFor,
  replaceBackgroundAnswerAt,
  replaceConnectionAnswerAt
} from '../../domain/characterBuilder';
import { buildCharacterBuilderCatalog, buildCharacterBuilderQuickStart } from '../../domain/characterBuilder/catalog';
import { BUILDER_STEPS, nextBuilderStep, previousBuilderStep, type BuilderStep } from '../../domain/characterBuilder/flow';
import { validateCharacterBuilderReadiness } from '../../domain/characterBuilder/validation';
import { CLASS_RECOMMENDED_TRAITS, DEFAULT_TRAITS } from '../../domain/rules/constants';
import { CLASS_STARTING_ITEMS } from '../../domain/rules/equipment';
import type { DaggerheartClass, TraitId } from '../../domain/rules/types';
import { isCompleteStartingTraitDistribution, type TraitDraft } from './traitDistribution';

export function useCharacterBuilder({ content, classes, equipment }: { content: ContentState['generic']; classes: LibraryClassItem[]; equipment: LibraryEquipmentItem[] }) {
  const [step, setStep] = useState<BuilderStep>('class');
  const [name, setName] = useState('Новый герой');
  const [className, setClassName] = useState<DaggerheartClass>('Bard');
  const [ancestryId, setAncestryId] = useState('');
  const [communityId, setCommunityId] = useState('');
  const [subclassId, setSubclassId] = useState('');
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [portraitUrl, setPortraitUrl] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [appearance, setAppearance] = useState('');
  const [demeanor, setDemeanor] = useState('');
  const [backstory, setBackstory] = useState('');
  const [backgroundAnswers, setBackgroundAnswers] = useState<string[]>([]);
  const [connectionAnswers, setConnectionAnswers] = useState<Array<{ answer?: string; targetName?: string }>>([]);
  const [experienceOne, setExperienceOne] = useState('Искатель приключений');
  const [experienceTwo, setExperienceTwo] = useState('Верный товарищ');
  const [traits, setTraits] = useState<TraitDraft>({ ...CLASS_RECOMMENDED_TRAITS.Bard });
  const [armorId, setArmorId] = useState('');
  const [primaryWeaponId, setPrimaryWeaponId] = useState('');
  const [secondaryWeaponId, setSecondaryWeaponId] = useState('');
  const [classItem, setClassItem] = useState('');
  const [consumableId, setConsumableId] = useState('');

  const catalog = buildCharacterBuilderCatalog({ content, classes, equipment, className });
  const { builderContent, classDefinition, classDomains, classItems, equipmentCatalog } = catalog;
  const backgroundQuestions = backgroundQuestionsFor(classDefinition);
  const connectionQuestions = connectionQuestionsFor(classDefinition);
  const effectiveClassItems = classItems.length ? classItems : CLASS_STARTING_ITEMS[className] ?? CLASS_STARTING_ITEMS.Custom;
  const effectiveArmorId = armorId || equipmentCatalog.armor[0]?.id || '';
  const effectivePrimaryWeaponId = primaryWeaponId || equipmentCatalog.primaryWeapons[0]?.id || '';
  const effectivePrimary = equipmentCatalog.primaryWeapons.find((weapon) => weapon.id === effectivePrimaryWeaponId || weapon.slug === effectivePrimaryWeaponId) ?? equipmentCatalog.primaryWeapons[0];
  const effectiveSecondaryWeaponId = secondaryWeaponId || equipmentCatalog.secondaryWeapons[0]?.id || '';
  const effectiveConsumableId = consumableId || equipmentCatalog.consumables[0]?.id || '';
  const effectiveClassItem = classItem || effectiveClassItems[0] || '';
  const recommendedTraits = CLASS_RECOMMENDED_TRAITS[className] ?? DEFAULT_TRAITS;
  const draftTraits = isCompleteStartingTraitDistribution(traits) ? traits : recommendedTraits;
  const result = buildCharacterDraft({
    content: builderContent,
    classes,
    equipment,
    name,
    className,
    ancestryId,
    communityId,
    subclassId,
    selectedCardIds,
    portraitUrl,
    pronouns,
    appearance,
    demeanor,
    backstory,
    backgroundAnswers,
    connectionAnswers,
    experienceNames: [experienceOne, experienceTwo],
    traits: draftTraits,
    armorId: effectiveArmorId,
    primaryWeaponId: effectivePrimaryWeaponId,
    secondaryWeaponId: effectiveSecondaryWeaponId,
    classItem: effectiveClassItem,
    consumableId: effectiveConsumableId
  });
  const readiness = validateCharacterBuilderReadiness({
    content,
    classes,
    equipment,
    className,
    ancestryId,
    communityId,
    subclassId,
    selectedCardIds,
    experienceNames: [experienceOne, experienceTwo],
    traits,
    armorId: effectiveArmorId,
    primaryWeaponId: effectivePrimaryWeaponId,
    secondaryWeaponId: effectiveSecondaryWeaponId,
    classItem: effectiveClassItem,
    consumableId: effectiveConsumableId
  });

  const selectClass = (next: DaggerheartClass) => {
    setClassName(next);
    setSubclassId('');
    setSelectedCardIds([]);
    setClassItem('');
    setTraits({ ...(CLASS_RECOMMENDED_TRAITS[next] ?? DEFAULT_TRAITS) });
  };

  const toggleCard = (cardId: string) => {
    setSelectedCardIds((current) => {
      if (current.includes(cardId)) return current.filter((id) => id !== cardId);
      if (current.length >= 2) return [current[1], cardId].filter(Boolean);
      return [...current, cardId];
    });
  };

  const setTrait = (trait: TraitId, value: number | null) => {
    setTraits((current) => {
      const next = { ...current };
      if (value === null) {
        delete next[trait];
      } else {
        next[trait] = value;
      }
      return next;
    });
  };

  const quickStart = () => {
    const quick = buildCharacterBuilderQuickStart(catalog);
    setAncestryId(quick.ancestryId);
    setCommunityId(quick.communityId);
    setSubclassId(quick.subclassId);
    setSelectedCardIds(quick.selectedCardIds);
    setArmorId(quick.armorId);
    setPrimaryWeaponId(quick.primaryWeaponId);
    setSecondaryWeaponId(quick.secondaryWeaponId);
    setClassItem(quick.classItem);
    setConsumableId(quick.consumableId);
  };

  return {
    step,
    steps: BUILDER_STEPS,
    fields: {
      name,
      className,
      ancestryId,
      communityId,
      subclassId,
      selectedCardIds,
      portraitUrl,
      pronouns,
      appearance,
      demeanor,
      backstory,
      backgroundAnswers,
      connectionAnswers,
      experienceOne,
      experienceTwo,
      traits,
      armorId: effectiveArmorId,
      primaryWeaponId: effectivePrimaryWeaponId,
      secondaryWeaponId: effectiveSecondaryWeaponId,
      classItem: effectiveClassItem,
      consumableId: effectiveConsumableId
    },
    options: {
      builderContent,
      classDomains,
      classItems: effectiveClassItems,
      classDefinition,
      backgroundQuestions,
      connectionQuestions,
      classOptions: catalog.classOptions,
      classSubclasses: catalog.classSubclasses,
      availableDomainCards: catalog.availableDomainCards,
      armor: equipmentCatalog.armor,
      primaryWeapons: equipmentCatalog.primaryWeapons,
      secondaryWeapons: equipmentCatalog.secondaryWeapons,
      consumables: equipmentCatalog.consumables,
      showSecondaryWeapon: effectivePrimary?.burden !== 'two-handed'
    },
    result,
    selections: result.selections,
    canCreate: readiness.canCreate,
    issues: readiness.issues,
    readiness,
    handlers: {
      goToStep: setStep,
      goNext: () => setStep(nextBuilderStep(step)),
      goBack: () => setStep(previousBuilderStep(step)),
      selectClass,
      selectAncestry: setAncestryId,
      selectCommunity: setCommunityId,
      selectSubclass: setSubclassId,
      toggleCard,
      setName,
      setPortraitUrl,
      setPronouns,
      setAppearance,
      setDemeanor,
      setBackstory,
      setBackgroundAnswer: (index: number, answer: string) => setBackgroundAnswers((current) => replaceBackgroundAnswerAt(current, index, answer, backgroundQuestions)),
      setConnectionAnswer: (index: number, answer: string) => setConnectionAnswers((current) => replaceConnectionAnswerAt(current, index, { answer }, connectionQuestions)),
      setConnectionTarget: (index: number, targetName: string) => setConnectionAnswers((current) => replaceConnectionAnswerAt(current, index, { targetName }, connectionQuestions)),
      setExperienceOne,
      setExperienceTwo,
      setTrait,
      quickStart,
      selectArmor: setArmorId,
      selectPrimaryWeapon: setPrimaryWeaponId,
      selectSecondaryWeapon: setSecondaryWeaponId,
      selectClassItem: setClassItem,
      selectConsumable: setConsumableId
    }
  };
}
