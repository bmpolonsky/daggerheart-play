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
