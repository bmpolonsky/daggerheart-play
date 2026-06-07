import type { HTMLAttributes } from 'react';
import styles from './SegmentedControl.module.css';

type UiNode = any;

export interface SegmentedControlOption<Value extends string = string> {
  value: Value;
  label: UiNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<Value extends string = string> extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  label: string;
  value: Value;
  options: Array<SegmentedControlOption<Value>>;
  onChange: (value: Value) => void;
  layout?: 'auto' | 'equal';
  size?: 'sm' | 'md';
  tone?: 'neutral' | 'gold';
}

export function SegmentedControl<Value extends string = string>({
  label,
  value,
  options,
  onChange,
  layout = 'auto',
  size = 'sm',
  tone = 'neutral',
  className = '',
  ...props
}: SegmentedControlProps<Value>) {
  return (
    <div
      className={`dh-segmented ${styles.root} ${styles[tone]} ${layout === 'equal' ? styles.equal : ''} ${className}`.trim()}
      role="group"
      aria-label={label}
      {...props}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`dh-segment ${styles.option} ${styles[size]} ${active ? `${styles.active} dh-is-active` : ''}`.trim()}
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
