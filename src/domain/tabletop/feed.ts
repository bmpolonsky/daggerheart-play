import { TRAIT_LABELS } from '../rules/constants';
import { cleanMarkdownText } from '../../core/utils/markdownText';
import { hasRolledDiceTerms } from '../rules/diceFormula';
import { actionOutcomeLabel, formatDualityBreakdown, formatDualityResult } from '../rules/rollPresentation';
import type { ActionRollOutcome, Countdown, GameHandout, Character, DeathMoveFeedRequest, DiceVisualTone, DomainCardRecord, FeedActorReference, FeedEntry, FormulaTermRoll, ManualDiceRollEntry, ModifierPart, RestFeedRequest, RollLogEntry, RollPublication, TeamworkRollRequest, TraitId } from '../rules/types';
import { canViewFeedEntry, canViewRollLogEntry, feedEntryPublication, rollLogEntryPublication } from './rollPublication';
import type { TableSyncRole, TableVisibility } from './types';

export type TableFeedItemKind = 'system' | 'message' | 'roll' | 'card' | 'feature' | 'handout' | 'rest' | 'teamwork' | 'deathMove' | 'countdownComposer' | 'wealth';

export interface TableFeedDieResult {
  sides: number;
  value: number;
  label?: string;
  tone?: string;
}

export interface TableFeedDualityDiceSummary {
  kind: 'duality';
  hope: TableFeedDieResult;
  fear: TableFeedDieResult;
  modifiers: ModifierPart[];
  modifierTotal: number;
  advantageRolls: number[];
  disadvantageRolls: number[];
  keptExtraDie: number;
  difficulty: number;
  success: boolean;
  isCritical: boolean;
  outcome: ActionRollOutcome;
}

export interface TableFeedFormulaDiceSummary {
  kind: 'formula';
  formula: string;
  terms: FormulaTermRoll[];
  diceTones?: DiceVisualTone[];
  critical?: boolean;
  criticalBonus?: number;
  damageType?: string;
}

export type TableFeedDiceSummary = TableFeedDualityDiceSummary | TableFeedFormulaDiceSummary;

export interface TableFeedRollSummary {
  rollType?: RollLogEntry['type'];
  kind: string;
  title: string;
  detail: string;
  note?: string;
  tone: string;
  total: number | null;
  actorName?: string;
  actorId?: string;
  hasAnimatedDice: boolean;
  dice?: TableFeedDiceSummary;
}

export type CountdownComposerDraft = Pick<Countdown, 'name' | 'current' | 'max' | 'visibility'>;

export interface TableFeedFeaturePreview {
  id: string;
  name: string;
  subtitle?: string;
  text: string;
  sourceLabel?: string;
}

export interface TableFeedWealthEditor {
  characterId: string;
}

export interface TableFeedItem {
  id: string;
  kind: TableFeedItemKind;
  createdAt: string;
  authorName: string;
  kicker: string;
  title: string;
  body: string;
  tone: string;
  card?: DomainCardRecord;
  feature?: TableFeedFeaturePreview;
  actor?: FeedActorReference;
  handout?: Pick<GameHandout, 'id' | 'title' | 'body' | 'imageUrl'>;
  rest?: RestFeedRequest;
  teamwork?: TeamworkRollRequest;
  deathMove?: DeathMoveFeedRequest;
  countdownComposer?: CountdownComposerDraft;
  wealthEditor?: TableFeedWealthEditor;
  roll?: TableFeedRollSummary;
  rollId?: string;
  publication: RollPublication;
  ephemeral?: boolean;
}

export interface BuildTableFeedInput {
  rollLog: RollLogEntry[];
  characters: Character[];
  maxItems?: number;
  role?: TableSyncRole;
  actorId?: string | null;
}

export function buildTableFeed(input: BuildTableFeedInput): TableFeedItem[] {
  const cards = input.characters.flatMap((character) => character.domainCards.map((card) => ({ card, character })));
  const maxItems = input.maxItems ?? 12;
  const visibleRollLog = input.rollLog.filter((entry) => canViewRollLogEntry(entry, { role: input.role, actorId: input.actorId }));
  const items = visibleRollLog.slice(0, maxItems).map((entry) => {
    if (entry.type === 'manual') {
      if (isManualDiceEntry(entry)) {
        return buildManualDiceFeedItem(entry);
      }
      const cardMatch = cards.find(({ card }) => entry.text.toLowerCase().includes(card.name.toLowerCase()) || entry.title.toLowerCase().includes(card.name.toLowerCase()));
      if (cardMatch && isCardEvent(entry)) {
        return buildCardFeedItem(entry, cardMatch.card, cardMatch.character);
      }
      return {
        id: entry.id,
        kind: 'message' as const,
        createdAt: entry.createdAt,
        authorName: entry.title || 'Игра',
        kicker: 'Сообщение',
        title: entry.title,
        body: entry.text,
        tone: 'neutral',
        publication: rollLogEntryPublication(entry)
      };
    }
    return buildRollFeedItem(entry);
  });

  if (items.length > 0) return items;
  return emptyFeed();
}

