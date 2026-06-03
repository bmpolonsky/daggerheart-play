import type { ButtonHTMLAttributes } from 'react';
import styles from './IconButton.module.css';

type UiNode = any;

type IconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
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

export function IconButton({
  variant = 'secondary',
  size = 'md',
  children,
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <button className={`dh-icon-button ${styles.root} ${variantClass[variant]} ${sizeClass[size]} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
