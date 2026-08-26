import type { ContentState, GenericLibraryItem, LibraryClassItem, LibraryEquipmentItem, RawAdversaryFeature } from '../content/types';
import { cleanMarkdownText } from '../../core/utils/markdownText';
import { CLASS_DOMAINS, CLASS_LABELS, CLASS_STARTING_STATS, DEFAULT_TRAITS, DOMAIN_LABELS, TRAIT_LABELS } from '../rules/constants';
import {
  buildStartingEquipmentLoadout,
  type StartingArmorOption,
  type StartingInventoryOption,
  type StartingWeaponOption
} from '../rules/equipment';
import { parseDomainCardCost } from '../rules/domainCards';
import { analyzeFeatureRules, automaticFeatureRuleEffects } from '../rules/featureEffects';
import { createInventoryItem } from '../rules/factories';
import {
  characterBuilderRuleModifiersForSubclass,
  startingDomainCardCount
} from '../rules/characterRuleModifiers';
import type {
  Character,
  CharacterConnection,
  CharacterDescription,
  CharacterQuestionAnswer,
  CharacterSheetCard,
  DaggerheartClass,
  DomainCardRecord,
  DomainName,
  Experience,
  TraitId
} from '../rules/types';
import type { BuilderStep } from './flow';

export interface CharacterBuilderInput {
  content: ContentState['generic'];
  classes?: LibraryClassItem[];
  equipment?: LibraryEquipmentItem[];
  name?: string;
  playerName?: string;
  className?: DaggerheartClass;
  classId?: string;
  ancestryId?: string;
  communityId?: string;
  subclassId?: string;
  selectedCardIds?: string[];
  requiredDomainCardCount?: number;
  portraitUrl?: string;
  experienceNames?: string[];
  pronouns?: string;
  appearance?: string;
  demeanor?: string;
  backstory?: string;
  backgroundAnswers?: string[];
  connectionAnswers?: CharacterConnectionInput[];
  traits?: Partial<Record<TraitId, number>>;
  primaryWeaponId?: string;
  secondaryWeaponId?: string;
  armorId?: string;
  classItem?: string;
  consumableId?: string;
  includePlaytest?: boolean;
  now?: () => number;
}

export interface CharacterConnectionInput {
  answer?: string;
  targetName?: string;
}

export interface CharacterDraftResult {
  draft: Partial<Character> & { className: DaggerheartClass };
  selections: {
    ancestry: GenericLibraryItem | null;
    community: GenericLibraryItem | null;
    subclass: GenericLibraryItem | null;
    domainCards: GenericLibraryItem[];
    primaryWeapon: StartingWeaponOption;
    secondaryWeapon: StartingWeaponOption | null;
    armor: StartingArmorOption;
  };
  warnings: string[];
}

type RawFeature = RawAdversaryFeature;
type RawQuestion = string | { prompt?: unknown; question?: unknown; text?: unknown; title?: unknown };

const DOMAIN_ALIASES: Record<string, DomainName> = {
  arcana: 'Arcana',
  аркана: 'Arcana',
  blade: 'Blade',
  клинок: 'Blade',
  bone: 'Bone',
  кость: 'Bone',
  codex: 'Codex',
  кодекс: 'Codex',
  dread: 'Dread',
  ужас: 'Dread',
  grace: 'Grace',
  грация: 'Grace',
  midnight: 'Midnight',
  полночь: 'Midnight',
  sage: 'Sage',
  мудрость: 'Sage',
  splendor: 'Splendor',
  величие: 'Splendor',
  valor: 'Valor',
  доблесть: 'Valor',
  custom: 'Custom',
  'свой домен': 'Custom'
};

export function coerceDomainName(input: unknown): DomainName | null {
  const value = String(input ?? '').trim().toLowerCase().replace(/^playtest-/, '');
  return DOMAIN_ALIASES[value] ?? null;
}

export function isSubclassForClass(item: GenericLibraryItem, className: DaggerheartClass, selectedClass?: Pick<LibraryClassItem, 'slug' | 'name'> | null): boolean {
  const classSlug = String(item.raw.class_slug ?? item.raw.class_name ?? '').trim().toLowerCase().replace(/^playtest-/, '');
  const classLabel = CLASS_LABELS[className].toLowerCase();
  return classSlug === selectedClass?.slug.toLowerCase().replace(/^playtest-/, '') ||
    classSlug === selectedClass?.name.toLowerCase() ||
    classSlug === className.toLowerCase() ||
    classSlug === classLabel;
}

