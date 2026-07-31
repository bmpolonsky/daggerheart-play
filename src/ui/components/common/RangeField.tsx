import type { InputHTMLAttributes } from 'react';
import styles from './RangeField.module.css';

export interface RangeFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: string;
  valueLabel?: string;
  size?: 'default' | 'compact';
}

export function RangeField({ label, valueLabel, size = 'default', className = '', ...props }: RangeFieldProps) {
  return (
    <label className={`dh-range-field ${styles.root} ${size === 'compact' ? styles.compact : ''} ${className}`.trim()}>
      <span className={styles.header}>
        <span>{label}</span>
        {valueLabel && <output>{valueLabel}</output>}
      </span>
      <input className={styles.input} type="range" {...props} />
    </label>
  );
}
