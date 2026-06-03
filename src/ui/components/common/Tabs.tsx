import type { ButtonHTMLAttributes } from 'react';
import styles from './Tabs.module.css';

type UiNode = any;

interface TabsProps {
  label: string;
  children: UiNode;
  className?: string;
}

interface TabButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  active?: boolean;
  children: UiNode;
}

export function Tabs({ label, children, className = '' }: TabsProps) {
  return (
    <div className={`dh-tab-row ${styles.row} ${className}`.trim()} role="group" aria-label={label}>
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
