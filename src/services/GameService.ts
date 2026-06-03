import { clamp, toSafeInteger } from '../core/utils/clamp';
import { nowIso } from '../core/utils/date';
import { createGameHandout } from '../domain/rules/factories';
import type { GameHandout, GameState, SpotlightSide } from '../domain/rules/types';
import { DEFAULT_MAX_FEAR } from '../domain/rules/constants';
import { gameStore } from '../stores/gameStores';

export class GameService {
  readonly game$ = gameStore.toStream();

  updateGame(patch: Partial<Pick<GameState, 'name' | 'gmName' | 'sessionTitle' | 'sceneTitle' | 'safetyNotes' | 'tableNotes'>>): void {
    gameStore.update((state) => ({ ...state, ...patch, updatedAt: nowIso() }));
  }

  addHandout(input?: Partial<GameHandout>): GameHandout {
    const handout = createGameHandout(input);
    gameStore.update((state) => ({
      ...state,
      handouts: [...(state.handouts ?? []), handout],
      updatedAt: nowIso()
    }));
    return handout;
  }

  updateHandout(id: string, patch: Partial<Pick<GameHandout, 'title' | 'body' | 'imageUrl' | 'visibleToPlayers'>>): void {
    gameStore.update((state) => ({
      ...state,
      handouts: (state.handouts ?? []).map((handout) => (
        handout.id === id ? { ...handout, ...patch, updatedAt: nowIso() } : handout
      )),
      presentedHandoutId: patch.visibleToPlayers === false && state.presentedHandoutId === id ? null : state.presentedHandoutId,
      updatedAt: nowIso()
    }));
  }

  removeHandout(id: string): void {
    gameStore.update((state) => ({
      ...state,
      handouts: (state.handouts ?? []).filter((handout) => handout.id !== id),
      presentedHandoutId: state.presentedHandoutId === id ? null : state.presentedHandoutId,
      updatedAt: nowIso()
    }));
  }

  presentHandout(id: string): boolean {
    const handout = gameStore.get().handouts.find((item) => item.id === id);
    if (!handout) return false;
    gameStore.update((state) => ({
      ...state,
      presentedHandoutId: id,
      handouts: (state.handouts ?? []).map((item) => (
        item.id === id ? { ...item, visibleToPlayers: true, updatedAt: nowIso() } : item
      )),
      updatedAt: nowIso()
    }));
    return true;
  }

  hidePresentedHandout(): void {
    gameStore.update((state) => ({ ...state, presentedHandoutId: null, updatedAt: nowIso() }));
  }

  updateSettings(patch: Partial<Pick<GameState, 'autoApplyRollConsequences' | 'showLegacyActionTokens' | 'showCoins'>>): void {
    gameStore.update((state) => ({ ...state, ...patch, updatedAt: nowIso() }));
  }

  setFear(value: number): void {
    gameStore.update((state) => ({
      ...state,
      fear: clamp(toSafeInteger(value, 0), 0, Math.min(state.maxFear, DEFAULT_MAX_FEAR)),
      updatedAt: nowIso()
    }));
  }

  gainFear(amount = 1): void {
    gameStore.update((state) => ({
      ...state,
      fear: clamp(state.fear + Math.max(0, toSafeInteger(amount, 0)), 0, Math.min(state.maxFear, DEFAULT_MAX_FEAR)),
      updatedAt: nowIso()
    }));
  }

  spendFear(amount = 1): boolean {
    const safeAmount = Math.max(0, toSafeInteger(amount, 0));
    const state = gameStore.get();
    if (state.fear < safeAmount) {
      return false;
    }
    gameStore.update((current) => ({
      ...current,
      fear: clamp(current.fear - safeAmount, 0, current.maxFear),
      updatedAt: nowIso()
    }));
    return true;
  }

  setMaxFear(maxFear: number): void {
    const safeMax = clamp(toSafeInteger(maxFear, DEFAULT_MAX_FEAR), 0, DEFAULT_MAX_FEAR);
    gameStore.update((state) => ({
      ...state,
      maxFear: safeMax,
      fear: clamp(state.fear, 0, safeMax),
      updatedAt: nowIso()
    }));
  }

  setStartingFearForPlayerCount(playerCount: number): void {
    this.setFear(clamp(toSafeInteger(playerCount, 0), 0, DEFAULT_MAX_FEAR));
  }

  setSpotlight(spotlight: SpotlightSide): void {
    gameStore.update((state) => ({ ...state, spotlight, updatedAt: nowIso() }));
  }

  passSpotlight(): void {
    gameStore.update((state) => ({
      ...state,
      spotlight: state.spotlight === 'players' ? 'gm' : 'players',
      updatedAt: nowIso()
    }));
  }

  setActionTokensPerScene(value: number): void {
    gameStore.update((state) => ({
      ...state,
      actionTokensPerScene: clamp(toSafeInteger(value, 3), 0, 12),
      updatedAt: nowIso()
    }));
  }

  startScene(sceneTitle?: string): void {
    gameStore.update((state) => ({
      ...state,
      sceneTitle: sceneTitle ?? state.sceneTitle,
      spotlight: 'players',
      updatedAt: nowIso()
    }));
  }
}
