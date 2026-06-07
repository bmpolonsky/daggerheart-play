import styles from './Avatar.module.css';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  alt?: string;
  fallback: string;
  src?: string;
  size?: AvatarSize;
  className?: string;
}

const sizeClass: Record<AvatarSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg
};

export function Avatar({ alt = '', fallback, src, size = 'md', className = '' }: AvatarProps) {
  if (src) {
    return (
      <img
        className={`dh-avatar ${styles.root} ${styles.image} ${sizeClass[size]} ${className}`.trim()}
        src={src}
        alt={alt}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
      />
    );
  }

  return (
    <span className={`dh-avatar ${styles.root} ${sizeClass[size]} ${className}`.trim()} aria-hidden={alt ? undefined : 'true'}>
      {fallback}
    </span>
  );
}
