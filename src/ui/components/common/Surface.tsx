import type { ElementType, HTMLAttributes } from 'react';
import styles from './Surface.module.css';

type UiNode = any;

export type SurfaceTone = 'glass' | 'solid' | 'subtle';
export type SurfacePadding = 'none' | 'sm' | 'md';

const toneClass: Record<SurfaceTone, string> = {
  glass: styles.glass,
  solid: styles.solid,
  subtle: styles.subtle
};
const paddingClass: Record<SurfacePadding, string> = {
  none: styles.paddingNone,
  sm: styles.paddingSm,
  md: styles.paddingMd
};

export interface SurfaceProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  as?: ElementType;
  tone?: SurfaceTone;
  padding?: SurfacePadding;
  children: UiNode;
}

export function Surface({
  as: Component = 'section',
  tone = 'glass',
  padding = 'md',
  children,
  className = '',
  ...props
}: SurfaceProps) {
  return (
    <Component className={`dh-surface ${styles.root} ${toneClass[tone]} ${paddingClass[padding]} ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}
