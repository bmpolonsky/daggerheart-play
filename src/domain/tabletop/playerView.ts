import { buildPresentedHandoutOverlay, type PresentedHandoutOverlay } from '../rules/handouts';
import { cleanMarkdownText } from '../../core/utils/markdownText';
import { buildEffectiveCharacterStats } from '../rules/effects';
import { parseDomainCardTextMacros, resolveDomainCardTokenMax, type DomainCardTextMacro } from '../rules/domainCards';
import { actionOutcomeLabel, formatDualityBreakdown, formatDualityResult } from '../rules/rollPresentation';
import { isCharacterFeatureSheetCard, subclassFeatureTierLabel } from '../rules/sidecar';
import type { Adversary, GameState, Character, CharacterBeastformState, CharacterCompanionState, CharacterInventoryItem, CharacterScar, CharactersState, EncounterEnvironment, EncounterState, FeedEntry, RollLogEntry, TraitId, CharacterWealth } from '../rules/types';
import { RANGE_LABELS, TRAIT_LABELS, classLabel, domainLabel } from '../rules/constants';
import { normalizeStatusTag } from '../rules/statuses';
import { buildHandoutFeedItem, buildTableFeedFromEntries, createFeedEntriesFromRollLog, type TableFeedItem } from './feed';
import { canViewFeedEntry, latestVisibleRollLogEntry } from './rollPublication';
import { defaultCharacterPortraitUrl, defaultSceneImageUrl } from './defaultArt';
import type { MapAsset, TableScene, TokenState } from './types';

export interface PlayerViewToken {
  id: string;
  actorId: string;
  kind: 'character' | 'adversary' | 'environment';
  name: string;
  subtitle: string;
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tint?: string;
  aura?: string;
  hidden?: boolean;
  visibility?: 'public' | 'gm';
  statuses?: string[];
}

export interface PlayerViewCharacterSummary {
  id: string;
  name: string;
  subtitle: string;
  portraitUrl: string;
  level: number;
  proficiency: number;
  className: string;
  spellcastTrait: TraitId | null;
  hope: { value: number; max: number };
  hp: { marked: number; max: number };
  stress: { marked: number; max: number };
  evasion: number;
  thresholds: { major: number; severe: number };
  armor: { name: string; score: number; marked: number; feature: string };
  activeBeastform: CharacterBeastformState | null;
  rangerMark: Character['rangerMark'];
  companion: CharacterCompanionState | null;
  traits: Array<{ id: TraitId; label: string; value: number }>;
  experiences: Array<{ id: string; name: string; modifier: number }>;
  weapons: Array<{ id: string; name: string; trait: TraitId; traitLabel: string; range: string; damage: string; damageFormula: string; damageType: string }>;
  loadoutCards: Array<{ id: string; name: string; domain: string; domainLabel: string; level: number; cost: string; recallCost: string; text: string; imageUrl: string; tokens: { value: number; max: number }; macros: DomainCardTextMacro[] }>;
  features: Array<{ id: string; name: string; subtitle: string; text: string }>;
  inventory: CharacterInventoryItem[];
  wealth: CharacterWealth;
  conditions: Array<{ id: string; name: string; notes: string }>;
  scars: CharacterScar[];
}

export interface PlayerViewAdversarySummary {
  id: string;
  name: string;
  subtitle: string;
  portraitUrl: string;
  tier: number;
  type: string;
  difficulty: number;
  attackModifier: number;
  thresholds: { major: number; severe: number };
  hp: { marked: number; max: number };
  stress: { marked: number; max: number };
  standardAttack: { name: string; range: string; damage: string; damageType: string };
  experiences: Array<{ id: string; name: string; modifier: number }>;
  features: Array<{ id: string; name: string; kind: string; cost: string; text: string }>;
  conditions: Array<{ id: string; name: string; notes: string }>;
  notes: string;
}

export interface PlayerViewEmptyCharacterState {
  title: string;
  description: string;
  actionLabel: string;
}

