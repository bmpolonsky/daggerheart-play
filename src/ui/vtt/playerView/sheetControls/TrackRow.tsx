/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { ResourcePips, type ResourcePipsTone } from '../../../components/common';

type TrackTone = Exclude<ResourcePipsTone, 'fear'>;

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
  tone?: TrackTone;
  onSet?: (value: number) => void;
}) {
  const accessibleLabel = labelText ?? (typeof label === 'string' ? label : 'Ресурс');
  return (
    <div className="player-track-row">
      {icon}
      <span>{label}</span>
      <ResourcePips current={value} max={max} tone={tone} variant="token" label={accessibleLabel} showHeader={false} onChange={onSet} />
      <strong>{value}/{max}</strong>
    </div>
  );
}