export function isDomainCardForDomains(item: GenericLibraryItem, domains: DomainName[]): boolean {
  const domain = coerceDomainName(item.raw.domain_slug ?? item.raw.domain_name);
  return Boolean(domain && domains.includes(domain));
}

export function isSrdLibraryItem(item: GenericLibraryItem): boolean {
  const sources = item.raw.source_slugs;
  if (!Array.isArray(sources)) return true;
  return sources.some((source) => source === 'core' || source === 'srd' || source === 'custom');
}

export function isSrdClassItem(item: LibraryClassItem): boolean {
  const sources = item.raw.source_slugs;
  if (!Array.isArray(sources)) return true;
  return sources.some((source) => source === 'core' || source === 'srd' || source === 'custom');
}

export function classDefinitionFor(classes: LibraryClassItem[] | undefined, className: DaggerheartClass, includePlaytest = false, classId?: string): LibraryClassItem | null {
  const available = includePlaytest ? classes ?? [] : (classes ?? []).filter(isSrdClassItem);
  if (classId) {
    const selected = available.find((item) => item.id === classId);
    if (selected) return selected;
  }
  return available.find((item) => item.className === className) ?? null;
}

export function classDefinitionForCharacter(
  classes: LibraryClassItem[] | undefined,
  character: Pick<Character, 'className' | 'classSourceId' | 'classSlug'>,
  includePlaytest = false
): LibraryClassItem | null {
  const available = includePlaytest ? classes ?? [] : (classes ?? []).filter(isSrdClassItem);
  const exact = available.find((item) => (
    character.classSourceId !== undefined &&
    String(item.sourceId) === String(character.classSourceId) &&
    (!character.classSlug || item.slug === character.classSlug)
  )) ?? available.find((item) => Boolean(character.classSlug) && item.slug === character.classSlug);
  return exact ?? classDefinitionFor(available, character.className, true);
}

export function classDomainsFor(classes: LibraryClassItem[] | undefined, className: DaggerheartClass, includePlaytest = false): DomainName[] {
  return classDefinitionFor(classes, className, includePlaytest)?.domains ?? CLASS_DOMAINS[className];
}

export function classStartingStatsFor(classes: LibraryClassItem[] | undefined, className: DaggerheartClass, includePlaytest = false): { evasion: number; hp: number } {
  const definition = classDefinitionFor(classes, className, includePlaytest);
  return definition ? { evasion: definition.evasion, hp: definition.hp } : CLASS_STARTING_STATS[className];
}

export function classStartingItemsFor(classes: LibraryClassItem[] | undefined, className: DaggerheartClass, includePlaytest = false): string[] {
  const definition = classDefinitionFor(classes, className, includePlaytest);
  return definition?.classItems.length ? definition.classItems : [];
}

export function backgroundQuestionsFor(classDefinition: LibraryClassItem | null | undefined): string[] {
  return classQuestionsFor(classDefinition, 'backgroundQuestions', 'background_questions');
}

export function connectionQuestionsFor(classDefinition: LibraryClassItem | null | undefined): string[] {
  return classQuestionsFor(classDefinition, 'connectionQuestions', 'connection_questions');
}

export function filterBuilderContent(content: ContentState['generic'], includePlaytest = false): ContentState['generic'] {
  if (includePlaytest) return content;
  return {
    ancestries: content.ancestries.filter(isSrdLibraryItem),
    communities: content.communities.filter(isSrdLibraryItem),
    subclasses: content.subclasses.filter(isSrdLibraryItem),
    domainCards: content.domainCards.filter(isSrdLibraryItem)
  };
}

export function firstFeatureText(item: GenericLibraryItem): string {
  const features = libraryItemFeatures(item);
  if (features.length === 0) return cleanRulesText(item.body).slice(0, 260);

  const first = features.find((feature) => feature && typeof feature === 'object') as RawFeature | undefined;
  if (!first) return cleanRulesText(item.body).slice(0, 260);

  const text = [
    typeof first.name === 'string' ? first.name : '',
    typeof first.main_body === 'string' ? first.main_body : typeof first.text === 'string' ? first.text : ''
  ].filter(Boolean).join(': ');
  return cleanRulesText(text).slice(0, 320);
}

export function featureListText(item: GenericLibraryItem, limit = 3): string {
  const text = libraryItemFeatures(item)
    .slice(0, Math.max(1, limit))
    .map((feature) => {
      const raw = feature as RawFeature;
      return [
        typeof raw.name === 'string' ? raw.name : '',
        typeof raw.main_body === 'string' ? raw.main_body : typeof raw.text === 'string' ? raw.text : ''
      ].filter(Boolean).join(': ');
    })
    .filter(Boolean)
    .join('\n\n');
  return cleanRulesText(text).slice(0, 520) || cleanRulesText(item.body).slice(0, 420);
}

