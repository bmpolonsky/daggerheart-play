import { createId } from '../core/utils/id';
import { nowIso } from '../core/utils/date';
import { REST_RULES } from '../domain/rules/rest';
import type { GameHandout, DeathMoveChoice, DeathMoveFeedEntry, DeathMoveFeedRequest, DeathMoveFeedStatus, DeathMoveRollResult, DomainCardRecord, FeedActorReference, FeedEntry, RestChoiceResult, RestChoiceStatus, RestFeedChoice, RestFeedEntry, RestFeedParticipant, RestFeedRequest, RestFeedStatus, RollLogEntry, RollPublication, TeamworkRollActorOption, TeamworkRollFeedEntry, TeamworkRollKind, TeamworkRollParticipant, TeamworkRollParticipantRequest, TeamworkRollParticipantRole, TeamworkRollRequest, TeamworkRollResult, TeamworkRollStatus, TraitId } from '../domain/rules/types';
import type { RestFearPlan } from '../domain/rules/rest';
import type { TableVisibility } from '../domain/tabletop/types';
import { createFeedEntryFromRollLogEntry } from '../domain/tabletop/feed';
import { legacyVisibilityForPublication, normalizeRollPublication } from '../domain/tabletop/rollPublication';
import { feedStore, rollLogStore } from '../stores/gameStores';

const MAX_FEED_ENTRIES = 200;

interface FeedEntryOptions {
  visibility?: TableVisibility;
  publication?: RollPublication;
  title?: string;
  actor?: FeedActorReference;
}

interface RestChoiceInput {
  id: string;
  label: string;
  count?: number;
  status?: RestChoiceStatus;
}

interface RestParticipantInput {
  actorId: string;
  actorName: string;
  playerId?: string;
  ready?: boolean;
  choices?: RestChoiceInput[];
}

interface RequestRestOptions extends FeedEntryOptions {
  id?: string;
  status?: RestFeedStatus;
  requestedBy?: FeedActorReference;
  participants?: RestParticipantInput[];
  availableMoves?: string[];
  maxChoicesPerParticipant?: number;
}

interface RequestTeamworkRollOptions extends FeedEntryOptions {
  id?: string;
  kind: TeamworkRollKind;
  status?: TeamworkRollStatus;
  requestedBy?: FeedActorReference;
  difficulty?: number;
  prompt?: string;
  participants?: TeamworkRollActorOption[];
  availableActors?: TeamworkRollActorOption[];
}

interface RequestDeathMoveOptions extends FeedEntryOptions {
  id?: string;
  actor: FeedActorReference;
  status?: DeathMoveFeedStatus;
  dedupe?: boolean;
}

interface UpdateDeathMoveInput {
  status?: DeathMoveFeedStatus;
  choice?: DeathMoveChoice;
  roll?: DeathMoveRollResult;
}

export class FeedService {
  readonly feed$ = feedStore.toStream();

  append(entry: FeedEntry): void {
    feedStore.update((feed) => [entry, ...feed].slice(0, MAX_FEED_ENTRIES));
  }

  receiveRemote(entry: FeedEntry): FeedEntry {
    feedStore.update((feed) => {
      const existing = feed.findIndex((item) => item.id === entry.id);
      if (existing >= 0) {
        return feed.map((item) => (item.id === entry.id ? entry : item));
      }
      return [entry, ...feed].slice(0, MAX_FEED_ENTRIES);
    });
    return entry;
  }

  addMessage(authorName: string, body: string, options: FeedEntryOptions = {}): FeedEntry {
    const publication = normalizeRollPublication(options.publication, options.visibility);
    const entry: FeedEntry = {
      id: createId('feed'),
      type: 'message',
      createdAt: nowIso(),
      visibility: legacyVisibilityForPublication(publication),
      publication,
      authorName: authorName.trim() || 'Игра',
      title: options.title?.trim() || authorName.trim() || 'Сообщение',
      body
    };
    this.append(entry);
    return entry;
  }

