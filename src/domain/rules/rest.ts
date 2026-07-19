import { clamp, toSafeInteger } from '../../core/utils/clamp';

export type RestType = 'short' | 'long';
export type LongRestRecoveryMove = 'clearHp' | 'clearStress' | 'repairArmor';

export interface RestFearPlan {
  restType: RestType;
  pcCount: number;
  die: number;
  modifier: number;
  total: number;
  formula: string;
}

export interface RestChoiceApplyContext {
  role: 'gm' | 'player';
  isOwner: boolean;
  isClosed: boolean;
  connectedPlayerSession: boolean;
}

export interface RestChoiceSelectionContext {
  role: 'gm' | 'player';
  isOwner: boolean;
  isClosed: boolean;
}

export const REST_RULES: Record<RestType, {
  title: string;
  description: string;
  fearFormula: string;
  moves: string[];
}> = {
  short: {
    title: 'Короткий отдых',
    description: 'Каждый персонаж выбирает два хода отдыха; один и тот же ход можно выбрать дважды.',
    fearFormula: 'Мастер получает 1d4 Страха.',
    moves: [
      'Залечить Раны',
      'Снять Стресс',
      'Ремонт Брони',
      'Подготовка'
    ]
  },
  long: {
    title: 'Продолжительный отдых',
    description: 'Каждый персонаж выбирает два хода отдыха; один и тот же ход можно выбрать дважды.',
    fearFormula: 'Мастер получает 1d4 + количество персонажей Страха и может продвинуть долгосрочный отсчёт.',
    moves: [
      'Залечить все Раны',
      'Снять весь Стресс',
      'Полный ремонт Брони',
      'Подготовка',
      'Работа над проектом'
    ]
  }
};

export function canApplyRestChoice(context: RestChoiceApplyContext): boolean {
  if (context.isClosed) return false;
  if (context.role === 'gm') return true;
  return context.isOwner && !context.connectedPlayerSession;
}

export function canSelectRestChoices(context: RestChoiceSelectionContext): boolean {
  if (context.isClosed) return false;
  return context.role === 'gm' || context.isOwner;
}

export function rollRestFear(restType: RestType, pcCount: number, rng: () => number = Math.random): RestFearPlan {
  const safePcCount = clamp(toSafeInteger(pcCount, 0), 0, 99);
  const die = clamp(Math.floor(rng() * 4) + 1, 1, 4);
  const modifier = restType === 'long' ? safePcCount : 0;
  return {
    restType,
    pcCount: safePcCount,
    die,
    modifier,
    total: die + modifier,
    formula: modifier > 0 ? `1d4 + ${modifier}` : '1d4'
  };
}