export interface BuildTableFeedFromEntriesInput {
  feed: FeedEntry[];
  role?: TableSyncRole;
  actorId?: string | null;
  maxItems?: number;
}

export function buildTableFeedFromEntries(input: BuildTableFeedFromEntriesInput): TableFeedItem[] {
  const role = input.role ?? 'player';
  const visibleFeed = input.feed.filter((entry) => canViewFeedEntry(entry, { role, actorId: input.actorId }));
  const items = (typeof input.maxItems === 'number' ? visibleFeed.slice(0, input.maxItems) : visibleFeed)
    .map(feedEntryToTableFeedItem);

  return items;
}

export function createFeedEntryFromRollLogEntry(entry: RollLogEntry, visibility: TableVisibility = rollLogEntryVisibility(entry)): FeedEntry {
  const publication = rollLogEntryPublication(entry);
  if (entry.type === 'manual' && !isManualDiceEntry(entry)) {
    return {
      id: `feed-${entry.id}`,
      type: 'message',
      createdAt: entry.createdAt,
      visibility,
      publication,
      authorName: entry.title || 'Игра',
      title: entry.title,
      body: entry.text
    };
  }

  const view = entry.type === 'manual' ? buildManualDiceFeedItem(entry) : buildRollFeedItem(entry);
  return {
    id: `feed-${entry.id}`,
    type: 'roll',
    createdAt: entry.createdAt,
    visibility,
    publication,
    authorName: view.authorName,
    title: view.title,
    body: view.body,
    roll: entry
  };
}

export function createFeedEntriesFromRollLog(rollLog: RollLogEntry[]): FeedEntry[] {
  return rollLog.map((entry) => createFeedEntryFromRollLogEntry(entry));
}

export function buildHandoutFeedItem(handout: Pick<GameHandout, 'id' | 'title' | 'body' | 'imageUrl'>): TableFeedItem {
  return {
    id: `handout-${handout.id}`,
    kind: 'handout',
    createdAt: '',
    authorName: 'Мастер',
    kicker: 'Материал',
    title: handout.title,
    body: handout.body?.trim() || 'Материал показан игрокам.',
    tone: 'hope',
    handout,
    publication: 'public'
  };
}

export function buildHandoutDraftFeedItem(input: {
  id: string;
  createdAt: string;
  handout: Pick<GameHandout, 'id' | 'title' | 'body' | 'imageUrl'>;
}): TableFeedItem {
  return {
    id: input.id,
    kind: 'handout',
    createdAt: input.createdAt,
    authorName: 'Мастер',
    kicker: 'Раздатка',
    title: input.handout.title || 'Без названия',
    body: input.handout.body?.trim() || 'Материал показан игрокам.',
    tone: 'hope',
    handout: input.handout,
    publication: 'private',
    ephemeral: true
  };
}

export function buildDomainCardPreviewFeedItem(input: {
  id: string;
  createdAt: string;
  authorName: string;
  card: DomainCardRecord;
  actor?: FeedActorReference;
}): TableFeedItem {
  return {
    id: input.id,
    kind: 'card',
    createdAt: input.createdAt,
    authorName: input.authorName.trim() || 'Игра',
    kicker: 'Карта домена',
    title: input.card.name,
    body: input.card.text || `${input.card.name}: описание карты не заполнено.`,
    tone: 'hope',
    card: input.card,
    actor: input.actor,
    publication: 'private',
    ephemeral: true
  };
}

export function buildCharacterFeaturePreviewFeedItem(input: {
  id: string;
  createdAt: string;
  authorName: string;
  feature: TableFeedFeaturePreview;
  actor?: FeedActorReference;
}): TableFeedItem {
  const feature = {
    ...input.feature,
    subtitle: input.feature.subtitle ? cleanMarkdownText(input.feature.subtitle, { emphasizeLinks: true }) : input.feature.subtitle,
    text: cleanMarkdownText(input.feature.text, { emphasizeLinks: true })
  };
  return {
    id: input.id,
    kind: 'feature',
    createdAt: input.createdAt,
    authorName: input.authorName.trim() || 'Игра',
    kicker: feature.sourceLabel ?? 'Особенность',
    title: feature.name,
    body: feature.text || feature.subtitle || `${feature.name}: описание не заполнено.`,
    tone: 'hope',
    feature,
    actor: input.actor,
    publication: 'private',
    ephemeral: true
  };
}