  addSystem(title: string, body: string, options: Pick<FeedEntryOptions, 'visibility' | 'publication'> = {}): FeedEntry {
    const publication = normalizeRollPublication(options.publication, options.visibility);
    const entry: FeedEntry = {
      id: createId('feed'),
      type: 'system',
      createdAt: nowIso(),
      visibility: legacyVisibilityForPublication(publication),
      publication,
      authorName: 'Система',
      title: title.trim() || 'Событие игры',
      body
    };
    this.append(entry);
    return entry;
  }

  addRoll(roll: RollLogEntry, visibility?: TableVisibility): FeedEntry {
    const entry = createFeedEntryFromRollLogEntry(roll, visibility);
    this.append(entry);
    return entry;
  }

  updatePublication(entryId: string, publication: RollPublication): FeedEntry | null {
    const normalizedPublication = normalizeRollPublication(publication);
    const visibility = legacyVisibilityForPublication(normalizedPublication);
    let updatedEntry: FeedEntry | null = null;
    let rollId: string | null = null;

    feedStore.update((feed) => feed.map((entry) => {
      const matches = entry.id === entryId || (entry.type === 'roll' && entry.roll.id === entryId);
      if (!matches) return entry;
      const next = updateFeedEntryPublication(entry, normalizedPublication, visibility);
      updatedEntry = next;
      rollId = next.type === 'roll' ? next.roll.id : null;
      return next;
    }));

    if (rollId) {
      rollLogStore.update((rollLog) => rollLog.map((entry) => (
        entry.id === rollId ? updateRollLogEntryPublication(entry, normalizedPublication, visibility) : entry
      )));
    }

    return updatedEntry;
  }

  revealToPublic(entryId: string): FeedEntry | null {
    const normalizedPublication = normalizeRollPublication('public');
    const visibility = legacyVisibilityForPublication(normalizedPublication);
    const linkedRollIds = linkedRollIdsForReveal(entryId);
    let updatedEntry: FeedEntry | null = null;

    feedStore.update((feed) => feed.map((entry) => {
      const matchesEntry = entry.id === entryId;
      const matchesRoll = entry.type === 'roll' && linkedRollIds.has(entry.roll.id);
      if (!matchesEntry && !matchesRoll) return entry;
      const next = updateFeedEntryPublication(entry, normalizedPublication, visibility);
      if (matchesEntry || !updatedEntry) {
        updatedEntry = next;
      }
      return next;
    }));

    if (linkedRollIds.size > 0) {
      rollLogStore.update((rollLog) => rollLog.map((entry) => (
        linkedRollIds.has(entry.id) ? updateRollLogEntryPublication(entry, normalizedPublication, visibility) : entry
      )));
    }

    return updatedEntry;
  }

  addCard(authorName: string, card: DomainCardRecord, body: string, options: FeedEntryOptions = {}): FeedEntry {
    const publication = normalizeRollPublication(options.publication, options.visibility);
    const entry: FeedEntry = {
      id: createId('feed'),
      type: 'card',
      createdAt: nowIso(),
      visibility: legacyVisibilityForPublication(publication),
      publication,
      authorName: authorName.trim() || 'Игра',
      title: options.title?.trim() || 'Карта',
      body,
      card,
      actor: options.actor
    };
    this.append(entry);
    return entry;
  }

  requestRest(restType: 'short' | 'long', options: RequestRestOptions = {}): RestFeedEntry {
    const publication = normalizeRollPublication(options.publication, options.visibility);
    const rules = REST_RULES[restType];
    const createdAt = nowIso();
    const requestId = options.id ?? createId('rest');
    const maxChoicesPerParticipant = Math.max(1, Math.trunc(options.maxChoicesPerParticipant ?? 2));
    const entry: RestFeedEntry = {
      id: createId('feed'),
      type: 'rest',
      createdAt,
      visibility: legacyVisibilityForPublication(publication),
      publication,
      authorName: options.requestedBy?.actorName ?? options.actor?.actorName ?? 'Мастер',
      title: options.title?.trim() || rules.title,
      body: rules.description,
      rest: {
        id: requestId,
        restType,
        status: options.status ?? 'requested',
        requestedAt: createdAt,
        requestedBy: options.requestedBy ?? options.actor,
        participants: normalizeRestParticipants(options.participants ?? []),
        availableMoves: options.availableMoves ?? rules.moves,
        maxChoicesPerParticipant
      }
    };
    this.append(entry);
    return entry;
  }