export function classFeatureListText(item: LibraryClassItem, limit = 8): string {
  const features = Array.isArray(item.raw.features) ? item.raw.features : [];
  return formatFeatureList(features, limit);
}

function libraryItemFeatures(item: GenericLibraryItem): RawFeature[] {
  const raw = item.raw;
  return [raw.features, raw.foundation_features, raw.specialization_features, raw.mastery_features]
    .flatMap((features) => Array.isArray(features) ? features : [])
    .filter((feature): feature is RawFeature => Boolean(feature && typeof feature === 'object'));
}

function formatFeatureList(features: RawFeature[], limit: number): string {
  const text = features
    .slice(0, Math.max(1, limit))
    .map((feature) => {
      const raw = feature as RawFeature;
      return [
        typeof raw.name === 'string' ? raw.name : '',
        typeof raw.main_body === 'string' ? raw.main_body : typeof raw.text === 'string' ? raw.text : ''
      ].filter(Boolean).join(': ');
    })
    .filter(Boolean)
    .join('\n\n');
  return cleanRulesText(text).slice(0, 1_200);
}

export interface CharacterBuilderChoicePreview {
  kicker: string;
  title: string;
  subtitle?: string;
  body: string;
  imageUrl?: string | null;
  facts?: string[];
}

export function buildCharacterBuilderChoicePreview(input: {
  step: BuilderStep;
  selectedClass?: {
    className: DaggerheartClass;
    name: string;
    domains: string[];
    imageUrl: string | null;
    body: string;
    featureText?: string;
    evasion?: number;
    hp?: number;
  };
  selectedAncestry?: GenericLibraryItem;
  selectedCommunity?: GenericLibraryItem;
  selectedSubclass?: GenericLibraryItem;
  selectedCards?: GenericLibraryItem[];
  availableDomainCards?: GenericLibraryItem[];
  selectedCardIds?: string[];
  requiredDomainCardCount?: number;
  selectedArmor?: StartingArmorOption;
  selectedPrimaryWeapon?: StartingWeaponOption;
  selectedSecondaryWeapon?: StartingWeaponOption | null;
  selectedConsumable?: StartingInventoryOption | null;
  classItem?: string;
}): CharacterBuilderChoicePreview | null {
  switch (input.step) {
    case 'class':
      return input.selectedClass ? {
        kicker: 'Класс',
        title: input.selectedClass.name || CLASS_LABELS[input.selectedClass.className],
        subtitle: input.selectedClass.domains.map((domain) => DOMAIN_LABELS[domain as DomainName] ?? domain).join(' + '),
        body: [
          cleanRulesText(input.selectedClass.body),
          input.selectedClass.featureText ? `Свойства\n${cleanRulesText(input.selectedClass.featureText)}` : ''
        ].filter(Boolean).join('\n\n'),
        imageUrl: input.selectedClass.imageUrl,
        facts: [
          typeof input.selectedClass.evasion === 'number' ? `Уклонение ${input.selectedClass.evasion}` : '',
          typeof input.selectedClass.hp === 'number' ? `Раны ${input.selectedClass.hp}` : ''
        ].filter(Boolean)
      } : null;
    case 'ancestry':
      return libraryItemPreview('Родословная', input.selectedAncestry);
    case 'community':
      return libraryItemPreview('Сообщество', input.selectedCommunity);
    case 'subclass':
      return libraryItemPreview('Подкласс', input.selectedSubclass, subclassFacts(input.selectedSubclass));
    case 'cards': {
      const cardIds = input.selectedCardIds ?? [];
      const activeId = cardIds[cardIds.length - 1];
      const card = input.selectedCards?.find((item) => item.id === activeId) ??
        input.availableDomainCards?.find((item) => item.id === activeId) ??
        input.selectedCards?.[0] ??
        input.availableDomainCards?.[0];
      if (!card) return null;
      return {
        kicker: 'Карта домена',
        title: card.name,
        subtitle: [card.subtitle, `Уровень ${domainCardLevel(card)}`, domainCardRecallCost(card) ? `Возврат ${domainCardRecallCost(card)}` : ''].filter(Boolean).join(' — '),
        body: firstFeatureText(card) || domainCardText(card) || cleanRulesText(card.body),
        imageUrl: card.imageUrl,
        facts: [`Выбрано ${input.selectedCards?.length ?? 0}/${input.requiredDomainCardCount ?? 2}`]
      };
    }
    case 'equipment': {
      const parts = [
        input.selectedArmor?.feature ? `Броня: ${input.selectedArmor.feature}` : '',
        input.selectedPrimaryWeapon?.feature ? `Основное оружие: ${input.selectedPrimaryWeapon.feature}` : '',
        input.selectedSecondaryWeapon?.feature ? `Вторая рука: ${input.selectedSecondaryWeapon.feature}` : '',
        input.selectedConsumable?.text ? `Расходник: ${input.selectedConsumable.text}` : ''
      ].filter(Boolean);
      return {
        kicker: 'Экипировка',
        title: input.selectedPrimaryWeapon?.name ?? input.selectedArmor?.name ?? 'Стартовый набор',
        subtitle: [input.selectedArmor?.name, input.selectedSecondaryWeapon?.name, input.selectedConsumable?.name, input.classItem].filter(Boolean).join(' — '),
        body: cleanRulesText(parts.join('\n\n') || 'Выберите броню, оружие, предмет класса и расходник. Итоговые значения будут собраны в лист персонажа автоматически.'),
        imageUrl: input.selectedPrimaryWeapon?.source.imageUrl ?? input.selectedArmor?.source.imageUrl ?? null,
        facts: [
          input.selectedPrimaryWeapon ? `${TRAIT_LABELS[input.selectedPrimaryWeapon.trait]} — ${input.selectedPrimaryWeapon.range} — ${input.selectedPrimaryWeapon.damageFormula}` : '',
          input.selectedArmor ? `Пороги ${input.selectedArmor.baseMajor}/${input.selectedArmor.baseSevere} — Броня ${input.selectedArmor.score}` : ''
        ].filter(Boolean)
      };
    }
    default:
      return null;
  }
}

