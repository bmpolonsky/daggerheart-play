import type { HTMLAttributes } from 'react';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'gold' | 'success' | 'danger' | 'blue';
export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
}

export function Badge({ tone = 'neutral', size = 'sm', className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`dh-badge ${styles.badge} ${styles[tone]} ${styles[size]} ${className}`.trim()}
      {...props}
    />
  );
}