export interface PlayerViewRollSummary {
  id: string;
  kind: string;
  title: string;
  detail: string;
  tone: 'hope' | 'fear' | 'damage' | 'neutral';
  total: number | null;
}

export interface PlayerViewScene {
  id: string;
  name: string;
  subtitle: string;
  imageUrl: string;
  mode: TableScene['mode'];
  music: TableScene['music'];
}

export interface PlayerViewModel {
  gameName: string;
  sessionTitle: string;
  sceneTitle: string;
  spotlightLabel: string;
  fear: { value: number; max: number };
  scene: PlayerViewScene;
  tokens: PlayerViewToken[];
  handout: PresentedHandoutOverlay | null;
  activity: TableFeedItem[];
  latestRoll: PlayerViewRollSummary | null;
  character: PlayerViewCharacterSummary | null;
  adversaries: Record<string, PlayerViewAdversarySummary>;
  emptyCharacterState: PlayerViewEmptyCharacterState;
}

export interface PlayerViewInput {
  game: GameState;
  characters: CharactersState;
  encounter: EncounterState;
  liveScene: TableScene;
  assets: Record<string, MapAsset>;
  assetUrls: Record<string, string>;
  rollLog: RollLogEntry[];
  feed?: FeedEntry[];
  playerCharacterId?: string | null;
  role?: 'player' | 'gm';
}

export function buildPlayerViewModel(input: PlayerViewInput): PlayerViewModel {
  const selectedCharacter = selectPlayerCharacter(input.characters, input.playerCharacterId);
  const handout = buildPresentedHandoutOverlay(input.game);
  const role = input.role ?? 'player';
  const actorId = selectedCharacter?.id ?? input.playerCharacterId ?? null;
  const activity = buildPlayerActivity(input.feed ?? createFeedEntriesFromRollLog(input.rollLog), handout, role, actorId);
  const latestRoll = latestVisibleRollLogEntry(input.rollLog, { role, actorId });
  return {
    gameName: input.game.name,
    sessionTitle: input.game.sessionTitle,
    sceneTitle: input.game.sceneTitle,
    spotlightLabel: input.game.spotlight === 'players' ? 'Игроки' : 'Мастер',
    fear: { value: input.game.fear, max: input.game.maxFear },
    scene: {
      id: input.liveScene.id,
      name: input.liveScene.name,
      subtitle: input.liveScene.subtitle,
      imageUrl: resolveSceneImageUrl(input.liveScene, input.assets, input.assetUrls),
      mode: input.liveScene.mode,
      music: input.liveScene.music
    },
    tokens: buildPlayerTokens(input.liveScene.tokens, input.characters.entities, input.encounter, role),
    handout,
    activity,
    latestRoll: buildPlayerRollSummary(latestRoll),
    character: selectedCharacter ? buildCharacterSummary(selectedCharacter) : null,
    adversaries: role === 'gm' ? buildAdversarySummaries(input.encounter) : {},
    emptyCharacterState: buildPlayerViewEmptyCharacterState()
  };
}

function buildPlayerActivity(feed: FeedEntry[], handout: PresentedHandoutOverlay | null, role: 'player' | 'gm', actorId: string | null): TableFeedItem[] {
  const hasPresentedHandoutFeed = handout
    ? feed.some((entry) => entry.type === 'handout' && entry.handout.id === handout.id && canViewFeedEntry(entry, { role, actorId }))
    : false;
  const items = buildTableFeedFromEntries({ feed, role, actorId });
  if (!handout || hasPresentedHandoutFeed) return items;
  return [
    buildHandoutFeedItem({
      id: handout.id,
      title: handout.title,
      body: handout.hasBody ? handout.body : 'Материал показан игрокам.',
      imageUrl: handout.imageUrl
    }),
    ...items
  ];
}

export function buildPlayerViewEmptyCharacterState(): PlayerViewEmptyCharacterState {
  return {
    title: 'Персонаж не назначен',
    description: 'Создайте героя, и он появится у мастера после завершения визарда.',
    actionLabel: 'Создать персонажа'
  };
}