  updateRestParticipantChoices(restEntryId: string, actorId: string, choices: string[]): RestFeedEntry | null {
    let updatedEntry: RestFeedEntry | null = null;

    feedStore.update((feed) => feed.map((entry) => {
      if (entry.type !== 'rest' || !matchesRestEntry(entry, restEntryId)) return entry;
      const participantIndex = entry.rest.participants.findIndex((participant) => participant.actorId === actorId);
      if (participantIndex < 0 || entry.rest.status === 'resolved' || entry.rest.status === 'cancelled') return entry;
      const rest = updateRestChoices(entry.rest, participantIndex, choices);
      updatedEntry = { ...entry, rest };
      return updatedEntry;
    }));

    return updatedEntry;
  }

  resolveRestParticipantChoice(restEntryId: string, actorId: string, choiceId: string, result: RestChoiceResult): RestFeedEntry | null {
    let updatedEntry: RestFeedEntry | null = null;

    feedStore.update((feed) => feed.map((entry) => {
      if (entry.type !== 'rest' || !matchesRestEntry(entry, restEntryId)) return entry;
      if (entry.rest.status === 'cancelled') return entry;
      const rest: RestFeedRequest = {
        ...entry.rest,
        participants: entry.rest.participants.map((participant) => {
          if (participant.actorId !== actorId) return participant;
          return {
            ...participant,
            choices: participant.choices.map((choice) => (
              choice.id === choiceId ? { ...choice, status: 'resolved', result } : choice
            ))
          };
        })
      };
      updatedEntry = { ...entry, rest };
      return updatedEntry;
    }));

    return updatedEntry;
  }

  completeRest(restEntryId: string, fearPlan: RestFearPlan): RestFeedEntry | null {
    let updatedEntry: RestFeedEntry | null = null;
    const resolvedAt = nowIso();

    feedStore.update((feed) => feed.map((entry) => {
      if (entry.type !== 'rest' || !matchesRestEntry(entry, restEntryId)) return entry;
      const rest: RestFeedRequest = {
        ...entry.rest,
        status: 'resolved',
        fearPlan,
        resolvedAt,
        participants: entry.rest.participants.map((participant) => ({
          ...participant,
          ready: participant.ready || countRestChoices(participant.choices) >= entry.rest.maxChoicesPerParticipant,
          choices: participant.choices.map((choice) => ({ ...choice, status: 'resolved' }))
        }))
      };
      updatedEntry = { ...entry, rest };
      return updatedEntry;
    }));

    return updatedEntry;
  }

  requestTeamworkRoll(options: RequestTeamworkRollOptions): TeamworkRollFeedEntry {
    const publication = normalizeRollPublication(options.publication, options.visibility);
    const createdAt = nowIso();
    const kindLabel = teamworkKindLabel(options.kind);
    const entry: TeamworkRollFeedEntry = {
      id: createId('feed'),
      type: 'teamwork',
      createdAt,
      visibility: legacyVisibilityForPublication(publication),
      publication,
      authorName: options.requestedBy?.actorName ?? options.actor?.actorName ?? 'Мастер',
      title: options.title?.trim() || kindLabel,
      body: options.prompt?.trim() || teamworkDefaultPrompt(options.kind),
      teamwork: {
        id: options.id ?? createId('teamwork'),
        kind: options.kind,
        status: options.status ?? 'draft',
        requestedAt: createdAt,
        requestedBy: options.requestedBy ?? options.actor,
        difficulty: clampDifficulty(options.difficulty ?? 12),
        prompt: options.prompt?.trim() || undefined,
        participants: normalizeTeamworkParticipants(options.kind, options.participants ?? []),
        availableActors: normalizeTeamworkActorOptions(options.availableActors ?? options.participants ?? [])
      }
    };
    this.append(entry);
    return entry;
  }

