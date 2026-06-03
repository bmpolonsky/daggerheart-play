import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type UiNode = any;

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'iconSm';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  grow?: boolean;
  noWrap?: boolean;
  iconBefore?: UiNode;
  iconAfter?: UiNode;
  children: UiNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  danger: styles.danger
};
const sizeClass: Record<ButtonSize, string> = {
  xs: styles.xs,
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
  icon: styles.icon,
  iconSm: styles.iconSm
};

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  grow = false,
  noWrap = false,
  iconBefore,
  iconAfter,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button className={`dh-button ${styles.root} ${variantClass[variant]} ${sizeClass[size]} ${fullWidth ? styles.fullWidth : ''} ${grow ? styles.grow : ''} ${noWrap ? styles.noWrap : ''} ${className}`.trim()} {...props}>
      {iconBefore}
      {children}
      {iconAfter}
    </button>
  );
}