export function resolveSceneImageUrl(scene: TableScene, assets: Record<string, Pick<MapAsset, 'storage' | 'url'>>, assetUrls: Record<string, string>): string {
  if (scene.backgroundAssetId) {
    const asset = assets[scene.backgroundAssetId];
    const url = asset?.storage === 'indexeddb' ? assetUrls[scene.backgroundAssetId] : asset?.url;
    if (url) return url;
    if (asset) return scene.backgroundUrl;
  }
  return scene.backgroundUrl || defaultSceneImageUrl(scene);
}

export function buildPlayerRollSummary(entry: RollLogEntry | undefined): PlayerViewRollSummary | null {
  if (!entry) return null;
  if (entry.type === 'action') {
    return {
      id: entry.id,
      kind: entry.difficulty > 0 ? actionOutcomeLabel(entry.outcome) : 'Бросок действия',
      title: `${entry.actorName}: ${formatDualityResult(entry)}`,
      detail: formatDualityBreakdown(entry),
      tone: entry.difficulty > 0 ? (entry.success ? 'hope' : 'fear') : (entry.hopeDie >= entry.fearDie ? 'hope' : 'fear'),
      total: entry.total
    };
  }
  if (entry.type === 'damage') {
    return {
      id: entry.id,
      kind: 'Урон',
      title: `${entry.actorName}: ${entry.total}`,
      detail: entry.formula,
      tone: 'damage',
      total: entry.total
    };
  }
  if (entry.type === 'reaction') {
    return {
      id: entry.id,
      kind: entry.success ? 'Реакция успешна' : 'Реакция провалена',
      title: `${entry.actorName}: ${entry.total}`,
      detail: `Надежда ${entry.hopeDie} / Страх ${entry.fearDie} / без генерации ресурсов`,
      tone: entry.success ? 'hope' : 'fear',
      total: entry.total
    };
  }
  return {
    id: entry.id,
    kind: 'Запись',
    title: entry.title,
    detail: entry.text,
    tone: 'neutral',
    total: null
  };
}

export function buildPlayerTokens(tokens: TokenState[], characters: Record<string, Character>, encounter: EncounterState, role: 'player' | 'gm'): PlayerViewToken[] {
  const visibleTokens: PlayerViewToken[] = [];
  tokens.forEach((token) => {
    if (role !== 'gm' && (token.hidden || token.ownership.visibility !== 'public')) return;
    if (token.actor.kind === 'character') {
      const character = characters[token.actor.id];
      if (!character) return;
      const conditions = statusConditions(character.conditions);
      visibleTokens.push({
        id: token.id,
        actorId: character.id,
        kind: 'character',
        name: character.name,
        subtitle: `Уровень ${character.level}`,
        imageUrl: defaultCharacterPortraitUrl(character),
        x: token.x,
        y: token.y,
        width: token.width,
        height: token.height,
        tint: token.tint,
        aura: token.aura,
        hidden: token.hidden,
        visibility: token.ownership.visibility,
        statuses: conditions.map((condition) => condition.name)
      });
      return;
    }
    if (token.actor.kind === 'adversary') {
      const adversary = encounter.adversaries[token.actor.id];
      if (!adversary) return;
      const conditions = statusConditions(adversary.conditions ?? []);
      visibleTokens.push({
        id: token.id,
        actorId: adversary.id,
        kind: 'adversary',
        name: adversary.name,
        subtitle: role === 'gm' ? adversarySubtitle(adversary) : '',
        imageUrl: adversary.imageUrl ?? '',
        x: token.x,
        y: token.y,
        width: token.width,
        height: token.height,
        tint: token.tint,
        aura: token.aura,
        hidden: token.hidden,
        visibility: token.ownership.visibility,
        statuses: conditions.map((condition) => condition.name)
      });
      return;
    }
    if (token.actor.kind === 'environment') {
      const environment = encounter.environments[token.actor.id];
      if (!environment) return;
      visibleTokens.push({
        id: token.id,
        actorId: environment.id,
        kind: 'environment',
        name: environment.name,
        subtitle: role === 'gm' ? environmentSubtitle(environment) : '',
        imageUrl: environment.imageUrl ?? '',
        x: token.x,
        y: token.y,
        width: token.width,
        height: token.height,
        tint: token.tint,
        aura: token.aura,
        hidden: token.hidden,
        visibility: token.ownership.visibility
      });
    }
  });
  return visibleTokens;
}

