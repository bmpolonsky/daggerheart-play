import type { TraitId } from '../../domain/rules/types';

export type TraitDraft = Partial<Record<TraitId, number>>;
export type TraitSelectValue = number | '';

export const STARTING_TRAIT_DISTRIBUTION = [2, 1, 1, 0, 0, -1] as const;
export const STARTING_TRAIT_OPTIONS = [2, 1, 0, -1] as const;

export function traitOptionsFor(draft: TraitDraft, trait: TraitId): number[] {
  const current = draft[trait];
  const usedByOthers = new Map<number, number>();
  for (const [key, value] of Object.entries(draft) as Array<[TraitId, number | undefined]>) {
    if (key === trait || typeof value !== 'number') continue;
    usedByOthers.set(value, (usedByOthers.get(value) ?? 0) + 1);
  }

  return STARTING_TRAIT_OPTIONS.filter((value) => {
    const limit = STARTING_TRAIT_DISTRIBUTION.filter((item) => item === value).length;
    return current === value || (usedByOthers.get(value) ?? 0) < limit;
  });
}

export function formatTraitValue(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function isCompleteStartingTraitDistribution(draft: TraitDraft): draft is Record<TraitId, number> {
  const values = Object.values(draft).filter((value): value is number => typeof value === 'number');
  return values.length === 6 && values.sort((left, right) => right - left).join(',') === '2,1,1,0,0,-1';
}
