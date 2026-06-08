import type { HTMLAttributes } from 'react';
import styles from './ListDetailLayout.module.css';

type UiNode = any;

export interface ListDetailLayoutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  list: UiNode;
  detail?: UiNode;
  listClassName?: string;
  detailClassName?: string;
  listLabel?: string;
  detailLabel?: string;
}

export function ListDetailLayout({
  list,
  detail,
  listClassName = '',
  detailClassName = '',
  listLabel,
  detailLabel,
  className = '',
  style,
  ...props
}: ListDetailLayoutProps) {
  const hasDetail = Boolean(detail);
  const rootClassName = [
    'dh-list-detail-layout',
    styles.root,
    hasDetail ? styles.withDetail : '',
    styles.detailFirst,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} style={style} {...props}>
      <div className={[styles.list, listClassName].filter(Boolean).join(' ')} aria-label={listLabel}>
        {list}
      </div>
      {hasDetail && (
        <div className={[styles.detail, detailClassName].filter(Boolean).join(' ')} aria-label={detailLabel}>
          {detail}
        </div>
      )}
    </div>
  );
}
