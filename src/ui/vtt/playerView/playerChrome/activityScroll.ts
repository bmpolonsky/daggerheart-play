export interface ActivityScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function isActivityNearBottom(metrics: ActivityScrollMetrics): boolean {
  return metrics.clientHeight > 0 && metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop <= 64;
}

export function countNewActivityIds(previous: readonly string[], current: readonly string[]): number {
  const previousIds = new Set(previous);
  return current.filter((id) => id !== 'feed-empty' && !previousIds.has(id)).length;
}

/** Local saved games and remote rooms have separate reading/unread state. */
export function activityScopeKey(input: {
  gameId: string;
  worldId?: string | null;
  storedGameId?: string | null;
  role: 'gm' | 'player';
  roomId?: string | null;
  actorId?: string | null;
}): string {
  return JSON.stringify([input.gameId, input.worldId ?? '', input.storedGameId ?? '', input.role, input.roomId ?? '', input.actorId ?? '']);
}