function libraryItemPreview(kicker: string, item?: GenericLibraryItem, facts?: string[]): CharacterBuilderChoicePreview | null {
  if (!item) return null;
  const features = featureListText(item, 8);
  const description = cleanRulesText(item.body);
  return {
    kicker,
    title: item.name,
    subtitle: item.subtitle,
    body: [description, features].filter(Boolean).join('\n\n'),
    imageUrl: item.imageUrl,
    facts
  };
}

function subclassFacts(item: GenericLibraryItem | undefined): string[] {
  const spellcastTrait = coerceTrait(item?.raw.spellcast_trait);
  return spellcastTrait ? [`Характеристика заклинателя: ${TRAIT_LABELS[spellcastTrait]}`] : [];
}

export function domainCardFromLibrary(item: GenericLibraryItem, inLoadout: boolean): DomainCardRecord {
  return {
    id: item.id,
    name: item.name,
    domain: coerceDomainName(item.raw.domain_name ?? item.raw.domain_slug) ?? 'Custom',
    level: domainCardLevel(item),
    cost: domainCardActivationCost(item),
    recallCost: domainCardRecallCost(item),
    text: domainCardText(item),
    inLoadout,
    imageUrl: item.imageUrl,
    cardType: typeof item.raw.card_type === 'string' ? item.raw.card_type : '',
    sourceId: item.sourceId ?? item.id,
    tokens: { value: 0, max: domainCardTokenSlots(item) }
  };
}

export function starterDomainCardsFromLibrary(items: GenericLibraryItem[], domains: DomainName[], count = 2): DomainCardRecord[] {
  const seen = new Set<string>();
  return items
    .filter((item) => isDomainCardForDomains(item, domains))
    .filter((item) => domainCardLevel(item) === 1)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, Math.max(0, count))
    .map((item) => domainCardFromLibrary(item, true));
}

export function sheetCardFromLibrary(item: GenericLibraryItem, kind: CharacterSheetCard['kind']): CharacterSheetCard {
  return {
    id: `sheet-${kind}-${item.id}`,
    kind,
    name: item.name,
    subtitle: item.subtitle,
    text: firstFeatureText(item) || item.body || domainCardText(item),
    imageUrl: item.imageUrl,
    sourceId: item.sourceId ?? item.id
  };
}

export function cleanRulesText(text: string): string {
  return cleanMarkdownText(text, { stripEmphasis: true, normalizeLineBreaks: true });
}

