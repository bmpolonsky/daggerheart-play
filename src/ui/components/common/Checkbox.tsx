import type { InputHTMLAttributes } from 'react';
import styles from './Checkbox.module.css';

type UiNode = any;

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: UiNode;
  meta?: UiNode;
}

export function Checkbox({ label, meta, checked = false, disabled = false, className = '', ...props }: CheckboxProps) {
  return (
    <label className={`dh-checkbox ${styles.root} ${checked ? styles.checked : ''} ${disabled ? styles.disabled : ''} ${className}`.trim()}>
      <input className={styles.input} type="checkbox" checked={checked} disabled={disabled} {...props} />
      <span className={styles.label}>{label}</span>
      {meta && <span className={styles.meta}>{meta}</span>}
      <span className={styles.box} aria-hidden="true">✓</span>
    </label>
  );
}