export function buildWealthEditorFeedItem(input: {
  id: string;
  createdAt: string;
  authorName: string;
  characterId: string;
  actor?: FeedActorReference;
}): TableFeedItem {
  return {
    id: input.id,
    kind: 'wealth',
    createdAt: input.createdAt,
    authorName: input.authorName.trim() || 'Игра',
    kicker: 'Инвентарь',
    title: 'Деньги',
    body: 'Редактирование денег.',
    tone: 'hope',
    actor: input.actor,
    wealthEditor: {
      characterId: input.characterId
    },
    publication: 'private',
    ephemeral: true
  };
}

export function buildCountdownComposerFeedItem(input: {
  id: string;
  createdAt: string;
  draft?: Partial<CountdownComposerDraft>;
}): TableFeedItem {
  const max = Math.max(1, Math.min(20, Math.trunc(input.draft?.max ?? 4)));
  const current = Math.max(0, Math.min(max, Math.trunc(input.draft?.current ?? 0)));
  return {
    id: input.id,
    kind: 'countdownComposer',
    createdAt: input.createdAt,
    authorName: 'Мастер',
    kicker: 'Действие',
    title: 'Новый отсчет',
    body: 'Приватная настройка отсчета.',
    tone: 'neutral',
    countdownComposer: {
      name: input.draft?.name ?? '',
      current,
      max,
      visibility: input.draft?.visibility ?? 'gm'
    },
    publication: 'private',
    ephemeral: true
  };
}

function feedEntryToTableFeedItem(entry: FeedEntry): TableFeedItem {
  if (entry.type === 'roll') {
    if (entry.roll.type === 'manual' && isManualDiceEntry(entry.roll)) {
      return { ...buildManualDiceFeedItem(entry.roll), id: entry.id, publication: feedEntryPublication(entry) };
    }
    if (entry.roll.type !== 'manual') {
      return { ...buildRollFeedItem(entry.roll), id: entry.id, publication: feedEntryPublication(entry) };
    }
  }
  if (entry.type === 'card') {
    return {
      id: entry.id,
      kind: 'card',
      createdAt: entry.createdAt,
      authorName: entry.authorName,
      kicker: entry.title,
      title: entry.card.name,
      body: entry.body,
      tone: 'hope',
      card: entry.card,
      actor: entry.actor,
      publication: feedEntryPublication(entry)
    };
  }
  if (entry.type === 'handout') {
    return {
      id: entry.id,
      kind: 'handout',
      createdAt: entry.createdAt,
      authorName: entry.authorName,
      kicker: entry.title,
      title: entry.handout.title,
      body: entry.body || 'Материал показан игрокам.',
      tone: 'hope',
      handout: entry.handout,
      publication: feedEntryPublication(entry)
    };
  }
  if (entry.type === 'rest') {
    return buildRestFeedItem(entry);
  }
  if (entry.type === 'teamwork') {
    return buildTeamworkFeedItem(entry);
  }
  if (entry.type === 'deathMove') {
    return buildDeathMoveFeedItem(entry);
  }
  return {
    id: entry.id,
    kind: entry.type,
    createdAt: entry.createdAt,
    authorName: entry.authorName,
    kicker: entry.type === 'system' ? 'Система' : 'Сообщение',
    title: entry.title,
    body: entry.body,
    tone: 'neutral',
    publication: feedEntryPublication(entry)
  };
}

function buildRestFeedItem(entry: Extract<FeedEntry, { type: 'rest' }>): TableFeedItem {
  const readyCount = entry.rest.participants.filter((participant) => participant.ready).length;
  const participantCount = entry.rest.participants.length;
  const statusLabel = restStatusLabel(entry.rest.status);
  const restTypeLabel = entry.rest.restType === 'short' ? 'Короткий отдых' : 'Продолжительный отдых';
  return {
    id: entry.id,
    kind: 'rest',
    createdAt: entry.createdAt,
    authorName: entry.authorName,
    kicker: statusLabel,
    title: restTypeLabel,
    body: participantCount > 0
      ? `${readyCount}/${participantCount} участников готовы. Каждый выбирает ${entry.rest.maxChoicesPerParticipant}.`
      : entry.body,
    tone: entry.rest.status === 'resolved' ? 'hope' : entry.rest.status === 'cancelled' ? 'danger' : 'neutral',
    rest: entry.rest,
    publication: feedEntryPublication(entry)
  };
}