export function buildCharacterDraft(input: CharacterBuilderInput): CharacterDraftResult {
  const content = filterBuilderContent(input.content, input.includePlaytest);
  const requestedClassName = input.className ?? 'Bard';
  const classDefinition = classDefinitionFor(input.classes, requestedClassName, input.includePlaytest, input.classId);
  const className = classDefinition?.className ?? requestedClassName;
  const classDomains = classDefinition?.domains ?? classDomainsFor(input.classes, className, input.includePlaytest);
  const classStats = classDefinition ? { evasion: classDefinition.evasion, hp: classDefinition.hp } : classStartingStatsFor(input.classes, className, input.includePlaytest);
  const classItems = classDefinition?.classItems.length ? classDefinition.classItems : classStartingItemsFor(input.classes, className, input.includePlaytest);
  const playableDomains = classDomains.filter((domain) => domain !== 'Custom');
  const warnings: string[] = [];

  const ancestry = selectById(content.ancestries, input.ancestryId);
  const community = selectById(content.communities, input.communityId);
  const classSubclasses = content.subclasses.filter((item) => isSubclassForClass(item, className, classDefinition));
  const subclass = selectById(classSubclasses, input.subclassId);
  const spellcastTrait = spellcastTraitFor(classDefinition, subclass);
  const ruleModifiers = characterBuilderRuleModifiersForSubclass(subclass);
  const requiredDomainCards = startingDomainCardCount(ruleModifiers);

  if (input.subclassId && !subclass) {
    warnings.push(`Подкласс ${input.subclassId} недоступен для класса ${classDefinition?.name ?? CLASS_LABELS[className]}.`);
  }

  const availableDomainCards = content.domainCards
    .filter((item) => isDomainCardForDomains(item, playableDomains))
    .filter((item) => domainCardLevel(item) === 1);
  const selectedDomainCards = selectDomainCards(availableDomainCards, input.selectedCardIds ?? [], requiredDomainCards, warnings);
  const baseTraits = { ...DEFAULT_TRAITS, ...input.traits };
  const equipment = buildStartingEquipmentLoadout({
    className,
    primaryWeaponId: input.primaryWeaponId,
    secondaryWeaponId: input.secondaryWeaponId,
    armorId: input.armorId,
    classItem: input.classItem,
    classItems,
    consumableId: input.consumableId,
    equipment: input.equipment ?? [],
    traits: baseTraits
  });
  warnings.push(...equipment.warnings);
  if (!spellcastTrait && equipment.weapons.some((weapon) => weapon.damageType === 'magic')) {
    warnings.push('Выбрано магическое оружие, но у класса не определена характеристика заклинателя. Проверьте доступность вручную.');
  }

  const domainCards = selectedDomainCards.map((card) => domainCardFromLibrary(card, true));
  const sheetCards: CharacterSheetCard[] = [
    ...classFeatureSheetCards(classDefinition),
    ancestry ? sheetCardFromLibrary(ancestry, 'ancestry') : null,
    ...libraryFeatureSheetCards(ancestry, 'ancestryFeature'),
    community ? sheetCardFromLibrary(community, 'community') : null,
    ...libraryFeatureSheetCards(community, 'communityFeature'),
    subclass ? sheetCardFromLibrary(subclass, 'subclass') : null,
    ...startingSubclassFeatureSheetCards(subclass),
    ...selectedDomainCards.map((card) => sheetCardFromLibrary(card, 'domainCard'))
  ].filter(Boolean) as CharacterSheetCard[];
  const backgroundAnswers = buildQuestionAnswers('background', backgroundQuestionsFor(classDefinition), input.backgroundAnswers ?? []);
  const connections = buildConnections(connectionQuestionsFor(classDefinition), input.connectionAnswers ?? []);
  const description = buildDescription(input);
  const featureInventory = sheetCards.flatMap((card) => {
    if (!['classFeature', 'ancestryFeature', 'communityFeature', 'subclassFeature'].includes(card.kind)) return [];
    return automaticFeatureRuleEffects(card.text ?? '').flatMap((effect) => (
      effect.kind === 'inventoryGrant' ? [createInventoryItem({
        id: `feature-item-${card.id}-${effect.evidence.start}`,
        name: effect.name,
        kind: 'item',
        quantity: effect.count,
        sourceId: card.sourceId
      })] : []
    ));
  });
  const inventory = [...equipment.inventory];
  for (const item of featureInventory) {
    const existing = inventory.find((candidate) => candidate.name.localeCompare(item.name, 'ru', { sensitivity: 'base' }) === 0);
    if (existing) existing.quantity += item.quantity;
    else inventory.push(item);
  }
  warnings.push(...mechanicalTextWarnings(sheetCards));

  return {
    draft: {
      name: cleanName(input.name, 'Новый герой'),
      playerName: input.playerName?.trim() ?? '',
      pronouns: input.pronouns?.trim() ?? '',
      className,
      classSourceId: classDefinition?.sourceId,
      classSlug: classDefinition?.slug,
      classDisplayName: classDefinition?.name,
      subclassName: subclass?.name ?? '',
      subclassSlug: subclass?.slug ?? '',
      ancestry: ancestry?.name ?? '',
      community: community?.name ?? '',
      domains: classDomains,
      portraitUrl: input.portraitUrl?.trim() || ancestry?.imageUrl || subclass?.imageUrl || '',
      traits: equipment.traits,
      spellcastTrait,
      evasion: classStats.evasion + equipment.evasionModifier,
      thresholds: {
        major: equipment.armor.baseMajor + 1,
        severe: equipment.armor.baseSevere + 1
      },
      hp: { marked: 0, max: classStats.hp },
      armor: equipment.armor,
      experiences: buildExperiences(input.experienceNames, input.now),
      domainCards,
      ruleModifiers,
      sheetCards,
      weapons: equipment.weapons,
      inventory,
      wealth: { coins: 0, handfuls: 1, bags: 0, chests: 0 },
      description,
      backgroundAnswers,
      connections,
      notes: buildCharacterNotes(description, backgroundAnswers, connections)
    },
    selections: {
      ancestry,
      community,
      subclass,
      domainCards: selectedDomainCards,
      primaryWeapon: equipment.primaryWeapon,
      secondaryWeapon: equipment.secondaryWeapon,
      armor: equipment.armorOption
    },
    warnings
  };
}

