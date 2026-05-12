import type { Character } from './types';

export type AdvantageMode = -1 | 0 | 1;

export interface ActionComposerState {
  advantageMode: AdvantageMode;
  advantageCount?: number;
  disadvantageCount?: number;
  experienceIds: string[];
  spendHopeForExperiences: boolean;
}

export interface ActionComposerRollOptions {
  advantageCount: number;
  disadvantageCount: number;
  experienceIds: string[];
  spendHopeForExperiences: boolean;
}

export function normalizeActionComposerState(character: Character | null, state: ActionComposerState): ActionComposerState {
  const availableIds = new Set(character?.experiences.map((experience) => experience.id) ?? []);
  const experienceIds = state.experienceIds.filter((id, index, list) => availableIds.has(id) && list.indexOf(id) === index);
  return {
    advantageMode: state.advantageMode,
    experienceIds,
    spendHopeForExperiences: state.spendHopeForExperiences
  };
}

export function buildActionComposerRollOptions(state: ActionComposerState): ActionComposerRollOptions {
  const counts = actionComposerAdvantageCounts(state);
  return {
    advantageCount: counts.advantageCount,
    disadvantageCount: counts.disadvantageCount,
    experienceIds: state.experienceIds,
    spendHopeForExperiences: state.spendHopeForExperiences
  };
}

export function actionComposerAdvantageCounts(state: Pick<ActionComposerState, 'advantageMode' | 'advantageCount' | 'disadvantageCount'>): Pick<ActionComposerRollOptions, 'advantageCount' | 'disadvantageCount'> {
  if (typeof state.advantageCount === 'number' || typeof state.disadvantageCount === 'number') {
    return normalizeAdvantageCounts(state.advantageCount ?? 0, state.disadvantageCount ?? 0);
  }
  return {
    advantageCount: state.advantageMode > 0 ? 1 : 0,
    disadvantageCount: state.advantageMode < 0 ? 1 : 0
  };
}

export function addAdvantageDie(
  current: Pick<ActionComposerRollOptions, 'advantageCount' | 'disadvantageCount'>,
  kind: 'advantage' | 'disadvantage'
): Pick<ActionComposerRollOptions, 'advantageCount' | 'disadvantageCount'> {
  if (kind === 'advantage') {
    return current.disadvantageCount > 0
      ? normalizeAdvantageCounts(current.advantageCount, current.disadvantageCount - 1)
      : normalizeAdvantageCounts(current.advantageCount + 1, current.disadvantageCount);
  }
  return current.advantageCount > 0
    ? normalizeAdvantageCounts(current.advantageCount - 1, current.disadvantageCount)
    : normalizeAdvantageCounts(current.advantageCount, current.disadvantageCount + 1);
}

export function normalizeAdvantageCounts(advantageCount: number, disadvantageCount: number): Pick<ActionComposerRollOptions, 'advantageCount' | 'disadvantageCount'> {
  return {
    advantageCount: Math.max(0, Math.min(20, Math.trunc(advantageCount) || 0)),
    disadvantageCount: Math.max(0, Math.min(20, Math.trunc(disadvantageCount) || 0))
  };
}

export function actionComposerModifierPreview(character: Character | null, state: ActionComposerState): number {
  if (!character) return 0;
  const ids = new Set(state.experienceIds);
  return character.experiences
    .filter((experience) => ids.has(experience.id))
    .reduce((sum, experience) => sum + experience.modifier, 0);
}
