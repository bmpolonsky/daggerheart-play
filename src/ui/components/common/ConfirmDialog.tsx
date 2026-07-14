import { Button } from './Button';
import { Dialog } from './Dialog';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  destructive = true,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  return (
    <Dialog
      aria-label={title}
      className={styles.shell}
      title={(
        <div className={styles.title}>
          <span>Подтверждение</span>
          <strong>{title}</strong>
        </div>
      )}
      onClose={onCancel}
    >
      <p className={styles.body}>{body}</p>
      <div className={styles.actions}>
        <Button autoFocus type="button" variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button type="button" variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
