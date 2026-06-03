import styles from './Card.module.css';

type UiNode = any;

interface CardProps {
  title?: UiNode;
  subtitle?: UiNode;
  actions?: UiNode;
  children: UiNode;
  className?: string;
}

export function Card({ title, subtitle, actions, children, className = '' }: CardProps) {
  return (
    <section className={`dh-card ${styles.root} ${className}`.trim()}>
      {(title || actions || subtitle) && (
        <header className={`dh-section-header ${styles.header}`}>
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className={`dh-section-header__actions ${styles.actions}`}>{actions}</div>}
        </header>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