  updateTeamworkRollParticipants(teamworkEntryId: string, participants: TeamworkRollActorOption[]): TeamworkRollFeedEntry | null {
    let updatedEntry: TeamworkRollFeedEntry | null = null;
    feedStore.update((feed) => feed.map((entry) => {
      if (entry.type !== 'teamwork' || !matchesTeamworkEntry(entry, teamworkEntryId) || isTeamworkClosed(entry.teamwork)) return entry;
      const teamwork: TeamworkRollRequest = {
        ...entry.teamwork,
        status: participants.length > 0 ? 'collecting' : 'draft',
        participants: normalizeTeamworkParticipants(entry.teamwork.kind, participants)
      };
      updatedEntry = { ...entry, teamwork };
      return updatedEntry;
    }));
    return updatedEntry;
  }

  updateTeamworkParticipantRole(teamworkEntryId: string, actorId: string, role: TeamworkRollParticipantRole): TeamworkRollFeedEntry | null {
    let updatedEntry: TeamworkRollFeedEntry | null = null;
    feedStore.update((feed) => feed.map((entry) => {
      if (entry.type !== 'teamwork' || !matchesTeamworkEntry(entry, teamworkEntryId) || isTeamworkClosed(entry.teamwork)) return entry;
      const teamwork: TeamworkRollRequest = {
        ...entry.teamwork,
        participants: updateTeamworkRole(entry.teamwork.kind, entry.teamwork.participants, actorId, role)
      };
      updatedEntry = { ...entry, teamwork };
      return updatedEntry;
    }));
    return updatedEntry;
  }

  recordTeamworkParticipantResult(teamworkEntryId: string, actorId: string, result: TeamworkRollResult): TeamworkRollFeedEntry | null {
    let updatedEntry: TeamworkRollFeedEntry | null = null;
    feedStore.update((feed) => feed.map((entry) => {
      if (entry.type !== 'teamwork' || !matchesTeamworkEntry(entry, teamworkEntryId) || isTeamworkClosed(entry.teamwork)) return entry;
      if (!entry.teamwork.participants.some((participant) => participant.actorId === actorId)) return entry;
      const teamwork: TeamworkRollRequest = {
        ...entry.teamwork,
        status: 'collecting',
        participants: entry.teamwork.participants.map((participant) => (
          participant.actorId === actorId ? { ...participant, pendingRoll: undefined, result } : participant
        ))
      };
      updatedEntry = { ...entry, teamwork };
      return updatedEntry;
    }));
    return updatedEntry;
  }

  requestTeamworkParticipantRoll(teamworkEntryId: string, actorId: string, trait?: TraitId): TeamworkRollFeedEntry | null {
    let updatedEntry: TeamworkRollFeedEntry | null = null;
    const requestedAt = nowIso();
    feedStore.update((feed) => feed.map((entry) => {
      if (entry.type !== 'teamwork' || !matchesTeamworkEntry(entry, teamworkEntryId) || isTeamworkClosed(entry.teamwork)) return entry;
      if (!entry.teamwork.participants.some((participant) => participant.actorId === actorId && !participant.result)) return entry;
      const pendingRoll: TeamworkRollParticipantRequest = {
        trait,
        requestedAt,
        status: 'pending'
      };
      const teamwork: TeamworkRollRequest = {
        ...entry.teamwork,
        status: 'collecting',
        participants: entry.teamwork.participants.map((participant) => (
          participant.actorId === actorId ? { ...participant, pendingRoll } : participant
        ))
      };
      updatedEntry = { ...entry, teamwork };
      return updatedEntry;
    }));
    return updatedEntry;
  }

