export function valuesInOrder<T extends { id: string }>(entities: Record<string, T>, order: string[]): T[] {
  return order.map((id) => entities[id]).filter(Boolean);
}

export function replaceInRecord<T extends { id: string }>(record: Record<string, T>, item: T): Record<string, T> {
  return { ...record, [item.id]: item };
}

export function removeFromRecord<T>(record: Record<string, T>, id: string): Record<string, T> {
  const next = { ...record };
  delete next[id];
  return next;
}
