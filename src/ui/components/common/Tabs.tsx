import type { ButtonHTMLAttributes } from 'react';
import styles from './Tabs.module.css';

type UiNode = any;

export interface TabsProps {
  label: string;
  children: UiNode;
  className?: string;
  layout?: 'auto' | 'equal';
}

export interface TabButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  active?: boolean;
  children: UiNode;
}

export function Tabs({ label, children, className = '', layout = 'auto' }: TabsProps) {
  return (
    <div className={`dh-tab-row ${styles.row} ${layout === 'equal' ? styles.equal : ''} ${className}`.trim()} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function TabButton({ active = false, children, className = '', ...props }: TabButtonProps) {
  return (
    <button className={`dh-tab ${styles.button} ${active ? `${styles.active} dh-is-active` : ''} ${className}`.trim()} aria-pressed={active} type="button" {...props}>
      {children}
    </button>
  );
}