  rejectTeamworkParticipantRoll(teamworkEntryId: string, actorId: string): TeamworkRollFeedEntry | null {
    let updatedEntry: TeamworkRollFeedEntry | null = null;
    feedStore.update((feed) => feed.map((entry) => {
      if (entry.type !== 'teamwork' || !matchesTeamworkEntry(entry, teamworkEntryId) || isTeamworkClosed(entry.teamwork)) return entry;
      const teamwork: TeamworkRollRequest = {
        ...entry.teamwork,
        participants: entry.teamwork.participants.map((participant) => (
          participant.actorId === actorId && participant.pendingRoll
            ? { ...participant, pendingRoll: { ...participant.pendingRoll, status: 'rejected' } }
            : participant
        ))
      };
      updatedEntry = { ...entry, teamwork };
      return updatedEntry;
    }));
    return updatedEntry;
  }

  completeTeamworkRoll(teamworkEntryId: string): TeamworkRollFeedEntry | null {
    let updatedEntry: TeamworkRollFeedEntry | null = null;
    const resolvedAt = nowIso();
    feedStore.update((feed) => feed.map((entry) => {
      if (entry.type !== 'teamwork' || !matchesTeamworkEntry(entry, teamworkEntryId)) return entry;
      const teamwork: TeamworkRollRequest = { ...entry.teamwork, status: 'resolved', resolvedAt };
      updatedEntry = { ...entry, teamwork };
      return updatedEntry;
    }));
    return updatedEntry;
  }

  requestDeathMove(options: RequestDeathMoveOptions): DeathMoveFeedEntry {
    if (options.dedupe !== false) {
      const existing = this.findOpenDeathMove(options.actor.actorId);
      if (existing) return existing;
    }
    const publication = normalizeRollPublication(options.publication ?? 'public', options.visibility);
    const createdAt = nowIso();
    const entry: DeathMoveFeedEntry = {
      id: createId('feed'),
      type: 'deathMove',
      createdAt,
      visibility: legacyVisibilityForPublication(publication),
      publication,
      authorName: options.actor.actorName || 'Персонаж',
      title: options.title?.trim() || 'Предсмертный ход',
      body: 'Выберите исход предсмертного хода на карточке.',
      deathMove: {
        id: options.id ?? createId('death-move'),
        status: options.status ?? 'pending',
        requestedAt: createdAt,
        actor: options.actor
      }
    };
    this.append(entry);
    return entry;
  }

  cancelOpenDeathMoves(actorId: string | undefined): number {
    if (!actorId) return 0;
    let changed = 0;
    const resolvedAt = nowIso();
    feedStore.update((feed) => feed.map((entry) => {
      if (
        entry.type !== 'deathMove' ||
        entry.deathMove.actor.actorId !== actorId ||
        entry.deathMove.status === 'resolved' ||
        entry.deathMove.status === 'cancelled'
      ) {
        return entry;
      }
      changed += 1;
      return {
        ...entry,
        deathMove: {
          ...entry.deathMove,
          status: 'cancelled',
          resolvedAt
        }
      };
    }));
    return changed;
  }

  updateDeathMove(deathMoveEntryId: string, input: UpdateDeathMoveInput, options: { actorId?: string } = {}): DeathMoveFeedEntry | null {
    let updatedEntry: DeathMoveFeedEntry | null = null;
    const resolvedAt = input.status === 'resolved' || input.status === 'cancelled' ? nowIso() : undefined;
    feedStore.update((feed) => feed.map((entry) => {
      if (entry.type !== 'deathMove' || !matchesDeathMoveEntry(entry, deathMoveEntryId)) return entry;
      if (options.actorId && entry.deathMove.actor.actorId !== options.actorId) return entry;
      const deathMove: DeathMoveFeedRequest = {
        ...entry.deathMove,
        ...input,
        resolvedAt: resolvedAt ?? entry.deathMove.resolvedAt
      };
      updatedEntry = { ...entry, deathMove };
      return updatedEntry;
    }));
    return updatedEntry;
  }

  addHandout(authorName: string, handout: Pick<GameHandout, 'id' | 'title' | 'body' | 'imageUrl'>, options: FeedEntryOptions = {}): FeedEntry {
    const publication = normalizeRollPublication(options.publication, options.visibility);
    const entry: FeedEntry = {
      id: createId('feed'),
      type: 'handout',
      createdAt: nowIso(),
      visibility: legacyVisibilityForPublication(publication),
      publication,
      authorName: authorName.trim() || 'Мастер',
      title: options.title?.trim() || 'Материал',
      body: handout.body?.trim() || 'Материал показан игрокам.',
      handout
    };
    this.append(entry);
    return entry;
  }

