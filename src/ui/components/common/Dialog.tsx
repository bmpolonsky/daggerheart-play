import type { KeyboardEvent } from 'react';
import { createPortal } from 'preact/compat';
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
  /** Critical startup/recovery flow above dialogs restored asynchronously by routing. */
  priority?: boolean;
}

export function Dialog({ 'aria-label': ariaLabel, title, actions, children, className = '', onClose, priority = false }: DialogProps) {
  const shellRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const shell = shellRef.current;
      if (!shell) return;
      // Rendering/effects can lag behind keyboard or pointer interaction. Keep
      // focus the user has already placed inside this dialog instead of
      // resetting it when the initial animation frame eventually runs.
      if (shell.contains(document.activeElement)) return;
      const preferred = shell.querySelector<HTMLElement>('[autofocus], [data-dialog-autofocus]');
      (preferred ?? focusableElements(shell)[0] ?? shell).focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!priority) return;
    const own = shellRef.current?.parentElement;
    if (!own) return;
    const previous = new Map<HTMLElement, string | null>();
    const isolate = () => {
      document.querySelectorAll<HTMLElement>('[role="dialog"]').forEach(dialog => {
        if (dialog === own || own.contains(dialog) || previous.has(dialog)) return;
        previous.set(dialog, dialog.getAttribute('inert'));
        dialog.setAttribute('inert', '');
      });
    };
    isolate();
    const observer = new MutationObserver(isolate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      previous.forEach((value, dialog) => {
        if (value === null) dialog.removeAttribute('inert');
        else dialog.setAttribute('inert', value);
      });
    };
  }, [priority]);

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

  const content = (
    <div className={`dh-portal-scope dh-dialog-backdrop ${styles.backdrop} ${priority ? styles.priority : ''}`} role="dialog" aria-label={ariaLabel} aria-modal="true" onClick={onClose} onKeyDown={handleKeyDown}>
      <section ref={shellRef} tabIndex={-1} className={`dh-dialog ${styles.shell} ${className}`.trim()} onClick={(event) => event.stopPropagation()}>
        {(title || actions) && (
          <header className={`dh-section-header dh-section-header--modal ${styles.header}`}>
            <div>{title}</div>
            {actions}
          </header>
        )}
        {children}
        <div data-dh-toast-host className={styles.notifications} />
      </section>
    </div>
  );

  // Dialogs can open from another dialog (player sheet -> level-up, editor ->
  // confirmation). Keeping the child in that filtered glass subtree makes
  // WebKit treat `position: fixed` as relative to the parent shell and clips
  // the child action bar. A body portal gives every modal the same viewport
  // and top-layer contract.
  return typeof document === 'undefined'
    ? content
    : createPortal(content, document.body) as typeof content;
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
