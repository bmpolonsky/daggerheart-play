import { useState } from 'preact/hooks';
import { useStream } from '../core/hooks/useStream';
import { persistenceService } from '../services/serviceRegistry';
import { Button, Dialog, Notice, SelectField, Toolbar } from './components/common';

/** Recovery is always an explicit fork. The source world and newer writes in
 * other tabs remain untouched; closing this dialog keeps the recovery bytes. */
export function RecoveryDialog() {
  const drafts = useStream(persistenceService.recoveryDrafts$);
  const [dismissed, setDismissed] = useState('');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signature = drafts.map(draft => draft.id).join(',');
  if (!drafts.length || signature === dismissed) return null;
  const id = drafts.some(draft => draft.id === selected) ? selected : drafts[0].id;
  const restore = async () => {
    setBusy(true); setError('');
    try {
      if (!await persistenceService.restoreRecoveryDraft(id)) setError('Эта копия уже недоступна. Обновите список и попробуйте снова.');
    } catch { setError('Восстановить копию не удалось. Исходные данные сохранены; попробуйте ещё раз.'); }
    finally { setBusy(false); }
  };
  return (
    <Dialog priority aria-label="Восстановление изменений" title="Найдены несохранённые изменения" onClose={busy ? undefined : () => setDismissed(signature)}>
      <p>Сохранилась локальная копия незаписанных изменений. Можно открыть её как отдельный мир; исходный мир и изменения других вкладок сохранятся.</p>
      <SelectField label="Восстановительная копия" value={id} disabled={busy} onChange={event => setSelected(event.currentTarget.value)}>
        {drafts.map(draft => <option key={draft.id} value={draft.id}>{draft.document.manifest.name} — {new Date(draft.updatedAt).toLocaleString('ru-RU')}</option>)}
      </SelectField>
      {error && <Notice tone="error">{error}</Notice>}
      <Toolbar>
        <Button disabled={busy} onClick={() => setDismissed(signature)}>Не сейчас</Button>
        <Button variant="primary" disabled={busy} onClick={() => { void restore(); }}>{busy ? 'Восстановление…' : 'Восстановить отдельный мир'}</Button>
      </Toolbar>
    </Dialog>
  );
}
