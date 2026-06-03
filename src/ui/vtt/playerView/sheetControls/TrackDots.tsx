/** @jsxImportSource preact */
export type TrackDotsTone = 'hope' | 'hp' | 'stress' | 'armor';

export function TrackDots({ value, max, tone, onSet }: { value: number; max: number; tone: TrackDotsTone; onSet?: (value: number) => void }) {
  return (
    <div className={`player-track-dots player-track-dots--${tone}`}>
      {Array.from({ length: max }).map((_, index) => {
        const nextValue = index + 1 === value ? index : index + 1;
        return onSet ? (
          <button
            aria-label={`${tone} ${index + 1}`}
            key={index}
            className={index < value ? 'is-filled' : ''}
            type="button"
            onClick={() => onSet(nextValue)}
          />
        ) : (
          <i key={index} className={index < value ? 'is-filled' : ''} />
        );
      })}
    </div>
  );
}
