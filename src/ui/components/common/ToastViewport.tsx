/** @jsxImportSource preact */
import { X } from 'lucide-react';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import { toastService } from '../../../services/ToastService';
import { IconButton } from './IconButton';
import styles from './ToastViewport.module.css';

export interface ToastViewportProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export function ToastViewport({ className = '', ...props }: ToastViewportProps) {
  const toasts = useStream(toastService.toasts$);

  useEffect(() => {
    const timers = toasts.map((toast) => window.setTimeout(() => {
      toastService.dismiss(toast.id);
    }, toast.durationMs));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className={`dh-toast-viewport ${styles.viewport} ${className}`.trim()} aria-live="polite" {...props}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`dh-toast ${styles.toast} ${styles[toast.tone] ?? ''}`.trim()}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <div className={styles.body}>{toast.body}</div>
          <IconButton variant="ghost" size="xs" type="button" aria-label="Закрыть уведомление" title="Закрыть" onClick={() => toastService.dismiss(toast.id)}>
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
