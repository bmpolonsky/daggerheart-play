import styles from './ModalShell.module.css';

type UiNode = any;

interface ModalShellProps {
  title?: UiNode;
  actions?: UiNode;
  children: UiNode;
  className?: string;
  onClose?: () => void;
}

export function ModalShell({ title, actions, children, className = '', onClose }: ModalShellProps) {
  return (
    <div className={`cinematic-modal-backdrop ${styles.backdrop}`} role="dialog" aria-modal="true" onClick={onClose}>
      <section className={`dh-modal-shell ${styles.shell} ${className}`.trim()} onClick={(event) => event.stopPropagation()}>
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
