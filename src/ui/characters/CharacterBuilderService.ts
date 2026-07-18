import { Store } from '../../core/store/Store';
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
import { startingDomainCardCount } from '../../domain/rules/characterRuleModifiers';
import type { DaggerheartClass, TraitId } from '../../domain/rules/types';
import { isCompleteStartingTraitDistribution, type TraitDraft } from './traitDistribution';

interface CharacterBuilderConnectionAnswer {
  answer?: string;
  targetName?: string;
}

interface CharacterBuilderDraftState {
  step: BuilderStep;
  name: string;
  className: DaggerheartClass;
  ancestryId: string;
  communityId: string;
  subclassId: string;
  selectedCardIds: string[];
  portraitUrl: string;
  pronouns: string;
  appearance: string;
  demeanor: string;
  backstory: string;
  backgroundAnswers: string[];
  connectionAnswers: CharacterBuilderConnectionAnswer[];
  experienceOne: string;
  experienceTwo: string;
  traits: TraitDraft;
  armorId: string;
  primaryWeaponId: string;
  secondaryWeaponId: string;
  classItem: string;
  consumableId: string;
}

interface CharacterBuilderModelInput {
  content: ContentState['generic'];
  classes: LibraryClassItem[];
  equipment: LibraryEquipmentItem[];
  draft: CharacterBuilderDraftState;
}

export class CharacterBuilderService {
  private draftStore = new Store<CharacterBuilderDraftState>(createDefaultCharacterBuilderDraft());
  readonly draft$ = this.draftStore.toStream();

