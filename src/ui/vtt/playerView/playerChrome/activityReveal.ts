import type { PlayerViewModel } from '../../../../domain/tabletop/playerView';
import { feedRollRevealId } from '../helpers';

export function delaysRollResult(event: PlayerViewModel['activity'][number]): boolean {
  return event.kind === 'roll' && event.roll?.hasAnimatedDice !== false;
}

export function wasCreatedBefore(createdAt: string, timestampMs: number): boolean {
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs) && createdAtMs < timestampMs;
}

export function unrevealedRollIdsFromHistoricalActivity(
  current: Set<string>,
  activity: PlayerViewModel['activity'],
  mountedAtMs: number
): Set<string> | null {
  let next: Set<string> | null = null;
  for (const event of activity) {
    if (!delaysRollResult(event) || !wasCreatedBefore(event.createdAt, mountedAtMs)) continue;
    const rollId = feedRollRevealId(event);
    if (current.has(rollId)) continue;
    next ??= new Set(current);
    next.add(rollId);
  }
  return next;
}
