export type DiceAnimationDecision = 'none' | 'wait' | 'complete' | 'animate';

export interface DiceAnimationObservation {
  contextKey: string;
  rollId: string | null;
  animationReady: boolean;
  animateInitialRoll: boolean;
  alreadySeen: boolean;
}

export class DiceAnimationPolicy {
  private contextKey: string | null = null;
  private initialized = false;
  private observedRollId: string | null = null;

  observe(input: DiceAnimationObservation): DiceAnimationDecision {
    if (this.contextKey !== input.contextKey) {
      this.contextKey = input.contextKey;
      this.initialized = false;
      this.observedRollId = null;
    }
    const initialObservation = !this.initialized;
    if (!input.rollId) {
      this.initialized = true;
      return 'none';
    }
    if (!input.animationReady) return 'wait';
    this.initialized = true;
    if (this.observedRollId === input.rollId) return 'none';
    this.observedRollId = input.rollId;
    if (initialObservation && !input.animateInitialRoll) return 'complete';
    if (input.alreadySeen) return 'complete';
    return 'animate';
  }
}

export function diceAnimationContextKey(input: {
  gameId: string;
  role: 'gm' | 'player';
  actorId: string | null;
}): string {
  return `${input.gameId}:${input.role}:${input.actorId ?? ''}`;
}

export function shouldAnimateInitialDiceRoll(input: {
  role: 'gm' | 'player';
  latestRollId?: string;
  latestRollAnimationId: string | null;
}): boolean {
  return input.role === 'player'
    && Boolean(input.latestRollAnimationId)
    && input.latestRollAnimationId === input.latestRollId;
}
