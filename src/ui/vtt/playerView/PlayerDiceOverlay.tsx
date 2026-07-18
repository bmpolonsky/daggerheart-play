/** @jsxImportSource preact */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { hasRolledDiceTerms } from '../../../domain/rules/diceFormula';
import type { RollLogEntry } from '../../../domain/rules/types';
import { PolyhedralDiceStage } from '../../dice/PolyhedralDiceStage';
import { manualDiceRollToPolyhedral, polyhedralDiceRollFromTerms, type PolyhedralDiceRoll } from '../../dice/types';
import { PLAYER_DICE_ROLL_ANIMATION_TIMEOUT_MS, PLAYER_DICE_ROLL_FADE_OUT_MS, PLAYER_DICE_ROLL_HOLD_AFTER_SETTLE_MS } from './constants';

export function PlayerDiceOverlay({
  latestRoll,
  animationReady = true,
  onRollComplete
}: {
  latestRoll: RollLogEntry | undefined;
  animationReady?: boolean;
  onRollComplete: (rollId: string) => void;
}) {
  const [visibleDiceRollId, setVisibleDiceRollId] = useState<string | null>(null);
  const [fadingDiceRollId, setFadingDiceRollId] = useState<string | null>(null);
  const lastSeenRollId = useRef<string | null>(null);
  const holdTimeoutRef = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const animationTimeoutRef = useRef<number | null>(null);
  const completedRollIdsRef = useRef<Set<string>>(new Set());
  const polyhedralDiceRoll = polyhedralRollForDice(latestRoll);
  const clearHoldTimeout = useCallback(() => {
    if (holdTimeoutRef.current === null) return;
    window.clearTimeout(holdTimeoutRef.current);
    holdTimeoutRef.current = null;
  }, []);
  const clearFadeTimeout = useCallback(() => {
    if (fadeTimeoutRef.current === null) return;
    window.clearTimeout(fadeTimeoutRef.current);
    fadeTimeoutRef.current = null;
  }, []);
  const clearAnimationTimeout = useCallback(() => {
    if (animationTimeoutRef.current === null) return;
    window.clearTimeout(animationTimeoutRef.current);
    animationTimeoutRef.current = null;
  }, []);
  const hideVisibleRoll = useCallback((rollId: string) => {
    clearHoldTimeout();
    clearFadeTimeout();
    setFadingDiceRollId((current) => current === rollId ? null : current);
    setVisibleDiceRollId((current) => current === rollId ? null : current);
  }, [clearFadeTimeout, clearHoldTimeout]);
  const scheduleHideAfterHold = useCallback((rollId: string) => {
    clearHoldTimeout();
    clearFadeTimeout();
    holdTimeoutRef.current = window.setTimeout(() => {
      holdTimeoutRef.current = null;
      setFadingDiceRollId((current) => current ?? rollId);
      fadeTimeoutRef.current = window.setTimeout(() => {
        fadeTimeoutRef.current = null;
        hideVisibleRoll(rollId);
      }, PLAYER_DICE_ROLL_FADE_OUT_MS);
    }, PLAYER_DICE_ROLL_HOLD_AFTER_SETTLE_MS);
  }, [clearFadeTimeout, clearHoldTimeout, hideVisibleRoll]);
  const revealRollAndHoldDice = useCallback((rollId: string) => {
    clearAnimationTimeout();
    if (!completedRollIdsRef.current.has(rollId)) {
      completedRollIdsRef.current.add(rollId);
      rememberDiceRollSeen(rollId);
      onRollComplete(rollId);
    }
    scheduleHideAfterHold(rollId);
  }, [clearAnimationTimeout, onRollComplete, scheduleHideAfterHold]);

  useEffect(() => {
    const visualRoll = polyhedralDiceRoll;
    if (!visualRoll) return;
    if (!animationReady) {
      lastSeenRollId.current = visualRoll.id;
      rememberDiceRollSeen(visualRoll.id);
      return;
    }
    if (lastSeenRollId.current === visualRoll.id) return;
    if (wasDiceRollSeen(visualRoll.id)) {
      lastSeenRollId.current = visualRoll.id;
      rememberDiceRollSeen(visualRoll.id);
      if (!completedRollIdsRef.current.has(visualRoll.id)) {
        completedRollIdsRef.current.add(visualRoll.id);
        onRollComplete(visualRoll.id);
      }
      return;
    }
    if (visibleDiceRollId && !completedRollIdsRef.current.has(visibleDiceRollId)) {
      completedRollIdsRef.current.add(visibleDiceRollId);
      rememberDiceRollSeen(visibleDiceRollId);
      onRollComplete(visibleDiceRollId);
    }
    lastSeenRollId.current = visualRoll.id;
    clearHoldTimeout();
    clearFadeTimeout();
    clearAnimationTimeout();
    setFadingDiceRollId(null);
    setVisibleDiceRollId(visualRoll.id);
    animationTimeoutRef.current = window.setTimeout(() => {
      animationTimeoutRef.current = null;
      revealRollAndHoldDice(visualRoll.id);
    }, PLAYER_DICE_ROLL_ANIMATION_TIMEOUT_MS);
    return () => clearAnimationTimeout();
  }, [animationReady, clearAnimationTimeout, clearFadeTimeout, clearHoldTimeout, onRollComplete, polyhedralDiceRoll?.id, revealRollAndHoldDice, visibleDiceRollId]);

  useEffect(() => () => {
    clearHoldTimeout();
    clearFadeTimeout();
    clearAnimationTimeout();
  }, [clearAnimationTimeout, clearFadeTimeout, clearHoldTimeout]);

  const diceOverlayClassName = `player-dice-overlay ${visibleDiceRollId && fadingDiceRollId === visibleDiceRollId ? 'dh-is-fading' : ''}`;

  if (polyhedralDiceRoll && visibleDiceRollId === polyhedralDiceRoll.id) {
    return (
      <div className={diceOverlayClassName}>
        <PolyhedralDiceStage roll={polyhedralDiceRoll} onComplete={revealRollAndHoldDice} />
      </div>
    );
  }
  return null;
}

