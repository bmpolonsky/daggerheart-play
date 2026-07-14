import type { ButtonHTMLAttributes } from 'react';
import { useEffect, useRef } from 'preact/hooks';
import styles from './Tabs.module.css';

type UiNode = any;

export interface TabsProps {
  label: string;
  children: UiNode;
  className?: string;
  layout?: 'auto' | 'equal';
  align?: 'center' | 'start';
}

export interface TabButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  active?: boolean;
  children: UiNode;
}

export function Tabs({ label, children, className = '', layout = 'auto', align = 'center' }: TabsProps) {
  return (
    <div className={`dh-tab-row ${styles.row} ${layout === 'equal' ? styles.equal : ''} ${align === 'start' ? styles.start : ''} ${className}`.trim()} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function TabButton({ active = false, children, className = '', ...props }: TabButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const button = buttonRef.current;
    const row = button?.parentElement;
    if (!active || !button || !row || row.scrollWidth <= row.clientWidth) return;
    const buttonRect = button.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (buttonRect.left < rowRect.left) {
      row.scrollLeft -= rowRect.left - buttonRect.left;
    } else if (buttonRect.right > rowRect.right) {
      row.scrollLeft += buttonRect.right - rowRect.right;
    }
  }, [active]);

  return (
    <button ref={buttonRef} className={`dh-tab ${styles.button} ${active ? `${styles.active} dh-is-active` : ''} ${className}`.trim()} aria-pressed={active} type="button" {...props}>
      {children}
    </button>
  );
}
