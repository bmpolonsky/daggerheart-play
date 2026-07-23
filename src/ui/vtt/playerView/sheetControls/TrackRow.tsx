/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { TrackDots, type TrackDotsTone } from './TrackDots';

export function TrackRow({
  icon,
  label,
  labelText,
  value,
  max,
  tone = 'hp',
  onSet
}: {
  icon: ComponentChildren;
  label: ComponentChildren;
  labelText?: string;
  value: number;
  max: number;
  tone?: TrackDotsTone;
  onSet?: (value: number) => void;
}) {
  const accessibleLabel = labelText ?? (typeof label === 'string' ? label : 'Ресурс');
  return (
    <div className="player-track-row">
      {icon}
      <span>{label}</span>
      <TrackDots value={value} max={max} tone={tone} label={accessibleLabel} onSet={onSet} />
      <strong>{value}/{max}</strong>
    </div>
  );
}
