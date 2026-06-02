import { DEFAULT_SCENE_HEIGHT, DEFAULT_SCENE_WIDTH } from '../../../domain/tabletop/logic';
import type { PlayerSheetSectionId } from './types';

export const PLAYER_SCENE_WIDTH = DEFAULT_SCENE_WIDTH;
export const PLAYER_SCENE_HEIGHT = DEFAULT_SCENE_HEIGHT;
export const PLAYER_TACTICAL_GRID_SIZE = 48;
export const PLAYER_RANGE_CELLS = [1, 3, 6, 12] as const;
export const PLAYER_DICE_ROLL_ANIMATION_TIMEOUT_MS = 4200;
export const PLAYER_DICE_ROLL_HOLD_AFTER_SETTLE_MS = 3000;
export const PLAYER_DICE_ROLL_FADE_OUT_MS = 520;

export const PLAYER_SHEET_SECTIONS: Array<{ id: PlayerSheetSectionId; label: string; target: string }> = [
  { id: 'overview', label: 'Обзор', target: 'player-sheet-overview' },
  { id: 'traits', label: 'Характеристики и опыт', target: 'player-sheet-traits' },
  { id: 'actions', label: 'Действия', target: 'player-sheet-actions' },
  { id: 'features', label: 'Особенности', target: 'player-sheet-features' },
  { id: 'cards', label: 'Карты доменов', target: 'player-sheet-domain-cards' },
  { id: 'gear', label: 'Инвентарь', target: 'player-sheet-gear' }
];
