import type { InputHTMLAttributes } from 'react';
import styles from './Checkbox.module.css';

type UiNode = any;

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: UiNode;
  meta?: UiNode;
  layout?: 'inline' | 'row';
  size?: 'sm' | 'md';
  boxPosition?: 'start' | 'end';
}

export function Checkbox({ label, meta, checked = false, disabled = false, layout = 'inline', size = 'md', boxPosition = 'end', className = '', ...props }: CheckboxProps) {
  return (
    <label className={`dh-checkbox ${styles.root} ${styles[size]} ${layout === 'row' ? styles.row : ''} ${boxPosition === 'start' ? styles.boxStart : ''} ${checked ? styles.checked : ''} ${disabled ? styles.disabled : ''} ${className}`.trim()}>
      <input className={styles.input} type="checkbox" checked={checked} disabled={disabled} {...props} />
      <span className={styles.label}>{label}</span>
      {meta && <span className={styles.meta}>{meta}</span>}
      <span className={styles.box} aria-hidden="true">✓</span>
    </label>
  );
}