function spellcastTraitFor(classDefinition: LibraryClassItem | null, subclass: GenericLibraryItem | null): TraitId | null {
  // Current SRD content stores the spellcast trait on subclasses. Keep the class
  // lookup as a fallback for older/custom imports that used the previous shape.
  return coerceTrait(subclass?.raw.spellcast_trait) ?? coerceTrait(classDefinition?.raw.spellcast_trait);
}

function mechanicalTextWarnings(cards: CharacterSheetCard[]): string[] {
  const warnings: string[] = [];
  for (const card of cards) {
    const text = `${card.name} ${card.text ?? ''}`.replace(/−/g, '-').toLowerCase();
    const effects = analyzeFeatureRules(card.text ?? '').effects;
    const hasCompiledStatEffect = effects.some((effect) => effect.kind === 'statDelta' && effect.automatic);
    const setupEffects = effects.filter((effect) => (
      effect.kind === 'creationChoice' ||
      effect.kind === 'resourceInit' ||
      effect.kind === 'companionGrant' ||
      effect.kind === 'advancementGrant'
    ));
    setupEffects.forEach((effect) => warnings.push(`${card.name}: ${effect.summary}.`));
    if (containsManualMechanicalAdjustment(text) && !hasCompiledStatEffect && setupEffects.length === 0) {
      warnings.push(`${card.name}: проверьте механический эффект вручную.`);
      continue;
    }
    if (/(experience|опыт)/.test(text) && /(?:gain|add|получ|добав)/.test(text) && !effects.some((effect) => effect.kind === 'creationChoice' && effect.choice === 'experienceBonus')) {
      warnings.push(`${card.name}: проверьте дополнительный Опыт вручную.`);
    }
    if (/(threshold|порог)/.test(text) && /[+-]\s*\d+/.test(text) && !effects.some((effect) => effect.kind === 'statDelta' && (effect.target === 'thresholdMajor' || effect.target === 'thresholdSevere'))) {
      warnings.push(`${card.name}: проверьте изменение порогов вручную.`);
    }
  }
  return warnings;
}

function containsManualMechanicalAdjustment(text: string): boolean {
  return /[+-]\s*\d+/.test(text) &&
    /(evasion|уклон|hit point|hit points|hp|ран|stress|стресс|agility|провор|strength|сил|finesse|искус|instinct|инстинкт|presence|влия|knowledge|знан|threshold|порог|armor|брон)/.test(text);
}

