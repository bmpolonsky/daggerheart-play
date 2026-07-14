/** @jsxImportSource preact */
import { ResourcePips, type ResourcePipsTone } from '../../../components/common';

export type TrackDotsTone = Exclude<ResourcePipsTone, 'fear'>;

export function TrackDots({ value, max, tone, label = tone, onSet }: { value: number; max: number; tone: TrackDotsTone; label?: string; onSet?: (value: number) => void }) {
  return (
    <ResourcePips
      className={`player-track-dots player-track-dots--${tone}`}
      current={value}
      label={label}
      max={max}
      onChange={onSet}
      showHeader={false}
      tone={tone}
    />
  );
}
