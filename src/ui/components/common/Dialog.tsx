import type { KeyboardEvent } from 'react';
import { useEffect, useRef } from 'preact/hooks';
import styles from './Dialog.module.css';

type UiNode = any;

export interface DialogProps {
  'aria-label'?: string;
  title?: UiNode;
  actions?: UiNode;
  children: UiNode;
  className?: string;
  onClose?: () => void;
}

export function Dialog({ 'aria-label': ariaLabel, title, actions, children, className = '', onClose }: DialogProps) {
  const shellRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const shell = shellRef.current;
      if (!shell) return;
      const preferred = shell.querySelector<HTMLElement>('[autofocus], [data-dialog-autofocus]');
      (preferred ?? focusableElements(shell)[0] ?? shell).focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const shell = shellRef.current;
    if (!shell || (event.target as Element | null)?.closest('[role="dialog"]') !== shell.parentElement) return;
    if (event.key === 'Escape' && onClose) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(shell);
    if (focusable.length === 0) {
      event.preventDefault();
      shell.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !shell.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !shell.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={`dh-dialog-backdrop ${styles.backdrop}`} role="dialog" aria-label={ariaLabel} aria-modal="true" onClick={onClose} onKeyDown={handleKeyDown}>
      <section ref={shellRef} tabIndex={-1} className={`dh-dialog ${styles.shell} ${className}`.trim()} onClick={(event) => event.stopPropagation()}>
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

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => {
    if (element.closest('[inert], [aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  });
}