function selectPlayerCharacter(characters: CharactersState, playerCharacterId?: string | null): Character | null {
  if (playerCharacterId && characters.entities[playerCharacterId]) return characters.entities[playerCharacterId];
  return null;
}

function adversarySubtitle(adversary: Pick<Adversary, 'tier' | 'type'>): string {
  return `Ранг ${adversary.tier} / ${adversaryTypeLabel(adversary.type)}`;
}

function environmentSubtitle(environment: Pick<EncounterEnvironment, 'difficulty'>): string {
  return environment.difficulty ? `Сложность ${environment.difficulty}` : 'Окружение';
}

function adversaryTypeLabel(type: Adversary['type']): string {
  const labels: Record<Adversary['type'], string> = {
    Bruiser: 'Громила',
    Horde: 'Орда',
    Leader: 'Лидер',
    Minion: 'Приспешник',
    Ranged: 'Дальнобойный',
    Skulk: 'Скрытный',
    Social: 'Социальный',
    Solo: 'Одиночка',
    Standard: 'Обычный',
    Support: 'Поддержка',
    Custom: 'Свой тип'
  };
  return labels[type] ?? type;
}

function rangeLabel(range: string): string {
  return RANGE_LABELS[range] ?? range;
}

function beastformAttackSummary(form: CharacterBeastformState): PlayerViewCharacterSummary['weapons'][number] {
  return {
    id: `beastform:${form.slug}:attack`,
    name: `${form.name}: атака`,
    trait: form.attackTrait,
    traitLabel: TRAIT_LABELS[form.attackTrait],
    range: rangeLabel(form.attackRange),
    damage: form.attackFormula,
    damageFormula: form.attackFormula,
    damageType: form.attackDamageType
  };
}

export function buildCharacterSummary(character: Character): PlayerViewCharacterSummary {
  const effective = buildEffectiveCharacterStats(character);
  return {
    id: character.id,
    name: character.name,
    subtitle: [character.ancestry, character.community, classLabel(character.className)].filter(Boolean).join(' / '),
    portraitUrl: defaultCharacterPortraitUrl(character),
    level: character.level,
    proficiency: character.proficiency,
    className: character.className,
    spellcastTrait: character.spellcastTrait ?? null,
    hope: { ...effective.hope },
    hp: { ...effective.hp },
    stress: { ...effective.stress },
    evasion: effective.evasion,
    thresholds: { ...effective.thresholds },
    armor: {
      name: character.armor.name,
      score: character.armor.score,
      marked: character.armor.markedSlots,
      feature: character.armor.feature?.trim() ?? ''
    },
    activeBeastform: character.activeBeastform ? { ...character.activeBeastform } : null,
    rangerMark: character.rangerMark ? { ...character.rangerMark } : null,
    companion: character.companion ? { ...character.companion, stress: { ...character.companion.stress }, experiences: character.companion.experiences.map((experience) => ({ ...experience })) } : null,
    traits: Object.entries(effective.traits).map(([id, value]) => ({
      id: id as TraitId,
      label: TRAIT_LABELS[id as TraitId],
      value
    })),
    experiences: character.experiences.map((experience) => ({
      id: experience.id,
      name: experience.name,
      modifier: experience.modifier
    })),
    weapons: (character.activeBeastform ? [beastformAttackSummary(character.activeBeastform)] : character.weapons.map((weapon) => ({
      id: weapon.id,
      name: weapon.name,
      trait: weapon.trait,
      traitLabel: TRAIT_LABELS[weapon.trait],
      range: rangeLabel(weapon.range),
      damage: weapon.damageFormula,
      damageFormula: weapon.damageFormula,
      damageType: weapon.damageType
    }))),
    loadoutCards: character.domainCards
      .map((card) => {
        const tokenMax = resolveDomainCardTokenMax(card, effective.traits);
        return {
          id: card.id,
          name: card.name,
          domain: card.domain,
          domainLabel: domainLabel(card.domain),
          level: card.level,
          cost: card.cost?.trim() ?? '',
          recallCost: card.recallCost?.trim() ?? '',
          text: card.text,
          imageUrl: card.imageUrl ?? '',
          tokens: {
            value: Math.min(card.tokens.value, tokenMax),
            max: tokenMax
          },
          macros: parseDomainCardTextMacros(cleanMarkdownText(card.text, { stripEmphasis: true, stripCodeTicks: true }))
        };
      }),
    features: character.sheetCards
      .filter(isCharacterFeatureSheetCard)
      .map((card) => ({
        id: card.id,
        name: card.name,
        subtitle: characterSheetCardSubtitle(card),
        text: card.text ?? ''
      })),
    inventory: character.inventory.map((item) => ({
      ...item,
      uses: item.uses ? { ...item.uses } : undefined
    })),
    wealth: { ...character.wealth },
    conditions: statusConditions(character.conditions).map((condition) => ({
      id: condition.id,
      name: condition.name,
      notes: condition.notes ?? ''
    })),
    scars: (character.scars ?? []).map((scar) => ({ ...scar }))
  };
}

