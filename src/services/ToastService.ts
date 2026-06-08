import { Store } from '../core/store/Store';
import { createId } from '../core/utils/id';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  body: string;
  tone: ToastTone;
  durationMs: number;
}

const DEFAULT_DURATION_MS = 3600;
const MAX_VISIBLE_TOASTS = 4;

class ToastService {
  private toastStore = new Store<ToastMessage[]>([]);
  readonly toasts$ = this.toastStore.toStream();

  show(body: string, tone: ToastTone = 'info', durationMs = DEFAULT_DURATION_MS): string {
    const trimmedBody = body.trim();
    if (!trimmedBody) return '';
    const toast = {
      id: createId(),
      body: trimmedBody,
      tone,
      durationMs
    };
    this.toastStore.update((toasts) => [...toasts, toast].slice(-MAX_VISIBLE_TOASTS));
    return toast.id;
  }

  dismiss(id: string): void {
    this.toastStore.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }
}

export const toastService = new ToastService();
