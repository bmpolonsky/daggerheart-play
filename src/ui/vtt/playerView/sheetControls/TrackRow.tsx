/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { TrackDots, type TrackDotsTone } from './TrackDots';

export function TrackRow({ icon, label, value, max, tone = 'hp', onSet }: { icon: ComponentChildren; label: string; value: number; max: number; tone?: TrackDotsTone; onSet?: (value: number) => void }) {
  return (
    <div className="player-track-row">
      {icon}
      <span>{label}</span>
      <TrackDots value={value} max={max} tone={tone} label={label} onSet={onSet} />
      <strong>{value}/{max}</strong>
    </div>
  );
}
