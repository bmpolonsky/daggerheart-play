import type { GameHandout, GameState } from './types';

export interface PresentedHandoutOverlay {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  hasBody: boolean;
  hasImage: boolean;
}

type PresentationState = Pick<GameState, 'handouts' | 'presentedHandoutId'>;

export function selectPresentedHandout(state: PresentationState): GameHandout | null {
  if (!state.presentedHandoutId) return null;
  return state.handouts.find((handout) => handout.id === state.presentedHandoutId && handout.visibleToPlayers) ?? null;
}

export function buildPresentedHandoutOverlay(state: PresentationState): PresentedHandoutOverlay | null {
  const handout = selectPresentedHandout(state);
  if (!handout) return null;

  const title = handout.title.trim() || 'Материал';
  const body = handout.body.trim();
  const imageUrl = handout.imageUrl?.trim() || null;

  return {
    id: handout.id,
    title,
    body,
    imageUrl,
    hasBody: body.length > 0,
    hasImage: imageUrl !== null
  };
}
