import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PolyhedralDiceRenderer } from './diceBoxRenderer';
import type { PolyhedralDiceRoll } from './types';

export function PolyhedralDiceStage({ roll, onComplete }: { roll: PolyhedralDiceRoll; onComplete?: (rollId: string) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PolyhedralDiceRenderer | null>(null);
  const onCompleteRef = useRef<typeof onComplete>(onComplete);
  const [failed, setFailed] = useState(false);
  const rollSignature = useMemo(() => [
    roll.id,
    roll.total,
    roll.tone ?? '',
    roll.isCritical ? 'critical' : '',
    roll.dice.map((die) => `${die.id}:${die.sides}:${die.value}:${die.label}:${die.tone ?? ''}`).join('|')
  ].join('::'), [roll]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let cancelled = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mount = async () => {
      if (!hostRef.current) return;
      try {
        const { PolyhedralDiceRenderer } = await import('./diceBoxRenderer');
        if (cancelled || !hostRef.current) return;
        rendererRef.current?.dispose();
        rendererRef.current = new PolyhedralDiceRenderer(hostRef.current, roll, { reducedMotion, onComplete: (rollId) => onCompleteRef.current?.(rollId) });
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void mount();
    return () => {
      cancelled = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [roll.id]);

  useEffect(() => {
    rendererRef.current?.setRoll(roll);
  }, [rollSignature]);

  if (failed) {
    return (
      <div className="polyhedral-dice-fallback" aria-hidden="true">
        {roll.dice.map((die) => <span key={die.id}>{die.value}</span>)}
      </div>
    );
  }

  return (
    <div className="polyhedral-dice-stage" aria-hidden="true">
      <div ref={hostRef} className="polyhedral-dice-stage__host" />
    </div>
  );
}
