import type { ButtonHTMLAttributes } from 'react';
import styles from './WizardStepButton.module.css';

export interface WizardStepButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  index: number;
  label: string;
}

export function WizardStepButton({ active = false, index, label, className = '', ...props }: WizardStepButtonProps) {
  return (
    <button
      className={`cinematic-builder-step-tab dh-wizard-step-button ${styles.root} ${active ? styles.active : ''} ${className}`.trim()}
      aria-current={active ? 'step' : undefined}
      aria-label={label}
      type="button"
      {...props}
    >
      <span className={styles.marker} aria-hidden="true">{index}</span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
