import type { HTMLAttributes } from 'react';
import styles from './EmptyState.module.css';

type UiNode = any;
export type EmptyStateTone = 'transparent' | 'subtle' | 'panel';
export type EmptyStateSize = 'sm' | 'md' | 'lg';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: UiNode;
  title: UiNode;
  body?: UiNode;
  actions?: UiNode;
  tone?: EmptyStateTone;
  size?: EmptyStateSize;
}

export function EmptyState({
  icon,
  title,
  body,
  actions,
  tone = 'transparent',
  size = 'md',
  className = '',
  ...props
}: EmptyStateProps) {
  return (
    <div className={`dh-empty-state ${styles.empty} ${styles[tone]} ${styles[size]} ${className}`.trim()} {...props}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <strong className={styles.title}>{title}</strong>
      {body && <p className={styles.body}>{body}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
