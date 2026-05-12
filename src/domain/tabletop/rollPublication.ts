import type { FeedEntry, RollLogEntry, RollPublication } from '../rules/types';
import type { TableSyncRole, TableVisibility } from './types';

export interface RollFeedViewer {
  role?: TableSyncRole | 'gm' | 'player';
  actorId?: string | null;
}

export function normalizeRollPublication(publication: RollPublication | undefined, legacyVisibility?: TableVisibility): RollPublication {
  if (publication === 'private' || publication === 'gm' || publication === 'public') return publication;
  return legacyVisibility === 'gm' ? 'gm' : 'public';
}

export function legacyVisibilityForPublication(publication: RollPublication): TableVisibility {
  return publication === 'public' ? 'public' : 'gm';
}

export function rollLogEntryPublication(entry: RollLogEntry): RollPublication {
  const legacyVisibility = 'visibility' in entry ? entry.visibility : undefined;
  return normalizeRollPublication('publication' in entry ? entry.publication : undefined, legacyVisibility);
}

export function feedEntryPublication(entry: FeedEntry): RollPublication {
  return normalizeRollPublication(entry.publication, entry.visibility);
}

export function rollLogEntryActorId(entry: RollLogEntry): string | undefined {
  if ('actorId' in entry) return entry.actorId;
  return undefined;
}

export function feedEntryActorIds(entry: FeedEntry): string[] {
  if (entry.type === 'roll') {
    const actorId = rollLogEntryActorId(entry.roll);
    return actorId ? [actorId] : [];
  }
  if (entry.type === 'card') {
    return entry.actor?.actorId ? [entry.actor.actorId] : [];
  }
  if (entry.type === 'rest') {
    return [
      entry.rest.requestedBy?.actorId,
      ...entry.rest.participants.map((participant) => participant.actorId)
    ].filter((actorId): actorId is string => Boolean(actorId));
  }
  if (entry.type === 'teamwork') {
    return [
      entry.teamwork.requestedBy?.actorId,
      ...entry.teamwork.participants.map((participant) => participant.actorId)
    ].filter((actorId): actorId is string => Boolean(actorId));
  }
  if (entry.type === 'deathMove') {
    return entry.deathMove.actor.actorId ? [entry.deathMove.actor.actorId] : [];
  }
  return [];
}

export function canViewPublishedActor(publication: RollPublication, actorId: string | undefined, viewer: RollFeedViewer): boolean {
  if (publication === 'public') return true;
  if (viewer.role === 'gm') return true;
  if (publication === 'gm') return false;
  return Boolean(actorId && viewer.actorId && actorId === viewer.actorId);
}

export function canViewRollLogEntry(entry: RollLogEntry, viewer: RollFeedViewer): boolean {
  return canViewPublishedActor(rollLogEntryPublication(entry), rollLogEntryActorId(entry), viewer);
}

export function canViewFeedEntry(entry: FeedEntry, viewer: RollFeedViewer): boolean {
  const publication = feedEntryPublication(entry);
  if (publication === 'public') return true;
  if (viewer.role === 'gm') return true;
  if (publication === 'gm') return false;
  return Boolean(viewer.actorId && feedEntryActorIds(entry).includes(viewer.actorId));
}

export function visibleRollLogEntries(rollLog: RollLogEntry[], viewer: RollFeedViewer): RollLogEntry[] {
  return rollLog.filter((entry) => canViewRollLogEntry(entry, viewer));
}

export function latestVisibleRollLogEntry(rollLog: RollLogEntry[], viewer: RollFeedViewer): RollLogEntry | undefined {
  return rollLog.find((entry) => canViewRollLogEntry(entry, viewer));
}
