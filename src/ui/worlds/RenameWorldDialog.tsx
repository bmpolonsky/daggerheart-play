/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { Button, Dialog, Notice, TextField, Toolbar } from '../components/common';
import styles from './WorldLibraryPanel.module.css';

export function RenameWorldDialog({ name, busy, error, onCancel, onRename }: {
  name: string;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  const trimmedName = draft.trim();

  return (
    <Dialog aria-label="Переименовать мир" title={<strong>Переименовать мир</strong>} onClose={busy ? undefined : onCancel}>
      <form className={styles.renameForm} onSubmit={(event) => {
        event.preventDefault();
        if (!busy && trimmedName) onRename(trimmedName);
      }}>
        <TextField
          label="Название мира"
          data-dialog-autofocus
          value={draft}
          disabled={busy}
          onInput={(event) => setDraft(event.currentTarget.value)}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Toolbar>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Отмена</Button>
          <Button type="submit" variant="primary" disabled={busy || !trimmedName}>Сохранить</Button>
        </Toolbar>
      </form>
    </Dialog>
  );
}
