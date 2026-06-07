import type { ButtonHTMLAttributes } from 'react';
import styles from './IconButton.module.css';

type UiNode = any;

export type IconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type IconButtonTone = 'neutral' | 'gold' | 'blue' | 'green' | 'danger';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  tone?: IconButtonTone;
  children: UiNode;
}

const variantClass: Record<IconButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  danger: styles.danger
};
const sizeClass: Record<IconButtonSize, string> = {
  xs: styles.xs,
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
  xl: styles.xl
};
const toneClass: Record<IconButtonTone, string> = {
  neutral: '',
  gold: styles.toneGold,
  blue: styles.toneBlue,
  green: styles.toneGreen,
  danger: styles.toneDanger
};

export function IconButton({
  variant = 'secondary',
  size = 'md',
  tone = 'neutral',
  children,
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <button className={`dh-icon-button ${styles.root} ${variantClass[variant]} ${sizeClass[size]} ${toneClass[tone]} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