function coerceTrait(input: unknown): TraitId | null {
  const value = String(input ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const traits: Record<string, TraitId> = {
    agility: 'agility',
    strength: 'strength',
    finesse: 'finesse',
    instinct: 'instinct',
    presence: 'presence',
    knowledge: 'knowledge'
  };
  return traits[value] ?? null;
}

export function classFeatureSheetCards(item: LibraryClassItem | null): CharacterSheetCard[] {
  if (!item) return [];
  return rawFeaturesToSheetCards(item.raw.features, 'classFeature', `class-${item.slug}`, item.sourceId);
}

function libraryFeatureSheetCards(item: GenericLibraryItem | null, kind: Extract<CharacterSheetCard['kind'], 'ancestryFeature' | 'communityFeature'>): CharacterSheetCard[] {
  if (!item) return [];
  return rawFeaturesToSheetCards(item.raw.features, kind, `${kind}-${item.slug}`, item.sourceId ?? item.id);
}

export function startingSubclassFeatureSheetCards(item: GenericLibraryItem | null): CharacterSheetCard[] {
  if (!item) return [];
  return rawFeaturesToSheetCards(item.raw.foundation_features, 'subclassFeature', `subclass-${item.slug}-foundation`, item.sourceId ?? item.id, { subclassTier: 'foundation' });
}

function rawFeaturesToSheetCards(
  features: RawFeature[] | undefined,
  kind: CharacterSheetCard['kind'],
  idPrefix: string,
  sourceId: string | number | undefined,
  metadata: Pick<CharacterSheetCard, 'subtitle' | 'subclassTier'> = {}
): CharacterSheetCard[] {
  if (!Array.isArray(features)) return [];
  return features
    .filter((feature) => feature && typeof feature === 'object')
    .map((feature, index) => ({
      id: `sheet-${idPrefix}-${feature.id ?? index}`,
      kind,
      name: typeof feature.name === 'string' ? feature.name : 'Особенность',
      subtitle: metadata.subtitle ?? '',
      text: cleanRulesText(typeof feature.main_body === 'string' ? feature.main_body : typeof feature.text === 'string' ? feature.text : ''),
      sourceId,
      subclassTier: metadata.subclassTier
    }));
}

export function replaceBackgroundAnswerAt(values: string[], index: number, answer: string, prompts: string[]): string[] {
  if (!isValidQuestionIndex(index, prompts.length)) return normalizeBackgroundAnswers(values, prompts);
  const next = normalizeBackgroundAnswers(values, prompts);
  next[index] = answer.trim();
  return next;
}

export function replaceConnectionAnswerAt(
  values: CharacterConnectionInput[],
  index: number,
  patch: CharacterConnectionInput,
  prompts: string[]
): CharacterConnectionInput[] {
  if (!isValidQuestionIndex(index, prompts.length)) return normalizeConnectionAnswers(values, prompts);
  const next = normalizeConnectionAnswers(values, prompts);
  next[index] = cleanConnectionInput({ ...(next[index] ?? {}), ...patch });
  return next;
}

function buildQuestionAnswers(prefix: string, prompts: string[], answers: string[]): CharacterQuestionAnswer[] {
  const normalizedAnswers = normalizeBackgroundAnswers(answers, prompts);
  return prompts.map((prompt, index) => ({
    id: `${prefix}-${index + 1}`,
    prompt,
    answer: normalizedAnswers[index] ?? ''
  }));
}

function buildConnections(prompts: string[], answers: CharacterConnectionInput[]): CharacterConnection[] {
  const normalizedAnswers = normalizeConnectionAnswers(answers, prompts);
  return prompts.map((prompt, index) => ({
    id: `connection-${index + 1}`,
    prompt,
    answer: normalizedAnswers[index]?.answer ?? '',
    targetName: normalizedAnswers[index]?.targetName || undefined
  }));
}

function classQuestionsFor(
  classDefinition: LibraryClassItem | null | undefined,
  mappedKey: 'backgroundQuestions' | 'connectionQuestions',
  rawKey: 'background_questions' | 'connection_questions'
): string[] {
  const mapped = classDefinition?.[mappedKey] ?? [];
  const raw = classDefinition?.raw[rawKey];
  return normalizeQuestionPrompts(mapped.length ? mapped : raw);
}

function normalizeQuestionPrompts(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const prompts: string[] = [];

  for (const item of input) {
    const prompt = questionPromptText(item).replace(/^\d+[\).:-]\s*/, '');
    if (!prompt || seen.has(prompt)) continue;
    seen.add(prompt);
    prompts.push(prompt);
  }

  return prompts;
}

function questionPromptText(item: RawQuestion | unknown): string {
  if (typeof item === 'string') return cleanRulesText(item);
  if (!item || typeof item !== 'object') return '';
  const raw = item as Exclude<RawQuestion, string>;
  return cleanRulesText(String(raw.prompt ?? raw.question ?? raw.text ?? raw.title ?? ''));
}

function normalizeBackgroundAnswers(values: string[], prompts: string[]): string[] {
  return prompts.map((_, index) => values[index]?.trim() ?? '');
}

function normalizeConnectionAnswers(values: CharacterConnectionInput[], prompts: string[]): CharacterConnectionInput[] {
  return prompts.map((_, index) => cleanConnectionInput(values[index] ?? {}));
}