function buildTeamworkFeedItem(entry: Extract<FeedEntry, { type: 'teamwork' }>): TableFeedItem {
  const rolledCount = entry.teamwork.participants.filter((participant) => participant.result).length;
  const participantCount = entry.teamwork.participants.length;
  const title = entry.teamwork.kind === 'groupAction' ? 'Групповой бросок' : 'Командный бросок';
  return {
    id: entry.id,
    kind: 'teamwork',
    createdAt: entry.createdAt,
    authorName: entry.authorName,
    kicker: teamworkStatusLabel(entry.teamwork.status),
    title,
    body: participantCount > 0
      ? `${rolledCount}/${participantCount} участников бросили. Сложность ${entry.teamwork.difficulty}.`
      : entry.body,
    tone: entry.teamwork.status === 'resolved' ? 'hope' : entry.teamwork.status === 'cancelled' ? 'danger' : 'neutral',
    teamwork: entry.teamwork,
    publication: feedEntryPublication(entry)
  };
}

function buildDeathMoveFeedItem(entry: Extract<FeedEntry, { type: 'deathMove' }>): TableFeedItem {
  return {
    id: entry.id,
    kind: 'deathMove',
    createdAt: entry.createdAt,
    authorName: entry.authorName,
    kicker: deathMoveStatusLabel(entry.deathMove.status),
    title: 'Предсмертный ход',
    body: entry.body,
    tone: entry.deathMove.status === 'resolved'
      ? (entry.deathMove.roll?.outcome === 'fear' ? 'danger' : 'hope')
      : 'neutral',
    deathMove: entry.deathMove,
    publication: feedEntryPublication(entry)
  };
}

function buildCardFeedItem(entry: Extract<RollLogEntry, { type: 'manual' }>, card: DomainCardRecord, character: Character): TableFeedItem {
  return {
    id: entry.id,
    kind: 'card',
    createdAt: entry.createdAt,
    authorName: character.name,
    kicker: entry.title,
    title: card.name,
    body: entry.text,
    tone: entry.title.includes('не') ? 'danger' : 'hope',
    card,
    publication: rollLogEntryPublication(entry)
  };
}

function buildRollFeedItem(entry: Exclude<RollLogEntry, { type: 'manual' }>): TableFeedItem {
  const roll = rollSummary(entry);
  return {
    id: entry.id,
    kind: 'roll',
    createdAt: entry.createdAt,
    authorName: roll.actorName ?? 'Игра',
    kicker: roll.kind,
    title: roll.title,
    body: roll.detail,
    tone: roll.tone,
    rollId: entry.id,
    roll,
    publication: rollLogEntryPublication(entry)
  };
}

function buildManualDiceFeedItem(entry: ManualDiceRollEntry): TableFeedItem {
  const actorName = entry.actorName ?? entry.title;
  const label = manualDiceLabel(entry.label, actorName, entry.formula);
  const roll: TableFeedRollSummary = {
    rollType: entry.type,
    kind: actorName,
    title: `${label}: ${entry.total}`,
    detail: entry.text,
    note: entry.notes,
    tone: 'neutral',
    total: entry.total,
    actorId: entry.actorId,
    actorName,
    hasAnimatedDice: hasRolledDiceTerms(entry.terms),
    dice: {
      kind: 'formula',
      formula: entry.formula,
      terms: entry.terms,
      diceTones: entry.diceTones
    }
  };
  return {
    id: entry.id,
    kind: 'roll',
    createdAt: entry.createdAt,
    authorName: roll.actorName ?? 'Игра',
    kicker: roll.kind,
    title: roll.title,
    body: roll.detail,
    tone: roll.tone,
    rollId: entry.id,
    roll,
    publication: rollLogEntryPublication(entry)
  };
}

function manualDiceLabel(label: string | undefined, actorName: string, formula: string): string {
  const trimmed = label?.trim();
  if (!trimmed) return formula;
  const actorPrefix = `${actorName}:`;
  if (trimmed.toLocaleLowerCase().startsWith(actorPrefix.toLocaleLowerCase())) {
    return trimmed.slice(actorPrefix.length).trim() || formula;
  }
  return trimmed;
}

