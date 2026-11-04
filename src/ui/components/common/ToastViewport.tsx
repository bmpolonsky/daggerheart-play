/** @jsxImportSource preact */
import { X } from 'lucide-react';
import type { JSX } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import { toastService } from '../../../services/ToastService';
import { IconButton } from './IconButton';
import styles from './ToastViewport.module.css';

export interface ToastViewportProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export function ToastViewport({ className = '', ...props }: ToastViewportProps) {
  const toasts = useStream(toastService.toasts$);
  const [host, setHost] = useState<HTMLElement | null>(null);

  // Keep notifications in the active dialog's layout, not over its controls.
  // Observe portals as dialogs can open/close while a long-lived error remains.
  useLayoutEffect(() => {
    if (!toasts.length) { setHost(null); return; }
    const update = () => {
      const hosts = Array.from(document.querySelectorAll<HTMLElement>('[data-dh-toast-host]'));
      setHost(hosts.reverse().find((element) => element.parentElement?.getClientRects().length) ?? null);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [toasts.length > 0]);

  useEffect(() => {
    const timers = toasts.map((toast) => window.setTimeout(() => {
      toastService.dismiss(toast.id);
    }, toast.durationMs));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts]);

  if (toasts.length === 0) return null;

  const content = (
    <div className={`dh-toast-viewport ${styles.viewport} ${host ? styles.docked : ''} ${className}`.trim()} aria-live="polite" tabIndex={0} aria-label="Уведомления" {...props}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`dh-toast ${styles.toast} ${styles[toast.tone] ?? ''}`.trim()}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <div className={styles.body}>{toast.body}</div>
          <IconButton variant="ghost" size="xs" type="button" aria-label="Закрыть уведомление" title="Закрыть" onClick={() => {
            // Dismissing a focused notification must not strand focus outside
            // the dialog's keyboard trap when its button is removed.
            if (host?.contains(document.activeElement)) {
              host.parentElement?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
            }
            toastService.dismiss(toast.id);
          }}>
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      ))}
    </div>
  );
  return host ? createPortal(content, host) : content;
}
