import styles from './SectionHeader.module.css';

type UiNode = any;

export interface SectionHeaderProps {
  eyebrow?: UiNode;
  title: UiNode;
  subtitle?: UiNode;
  actions?: UiNode;
  className?: string;
}

export function SectionHeader({ eyebrow, title, subtitle, actions, className = '' }: SectionHeaderProps) {
  return (
    <header className={`dh-section-header ${styles.root} ${className}`.trim()}>
      <div>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className={`dh-section-header__actions ${styles.actions}`}>{actions}</div>}
    </header>
  );
}
