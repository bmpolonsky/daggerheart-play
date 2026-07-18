import type { ButtonHTMLAttributes } from 'react';
import styles from './ListItem.module.css';

type UiNode = any;

export type ListItemDensity = 'compact' | 'regular';
export type ListItemTone = 'default' | 'featured';
export type ListItemLines = 1 | 2;
export type ListItemAlign = 'center' | 'start';

export interface ListItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> {
  align?: ListItemAlign;
  title: UiNode;
  subtitle?: UiNode;
  detail?: UiNode;
  leftAccessory?: UiNode;
  value?: UiNode;
  rightAccessory?: UiNode;
  density?: ListItemDensity;
  lines?: ListItemLines;
  tooltip?: string;
  tone?: ListItemTone;
}

export function ListItem({
  align = 'center',
  title,
  subtitle,
  detail,
  leftAccessory,
  value,
  rightAccessory,
  density = 'regular',
  lines = 1,
  tooltip,
  tone = 'default',
  className = '',
  disabled = false,
  onClick,
  type = 'button',
  ...props
}: ListItemProps) {
  const rightSlot = rightAccessory ?? (value ? <span className={`dh-list-item__value ${styles.value}`}>{value}</span> : null);
  const itemClassName = [
    'dh-list-item',
    styles.root,
    align === 'start' ? styles.alignStart : '',
    density === 'compact' ? styles.compact : '',
    tone === 'featured' ? styles.featured : '',
    lines === 2 ? styles.twoLine : '',
    onClick ? styles.interactive : '',
    onClick && rightSlot ? styles.interactiveWithAccessory : '',
    disabled ? styles.disabled : '',
    className
  ].filter(Boolean).join(' ');
  const content = (
    <>
      <span className={`dh-list-item__title ${styles.title}`}>{title}</span>
      {subtitle && <span className={`dh-list-item__subtitle ${styles.subtitle}`}>{subtitle}</span>}
      {detail && <span className={`dh-list-item__detail ${styles.detail}`}>{detail}</span>}
    </>
  );
  if (onClick && !rightSlot) {
    return (
      <button className={itemClassName} type={type} title={tooltip} disabled={disabled} onClick={onClick} {...props}>
        {leftAccessory && <span className={`dh-list-item__left-accessory ${styles.leftAccessory}`}>{leftAccessory}</span>}
        <span className={`dh-list-item__content ${styles.content}`}>{content}</span>
      </button>
    );
  }

  return (
    <article className={itemClassName} title={tooltip}>
      {onClick && (
        <button
          className={styles.hitTarget}
          type={type}
          disabled={disabled}
          onClick={onClick}
          aria-label={props['aria-label'] ?? (typeof title === 'string' ? title : undefined)}
          {...props}
        />
      )}
      {leftAccessory && <span className={`dh-list-item__left-accessory ${styles.leftAccessory}`}>{leftAccessory}</span>}
      <span className={`dh-list-item__content ${styles.content}`}>{content}</span>
      {rightSlot && <span className={`dh-list-item__right-accessory ${styles.rightAccessory}`}>{rightSlot}</span>}
    </article>
  );
}
