/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { TrackDots } from './TrackDots';

export function TrackRow({ icon, label, value, max, onSet }: { icon: ComponentChildren; label: string; value: number; max: number; onSet?: (value: number) => void }) {
  return (
    <div className="player-track-row">
      {icon}
      <span>{label}</span>
      <TrackDots value={value} max={max} tone="mark" onSet={onSet} />
      <strong>{value}/{max}</strong>
    </div>
  );
}
