import styles from './ResourcePips.module.css';

export type ResourcePipsTone = 'hope' | 'hp' | 'stress' | 'armor' | 'fear';

const toneStyles: Record<ResourcePipsTone, string> = {
  hope: styles.hope,
  hp: styles.hp,
  stress: styles.stress,
  armor: styles.armor,
  fear: styles.fear
};

export interface ResourcePipsProps {
  label: string;
  current: number;
  max: number;
  tone?: ResourcePipsTone;
  filledMeansMarked?: boolean;
  onChange?: (next: number) => void;
  className?: string;
  showHeader?: boolean;
}

export function ResourcePips({ label, current, max, tone = 'hp', filledMeansMarked = true, onChange, className = '', showHeader = true }: ResourcePipsProps) {
  return (
    <div className={`${styles.root} ${toneStyles[tone]} resource-pips resource-pips--${tone} ${className}`.trim()}>
      {showHeader && (
        <div className={`${styles.title} resource-title`}>
          <span>{label}</span>
          <strong>
            {current}/{max}
          </strong>
        </div>
      )}
      <div className={`${styles.pips} pips`} role="group" aria-label={label}>
        {Array.from({ length: Math.max(0, max) }, (_, index) => {
          const number = index + 1;
          const active = number <= current;
          return onChange ? (
            <button
              key={number}
              type="button"
              className={`${styles.pip} ${active ? `${styles.active} pip-active` : ''} ${filledMeansMarked ? `${styles.marked} pip-marked` : `${styles.available} pip-available`} pip`}
              onClick={() => onChange(active && number === current ? number - 1 : number)}
              aria-label={`${label} ${number} из ${max}`}
              aria-pressed={active}
            />
          ) : (
            <span
              aria-hidden="true"
              key={number}
              className={`${styles.pip} ${active ? `${styles.active} pip-active` : ''} ${filledMeansMarked ? `${styles.marked} pip-marked` : `${styles.available} pip-available`} pip`}
            />
          );
        })}
      </div>
    </div>
  );
}