function rollSummary(entry: Exclude<RollLogEntry, { type: 'manual' }>): TableFeedRollSummary {
  if (entry.type === 'action' || entry.type === 'reaction') {
    const context = entry.trait ? `${TRAIT_LABELS[entry.trait as TraitId]} / ` : '';
    if (entry.type === 'reaction') {
      return {
        rollType: entry.type,
        kind: entry.difficulty > 0 ? 'Бросок реакции' : 'Реакция',
        title: `${entry.actorName}: ${entry.total}`,
        detail: `${context}${formatDualityBreakdown(entry)}`,
        note: entry.notes,
        tone: entry.difficulty > 0 ? (entry.success ? 'hope' : 'fear') : 'neutral',
        total: entry.total,
        actorId: entry.actorId,
        actorName: entry.actorName,
        hasAnimatedDice: false,
        dice: dualityDiceSummary(entry)
      };
    }
    return {
      rollType: entry.type,
      kind: entry.difficulty > 0 ? actionOutcomeLabel(entry.outcome) : 'Бросок действия',
      title: `${entry.actorName}: ${formatDualityResult(entry)}`,
      detail: `${context}${formatDualityBreakdown(entry)}`,
      note: entry.notes,
      tone: entry.difficulty > 0 ? (entry.success ? 'hope' : 'fear') : (entry.hopeDie >= entry.fearDie ? 'hope' : 'fear'),
      total: entry.total,
      actorId: entry.actorId,
      actorName: entry.actorName,
      hasAnimatedDice: true,
      dice: dualityDiceSummary(entry)
    };
  }
  if (entry.type === 'damage') {
    return {
      rollType: entry.type,
      kind: 'Урон',
      title: entry.actorName,
      detail: entry.formula,
      note: entry.notes,
      tone: 'damage',
      total: entry.total,
      actorId: entry.actorId,
      actorName: entry.actorName,
      hasAnimatedDice: hasRolledDiceTerms(entry.terms),
      dice: {
        kind: 'formula',
        formula: entry.formula,
        terms: entry.terms,
        critical: entry.critical,
        criticalBonus: entry.criticalBonus,
        damageType: entry.damageType
      }
    };
  }
  const exhaustive: never = entry;
  return exhaustive;
}

function dualityDiceSummary(entry: Extract<RollLogEntry, { type: 'action' | 'reaction' }>): TableFeedDualityDiceSummary {
  return {
    kind: 'duality',
    hope: { sides: 12, value: entry.hopeDie, label: 'hope', tone: 'hope' },
    fear: { sides: 12, value: entry.fearDie, label: 'fear', tone: 'fear' },
    modifiers: entry.modifiers,
    modifierTotal: entry.modifiers.reduce((sum, modifier) => sum + modifier.value, 0),
    advantageRolls: entry.advantageRolls,
    disadvantageRolls: entry.disadvantageRolls,
    keptExtraDie: entry.keptExtraDie,
    difficulty: entry.difficulty,
    success: entry.success,
    isCritical: entry.isCritical,
    outcome: entry.outcome
  };
}

function restStatusLabel(status: RestFeedRequest['status']): string {
  if (status === 'resolved') return 'Отдых завершён';
  if (status === 'cancelled') return 'Отдых отменён';
  if (status === 'collecting') return 'Выбор отдыха';
  return 'Запрос отдыха';
}

function teamworkStatusLabel(status: TeamworkRollRequest['status']): string {
  if (status === 'resolved') return 'Завершён';
  if (status === 'cancelled') return 'Отменён';
  if (status === 'collecting') return 'Броски участников';
  return 'Действие';
}

function deathMoveStatusLabel(status: DeathMoveFeedRequest['status']): string {
  if (status === 'resolved') return 'Предсмертный ход завершён';
  if (status === 'cancelled') return 'Предсмертный ход отменён';
  return 'Предсмертный ход';
}

function isCardEvent(entry: Extract<RollLogEntry, { type: 'manual' }>): boolean {
  const text = `${entry.title} ${entry.text}`.toLowerCase();
  return text.includes('карт') || text.includes('card') || text.includes('эффект');
}

function isManualDiceEntry(entry: Extract<RollLogEntry, { type: 'manual' }>): entry is ManualDiceRollEntry {
  return 'terms' in entry && 'total' in entry && 'formula' in entry;
}

function emptyFeed(): TableFeedItem[] {
  return [{
    id: 'feed-empty',
    kind: 'system',
    createdAt: '',
    authorName: 'Система',
    kicker: 'Игра готова',
    title: 'Пока тихо',
    body: 'Броски, карты и сообщения появятся здесь во время сцены.',
    tone: 'neutral',
    publication: 'public'
  }];
}

function rollLogEntryVisibility(entry: RollLogEntry): TableVisibility {
  return rollLogEntryPublication(entry) === 'public' ? 'public' : 'gm';
}