  clear(): void {
    feedStore.set([]);
  }

  remove(entryId: string): boolean {
    let removed = false;
    feedStore.update((feed) => {
      const next = feed.filter((entry) => entry.id !== entryId);
      removed = next.length !== feed.length;
      return next;
    });
    return removed;
  }

  private findOpenDeathMove(actorId: string | undefined): DeathMoveFeedEntry | null {
    if (!actorId) return null;
    return feedStore.get().find((entry): entry is DeathMoveFeedEntry => (
      entry.type === 'deathMove' &&
      entry.deathMove.actor.actorId === actorId &&
      entry.deathMove.status !== 'resolved' &&
      entry.deathMove.status !== 'cancelled'
    )) ?? null;
  }
}

function updateFeedEntryPublication(entry: FeedEntry, publication: RollPublication, visibility: TableVisibility): FeedEntry {
  if (entry.type === 'roll') {
    return {
      ...entry,
      visibility,
      publication,
      roll: updateRollLogEntryPublication(entry.roll, publication, visibility)
    };
  }
  return { ...entry, visibility, publication };
}

function updateRollLogEntryPublication(entry: RollLogEntry, publication: RollPublication, visibility: TableVisibility): RollLogEntry {
  if (entry.type === 'manual' && !('formula' in entry)) return entry;
  return {
    ...entry,
    publication,
    ...('visibility' in entry ? { visibility } : {})
  } as RollLogEntry;
}

function linkedRollIdsForReveal(entryId: string): Set<string> {
  const rollIds = new Set<string>();
  const feed = feedStore.get();
  const rollLog = rollLogStore.get();
  const seedFeedEntry = feed.find((entry) => entry.id === entryId || (entry.type === 'roll' && entry.roll.id === entryId));
  if (seedFeedEntry?.type === 'roll') {
    rollIds.add(seedFeedEntry.roll.id);
  }
  if (rollLog.some((entry) => entry.id === entryId)) {
    rollIds.add(entryId);
  }

  return rollIds;
}

function normalizeRestParticipants(participants: RestParticipantInput[]): RestFeedParticipant[] {
  return participants.map((participant) => ({
    actorId: participant.actorId,
    actorName: participant.actorName,
    playerId: participant.playerId,
    ready: Boolean(participant.ready),
    choices: normalizeRestChoices(participant.choices ?? [])
  }));
}

function normalizeRestChoices(choices: RestChoiceInput[]): RestFeedChoice[] {
  return choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    count: Math.max(1, Math.trunc(choice.count ?? 1)),
    status: choice.status ?? 'selected'
  }));
}

function matchesRestEntry(entry: RestFeedEntry, restEntryId: string): boolean {
  return entry.id === restEntryId || entry.rest.id === restEntryId;
}

function matchesTeamworkEntry(entry: TeamworkRollFeedEntry, teamworkEntryId: string): boolean {
  return entry.id === teamworkEntryId || entry.teamwork.id === teamworkEntryId;
}

function matchesDeathMoveEntry(entry: DeathMoveFeedEntry, deathMoveEntryId: string): boolean {
  return entry.id === deathMoveEntryId || entry.deathMove.id === deathMoveEntryId;
}

function updateRestChoices(rest: RestFeedRequest, participantIndex: number, choices: string[]): RestFeedRequest {
  const selectedChoices = normalizeRestChoiceSelection(rest, choices);
  const participants = rest.participants.map((participant, index) => {
    if (index !== participantIndex) return participant;
    const selectedCount = countRestChoices(selectedChoices);
    return {
      ...participant,
      ready: selectedCount >= rest.maxChoicesPerParticipant,
      choices: selectedChoices
    };
  });
  return {
    ...rest,
    status: rest.status === 'requested' ? 'collecting' : rest.status,
    participants
  };
}

