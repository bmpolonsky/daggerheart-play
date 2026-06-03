import type { ButtonHTMLAttributes } from 'react';
import styles from './StepRailButton.module.css';

interface StepRailButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  label: string;
}

export function StepRailButton({ active = false, label, className = '', ...props }: StepRailButtonProps) {
  return (
    <button className={`dh-step-rail-button ${styles.root} ${active ? styles.active : ''} ${className}`.trim()} aria-current={active ? 'step' : undefined} aria-label={label} title={label} type="button" {...props}>
      <i className={styles.marker} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </button>
  );
}
