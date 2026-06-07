export interface ResourcePipsProps {
  label: string;
  current: number;
  max: number;
  tone?: 'hope' | 'hp' | 'stress' | 'armor';
  filledMeansMarked?: boolean;
  onChange?: (next: number) => void;
}

export function ResourcePips({ label, current, max, tone = 'hp', filledMeansMarked = true, onChange }: ResourcePipsProps) {
  return (
    <div className={`resource-pips resource-pips--${tone}`}>
      <div className="resource-title">
        <span>{label}</span>
        <strong>
          {current}/{max}
        </strong>
      </div>
      <div className="pips" role="group" aria-label={label}>
        {Array.from({ length: Math.max(0, max) }, (_, index) => {
          const number = index + 1;
          const active = number <= current;
          return (
            <button
              key={number}
              type="button"
              className={`pip ${active ? 'pip-active' : ''} ${filledMeansMarked ? 'pip-marked' : 'pip-available'}`}
              onClick={() => onChange?.(active && number === current ? number - 1 : number)}
              disabled={!onChange}
              aria-label={`${label} ${number}`}
            />
          );
        })}
      </div>
    </div>
  );
}