function normalizeRestChoiceSelection(rest: RestFeedRequest, choices: string[]): RestFeedChoice[] {
  const allowedMoves = new Set(rest.availableMoves);
  const selected = choices
    .map((choice) => choice.trim())
    .filter((choice) => choice && allowedMoves.has(choice))
    .slice(0, rest.maxChoicesPerParticipant);
  const counts = new Map<string, number>();
  selected.forEach((choice) => counts.set(choice, (counts.get(choice) ?? 0) + 1));
  return Array.from(counts.entries()).map(([label, count]) => ({
    id: restChoiceId(label),
    label,
    count,
    status: 'selected'
  }));
}

function countRestChoices(choices: RestFeedChoice[]): number {
  return choices.reduce((total, choice) => total + Math.max(0, Math.trunc(choice.count)), 0);
}

function restChoiceId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/giu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || createId('rest-choice');
}

function normalizeTeamworkActorOptions(actors: TeamworkRollActorOption[]): TeamworkRollActorOption[] {
  const seen = new Set<string>();
  return actors.flatMap((actor) => {
    if (!actor.actorId || seen.has(actor.actorId)) return [];
    seen.add(actor.actorId);
    return {
      actorId: actor.actorId,
      actorName: actor.actorName.trim() || 'Персонаж',
      playerId: actor.playerId
    };
  });
}

function normalizeTeamworkParticipants(kind: TeamworkRollKind, actors: TeamworkRollActorOption[]): TeamworkRollParticipant[] {
  const participants = normalizeTeamworkActorOptions(actors).map((actor, index): TeamworkRollParticipant => ({
    ...actor,
    role: defaultTeamworkRole(kind, index)
  }));
  return normalizeTeamworkRoles(kind, participants);
}

function normalizeTeamworkRoles(kind: TeamworkRollKind, participants: TeamworkRollParticipant[]): TeamworkRollParticipant[] {
  if (kind === 'tagTeam') {
    return participants.slice(0, 3).map((participant) => ({ ...participant, role: 'partner' }));
  }
  let leaderAssigned = false;
  return participants.map((participant) => {
    if (participant.role === 'leader' && !leaderAssigned) {
      leaderAssigned = true;
      return participant;
    }
    if (!leaderAssigned) {
      leaderAssigned = true;
      return { ...participant, role: 'leader' };
    }
    return { ...participant, role: 'support' };
  });
}

function updateTeamworkRole(kind: TeamworkRollKind, participants: TeamworkRollParticipant[], actorId: string, role: TeamworkRollParticipantRole): TeamworkRollParticipant[] {
  if (kind === 'tagTeam') {
    return participants.map((participant) => ({ ...participant, role: 'partner' }));
  }
  if (role === 'leader') {
    return participants.map((participant) => ({
      ...participant,
      role: participant.actorId === actorId ? 'leader' : 'support'
    }));
  }
  return normalizeTeamworkRoles(kind, participants.map((participant) => (
    participant.actorId === actorId ? { ...participant, role } : participant
  )));
}

function defaultTeamworkRole(kind: TeamworkRollKind, index: number): TeamworkRollParticipantRole {
  if (kind === 'tagTeam') return 'partner';
  return index === 0 ? 'leader' : 'support';
}

function isTeamworkClosed(teamwork: TeamworkRollRequest): boolean {
  return teamwork.status === 'resolved' || teamwork.status === 'cancelled';
}

function clampDifficulty(value: number): number {
  if (!Number.isFinite(value)) return 12;
  return Math.max(0, Math.min(40, Math.trunc(value)));
}

function teamworkKindLabel(kind: TeamworkRollKind): string {
  return kind === 'groupAction' ? 'Групповой бросок' : 'Командный бросок';
}

function teamworkDefaultPrompt(kind: TeamworkRollKind): string {
  return kind === 'groupAction'
    ? 'Выберите лидера и участников. Лидер делает Бросок Действия, остальные помогают Бросками Реакции.'
    : 'Выберите участников. Каждый делает Бросок Действия, затем выберите общий результат вручную.';
}