function buildAdversarySummaries(encounter: EncounterState): Record<string, PlayerViewAdversarySummary> {
  return Object.fromEntries(Object.values(encounter.adversaries).map((adversary) => [adversary.id, buildAdversarySummary(adversary)]));
}

function characterSheetCardSubtitle(card: Pick<Character['sheetCards'][number], 'subtitle' | 'subclassTier'>): string {
  if (card.subclassTier) return subclassFeatureTierLabel(card.subclassTier);
  return subclassFeatureTierLabel(card.subtitle);
}

export function buildAdversarySummary(adversary: Adversary): PlayerViewAdversarySummary {
  const conditions = statusConditions(adversary.conditions ?? []);
  return {
    id: adversary.id,
    name: adversary.name,
    subtitle: adversarySubtitle(adversary),
    portraitUrl: adversary.imageUrl ?? '',
    tier: adversary.tier,
    type: adversary.type,
    difficulty: adversary.difficulty,
    attackModifier: adversary.attackModifier,
    thresholds: { ...adversary.thresholds },
    hp: { ...adversary.hp },
    stress: { ...adversary.stress },
    standardAttack: {
      name: adversary.standardAttack.name,
      range: rangeLabel(adversary.standardAttack.range),
      damage: adversary.standardAttack.damageFormula,
      damageType: adversary.standardAttack.damageType
    },
    experiences: adversary.experiences.map((experience) => ({
      id: experience.id,
      name: experience.name,
      modifier: experience.modifier
    })),
    features: adversary.features.map((feature) => ({
      id: feature.id,
      name: feature.name,
      kind: feature.kind,
      cost: feature.cost?.trim() ?? '',
      text: cleanAdversaryRulesText(feature.text)
    })),
    conditions: conditions.map((condition) => ({
      id: condition.id,
      name: condition.name,
      notes: condition.notes ?? ''
    })),
    notes: cleanAdversaryRulesText(adversaryDescriptionText(adversary))
  };
}

function statusConditions(conditions: Array<{ id: string; name: string; notes?: string }>): Array<{ id: string; name: string; notes?: string }> {
  return conditions
    .map((condition) => ({ ...condition, name: normalizeStatusTag(condition.name) }))
    .filter((condition) => condition.name);
}

function cleanAdversaryRulesText(value: string): string {
  return cleanMarkdownText(value, { emphasizeLinks: true });
}

function adversaryDescriptionText(adversary: Pick<Adversary, 'summary' | 'motives' | 'mainBody'>): string {
  return [
    adversary.summary,
    adversary.motives ? `Мотивы: ${adversary.motives}` : '',
    adversary.mainBody
  ].filter(Boolean).join('\n\n');
}