const SEEN_DICE_ROLLS_KEY = 'daggerheart-seen-dice-rolls';

function wasDiceRollSeen(rollId: string): boolean {
  try {
    return readSeenDiceRollIds().includes(rollId);
  } catch {
    return false;
  }
}

function rememberDiceRollSeen(rollId: string): void {
  try {
    const ids = readSeenDiceRollIds().filter((id) => id !== rollId);
    window.sessionStorage.setItem(SEEN_DICE_ROLLS_KEY, JSON.stringify([...ids, rollId].slice(-50)));
  } catch {
    // Session storage may be unavailable in hardened browser contexts.
  }
}

function readSeenDiceRollIds(): string[] {
  const parsed = JSON.parse(window.sessionStorage.getItem(SEEN_DICE_ROLLS_KEY) ?? '[]');
  return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
}

function polyhedralRollForDice(entry: RollLogEntry | undefined): PolyhedralDiceRoll | null {
  if (!entry) return null;
  if (entry.type === 'action' || entry.type === 'reaction') {
    return dualityRollToPolyhedral(entry);
  }
  if (entry.type === 'damage') {
    if (!hasRolledDiceTerms(entry.terms)) return null;
    return polyhedralDiceRollFromTerms({ id: entry.id, terms: entry.terms, total: entry.total, tone: 'damage' });
  }
  if (entry.type === 'manual' && 'terms' in entry && 'total' in entry) {
    if (!hasRolledDiceTerms(entry.terms)) return null;
    return manualDiceRollToPolyhedral(entry);
  }
  return null;
}

function dualityRollToPolyhedral(entry: Extract<RollLogEntry, { type: 'action' | 'reaction' }>): PolyhedralDiceRoll {
  const dice: PolyhedralDiceRoll['dice'] = [
    { id: `${entry.id}-hope`, sides: 12, value: entry.hopeDie, label: 'HOPE', tone: 'hope' },
    { id: `${entry.id}-fear`, sides: 12, value: entry.fearDie, label: 'FEAR', tone: 'fear' },
    ...entry.advantageRolls.map((value, index) => ({
      id: `${entry.id}-advantage-${index}`,
      sides: 6 as const,
      value,
      label: 'ADV',
      tone: 'advantage' as const
    })),
    ...entry.disadvantageRolls.map((value, index) => ({
      id: `${entry.id}-disadvantage-${index}`,
      sides: 6 as const,
      value,
      label: 'DIS',
      tone: 'disadvantage' as const
    }))
  ];
  return {
    id: entry.id,
    dice,
    total: entry.total,
    tone: entry.isCritical ? 'critical' : undefined,
    isCritical: entry.isCritical
  };
}
