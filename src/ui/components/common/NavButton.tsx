import type { ButtonHTMLAttributes } from 'react';
import styles from './NavButton.module.css';

type UiNode = any;

interface NavButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  active?: boolean;
  collapsed?: boolean;
  children: UiNode;
}

export function NavButton({
  active = false,
  collapsed = false,
  children,
  className = '',
  ...props
}: NavButtonProps) {
  return (
    <button
      className={`dh-nav-button ${styles.root} ${active ? `${styles.active} dh-is-active` : ''} ${collapsed ? `${styles.collapsed} dh-is-collapsed` : ''} ${className}`.trim()}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
