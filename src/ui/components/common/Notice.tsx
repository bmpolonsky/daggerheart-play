import type { HTMLAttributes } from 'react';
import styles from './Notice.module.css';

export type NoticeTone = 'info' | 'warning' | 'error' | 'success';

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone?: NoticeTone;
}

export function Notice({ tone = 'info', className = '', ...props }: NoticeProps) {
  return (
    <div
      className={`dh-notice ${styles.notice} ${styles[tone]} ${className}`.trim()}
      {...props}
    />
  );
}