  buildModel({ content, classes, equipment, draft }: CharacterBuilderModelInput) {
    const {
      step,
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
      armorId,
      primaryWeaponId,
      secondaryWeaponId,
      classItem,
      consumableId
    } = draft;
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
    const requiredDomainCardCount = startingDomainCardCount(catalog.subclassRuleModifiers[subclassId] ?? []);
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
        requiredDomainCardCount,
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
        goToStep: (nextStep: BuilderStep) => this.setStep(nextStep),
        goNext: () => this.setStep(nextBuilderStep(step)),
        goBack: () => this.setStep(previousBuilderStep(step)),
        selectClass: (next: DaggerheartClass) => this.selectClass(next),
        selectAncestry: (next: string) => this.updateDraft({ ancestryId: next }),
        selectCommunity: (next: string) => this.updateDraft({ communityId: next }),
        selectSubclass: (next: string) => this.updateDraft({ subclassId: next }),
        toggleCard: (cardId: string) => this.toggleCard(cardId, requiredDomainCardCount),
        setName: (next: string) => this.updateDraft({ name: next }),
        setPortraitUrl: (next: string) => this.updateDraft({ portraitUrl: next }),
        setPronouns: (next: string) => this.updateDraft({ pronouns: next }),
        setAppearance: (next: string) => this.updateDraft({ appearance: next }),
        setDemeanor: (next: string) => this.updateDraft({ demeanor: next }),
        setBackstory: (next: string) => this.updateDraft({ backstory: next }),
        setBackgroundAnswer: (index: number, answer: string) => this.setBackgroundAnswer(index, answer, backgroundQuestions),
        setConnectionAnswer: (index: number, answer: string) => this.setConnectionAnswer(index, answer, connectionQuestions),
        setConnectionTarget: (index: number, targetName: string) => this.setConnectionTarget(index, targetName, connectionQuestions),
        setExperienceOne: (next: string) => this.updateDraft({ experienceOne: next }),
        setExperienceTwo: (next: string) => this.updateDraft({ experienceTwo: next }),
        setTrait: (trait: TraitId, value: number | null) => this.setTrait(trait, value),
        quickStart: () => this.quickStart(catalog, content, classes, equipment),
        selectArmor: (next: string) => this.updateDraft({ armorId: next }),
        selectPrimaryWeapon: (next: string) => this.updateDraft({ primaryWeaponId: next }),
        selectSecondaryWeapon: (next: string) => this.updateDraft({ secondaryWeaponId: next }),
        selectClassItem: (next: string) => this.updateDraft({ classItem: next }),
        selectConsumable: (next: string) => this.updateDraft({ consumableId: next })
      }
    };
  }

  reset(): void {
    this.draftStore.reset(createDefaultCharacterBuilderDraft());
  }

  private setStep(step: BuilderStep): void {
    this.updateDraft({ step });
  }

  private selectClass(className: DaggerheartClass): void {
    this.updateDraft({
      className,
      subclassId: '',
      selectedCardIds: [],
      classItem: '',
      traits: { ...(CLASS_RECOMMENDED_TRAITS[className] ?? DEFAULT_TRAITS) }
    });
  }

  private toggleCard(cardId: string, limit: number): void {
    this.draftStore.update((current) => {
      const selectedCardIds = current.selectedCardIds.includes(cardId)
        ? current.selectedCardIds.filter((id) => id !== cardId)
        : current.selectedCardIds.length >= limit
          ? [...current.selectedCardIds.slice(1), cardId].filter(Boolean)
          : [...current.selectedCardIds, cardId];
      return {
        ...current,
        selectedCardIds
      };
    });
  }

  private setTrait(trait: TraitId, value: number | null): void {
    this.draftStore.update((current) => {
      const traits = { ...current.traits };
      if (value === null) {
        delete traits[trait];
      } else {
        traits[trait] = value;
      }
      return {
        ...current,
        traits
      };
    });
  }

  private quickStart(
    catalog: ReturnType<typeof buildCharacterBuilderCatalog>,
    content: ContentState['generic'],
    classes: LibraryClassItem[],
    equipment: LibraryEquipmentItem[]
  ): void {
    this.draftStore.update((current) => {
      const className = catalog.classOptions[Math.floor(Math.random() * catalog.classOptions.length)]?.className ?? current.className;
      const randomCatalog = buildCharacterBuilderCatalog({ content, classes, equipment, className });
      const quick = buildCharacterBuilderQuickStart(randomCatalog, Math.random);
      return {
        ...current,
        className,
        traits: { ...(CLASS_RECOMMENDED_TRAITS[className] ?? DEFAULT_TRAITS) },
        ancestryId: quick.ancestryId,
        communityId: quick.communityId,
        subclassId: quick.subclassId,
        selectedCardIds: quick.selectedCardIds,
        armorId: quick.armorId,
        primaryWeaponId: quick.primaryWeaponId,
        secondaryWeaponId: quick.secondaryWeaponId,
        classItem: quick.classItem,
        consumableId: quick.consumableId
      };
    });
  }

  private setBackgroundAnswer(index: number, answer: string, questions: string[]): void {
    this.draftStore.update((current) => ({
      ...current,
      backgroundAnswers: replaceBackgroundAnswerAt(current.backgroundAnswers, index, answer, questions)
    }));
  }

  private setConnectionAnswer(index: number, answer: string, questions: string[]): void {
    this.draftStore.update((current) => ({
      ...current,
      connectionAnswers: replaceConnectionAnswerAt(current.connectionAnswers, index, { answer }, questions)
    }));
  }

  private setConnectionTarget(index: number, targetName: string, questions: string[]): void {
    this.draftStore.update((current) => ({
      ...current,
      connectionAnswers: replaceConnectionAnswerAt(current.connectionAnswers, index, { targetName }, questions)
    }));
  }

  private updateDraft(patch: Partial<CharacterBuilderDraftState>): void {
    this.draftStore.update((current) => ({
      ...current,
      ...patch
    }));
  }
}

function createDefaultCharacterBuilderDraft(): CharacterBuilderDraftState {
  return {
    step: 'class',
    name: 'Новый герой',
    className: 'Bard',
    ancestryId: '',
    communityId: '',
    subclassId: '',
    selectedCardIds: [],
    portraitUrl: '',
    pronouns: '',
    appearance: '',
    demeanor: '',
    backstory: '',
    backgroundAnswers: [],
    connectionAnswers: [],
    experienceOne: 'Искатель приключений',
    experienceTwo: 'Верный товарищ',
    traits: { ...CLASS_RECOMMENDED_TRAITS.Bard },
    armorId: '',
    primaryWeaponId: '',
    secondaryWeaponId: '',
    classItem: '',
    consumableId: ''
  };
}