function cleanConnectionInput(value: CharacterConnectionInput): CharacterConnectionInput {
  return {
    answer: value.answer?.trim() ?? '',
    targetName: value.targetName?.trim() ?? ''
  };
}

function isValidQuestionIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

function buildDescription(input: CharacterBuilderInput): CharacterDescription {
  return {
    appearance: input.appearance?.trim() ?? '',
    demeanor: input.demeanor?.trim() ?? '',
    backstory: input.backstory?.trim() ?? ''
  };
}

function buildCharacterNotes(description: CharacterDescription, backgroundAnswers: CharacterQuestionAnswer[], connections: CharacterConnection[]): string {
  const sections = [
    description.appearance ? `Внешность: ${description.appearance}` : '',
    description.demeanor ? `Манера: ${description.demeanor}` : '',
    description.backstory ? `Предыстория: ${description.backstory}` : '',
    ...backgroundAnswers.filter((item) => item.answer).map((item) => `${item.prompt}\n${item.answer}`),
    ...connections.filter((item) => item.answer || item.targetName).map((item) => `${item.prompt}${item.targetName ? ` (${item.targetName})` : ''}\n${item.answer}`)
  ].filter(Boolean);
  return sections.join('\n\n');
}

function selectById(items: GenericLibraryItem[], id: string | undefined): GenericLibraryItem | null {
  if (!id) return null;
  return items.find((item) => item.id === id) ?? null;
}

function selectDomainCards(available: GenericLibraryItem[], selectedIds: string[], limit: number, warnings: string[]): GenericLibraryItem[] {
  const selected: GenericLibraryItem[] = [];
  const seen = new Set<string>();

  for (const id of selectedIds) {
    if (selected.length >= limit) {
      warnings.push(`Учтены только первые ${limit} допустимые карты домена.`);
      break;
    }
    if (seen.has(id)) continue;
    seen.add(id);

    const card = available.find((item) => item.id === id);
    if (!card) {
      warnings.push(`Карта домена ${id} недоступна выбранному классу на 1 уровне.`);
      continue;
    }
    selected.push(card);
  }

  return selected;
}

function buildExperiences(names: string[] | undefined, now: (() => number) | undefined): Experience[] {
  const timestamp = now?.() ?? Date.now();
  const defaults = ['Искатель приключений', 'Верный товарищ'];
  return defaults.map((fallback, index) => {
    const name = names?.[index]?.trim() || fallback;
    return { id: `builder-exp-${index + 1}-${timestamp}`, name, modifier: 2, notes: '' };
  });
}

function cleanName(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function domainCardLevel(item: GenericLibraryItem): number {
  if (typeof item.raw.level === 'number') return item.raw.level;
  if (typeof item.raw.level === 'string') return Number(item.raw.level) || 1;
  return item.level ?? 1;
}

function domainCardRecallCost(item: GenericLibraryItem): string {
  const stressCost = item.raw.stress_cost;
  return typeof stressCost === 'number' || typeof stressCost === 'string' ? `Стресс ${stressCost}` : '';
}

function domainCardActivationCost(item: GenericLibraryItem): string {
  const text = [item.raw.cost, item.raw.activation_cost]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
  const cost = parseDomainCardCost(text);
  return [
    cost.hope > 0 ? `Надежда ${cost.hope}` : '',
    cost.stress > 0 ? `Стресс ${cost.stress}` : '',
    cost.tokens > 0 ? `Жетоны ${cost.tokens}` : ''
  ].filter(Boolean).join(', ');
}

function domainCardTokenSlots(item: GenericLibraryItem): number {
  const text = [item.name, item.subtitle, item.body, firstFeatureText(item)].join(' ').toLowerCase();
  if (!/(token|жетон)/.test(text)) return 0;
  const explicit = text.match(/(?:token|жетон)[а-яa-z\s:.-]*(\d+)/i) ?? text.match(/(\d+)[а-яa-z\s:.-]*(?:token|жетон)/i);
  if (explicit) return Math.max(1, Math.min(12, Number(explicit[1])));
  return 6;
}

function domainCardText(item: GenericLibraryItem): string {
  if (item.body) return cleanRulesText(item.body);
  const features = item.raw.features;
  if (!Array.isArray(features)) return '';

  return cleanRulesText(features
    .map((feature) => {
      if (!feature || typeof feature !== 'object') return '';
      const raw = feature as RawFeature;
      return [
        typeof raw.name === 'string' ? raw.name : '',
        typeof raw.main_body === 'string' ? raw.main_body : typeof raw.text === 'string' ? raw.text : ''
      ].filter(Boolean).join(': ');
    })
    .filter(Boolean)
    .join('\n\n'));
}
