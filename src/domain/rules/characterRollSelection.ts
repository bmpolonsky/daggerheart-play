import type { Experience } from './types';

/** Projection shared by roll confirmation and its affordability check. */
export function characterRollExperienceSelection(experiences: readonly Experience[], selectedIds: readonly string[], spendHope: boolean, availableHope: number) {
  const selected = experiences.filter((experience) => selectedIds.includes(experience.id));
  const hopeCost = spendHope ? selected.length : 0;
  return {
    experienceIds: selected.map((experience) => experience.id),
    modifier: selected.reduce((total, experience) => total + experience.modifier, 0),
    hopeCost,
    canAfford: hopeCost <= availableHope
  };
}
