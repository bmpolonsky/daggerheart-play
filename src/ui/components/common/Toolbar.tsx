import type { HTMLAttributes } from 'react';
import styles from './Toolbar.module.css';

type UiNode = any;

export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: UiNode;
}

export function Toolbar({ children, className = '', ...props }: ToolbarProps) {
  return (
    <div className={`dh-toolbar ${styles.root} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
