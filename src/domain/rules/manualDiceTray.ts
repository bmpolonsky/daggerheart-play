export type ManualDieSides = 4 | 6 | 8 | 10 | 12 | 20;
export type DiceTraySelectionMode = 'add' | 'replace';
export type DiceTrayItem =
  | { id: string; kind: 'hope' }
  | { id: string; kind: 'fear' }
  | { id: string; kind: 'advantage' }
  | { id: string; kind: 'disadvantage' }
  | { id: string; kind: 'die'; sides: ManualDieSides };

export function selectManualDice(
  current: readonly DiceTrayItem[],
  selection: { kind: 'die'; sides: ManualDieSides } | { kind: 'duality' },
  mode: DiceTraySelectionMode,
  id: string
): DiceTrayItem[] {
  const next = mode === 'replace' ? [] : [...current];
  if (selection.kind === 'die') return [...next, { id, kind: 'die', sides: selection.sides }];
  if (!next.some((item) => item.kind === 'hope')) next.unshift({ id: `${id}:hope`, kind: 'hope' });
  if (!next.some((item) => item.kind === 'fear')) {
    const hopeIndex = next.findIndex((item) => item.kind === 'hope');
    next.splice(hopeIndex + 1, 0, { id: `${id}:fear`, kind: 'fear' });
  }
  return next;
}
