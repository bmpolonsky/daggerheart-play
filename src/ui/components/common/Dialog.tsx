import styles from './Dialog.module.css';

type UiNode = any;

export interface DialogProps {
  title?: UiNode;
  actions?: UiNode;
  children: UiNode;
  className?: string;
  onClose?: () => void;
}

export function Dialog({ title, actions, children, className = '', onClose }: DialogProps) {
  return (
    <div className={`dh-dialog-backdrop ${styles.backdrop}`} role="dialog" aria-modal="true" onClick={onClose}>
      <section className={`dh-dialog ${styles.shell} ${className}`.trim()} onClick={(event) => event.stopPropagation()}>
        {(title || actions) && (
          <header className={`dh-section-header dh-section-header--modal ${styles.header}`}>
            <div>{title}</div>
            {actions}
          </header>
        )}
        {children}
      </section>
    </div>
  );
}
