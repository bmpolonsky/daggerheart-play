import type { HTMLAttributes } from 'react';
import styles from './Notice.module.css';

export type NoticeTone = 'info' | 'warning' | 'error' | 'success';

export interface NoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  tone?: NoticeTone;
  // Shared primitives accept children from both React and Preact callers.
  children?: any;
}

export function Notice({ tone = 'info', className = '', ...props }: NoticeProps) {
  return (
    <div
      className={`dh-notice ${styles.notice} ${styles[tone]} ${className}`.trim()}
      {...props}
    />
  );
}
