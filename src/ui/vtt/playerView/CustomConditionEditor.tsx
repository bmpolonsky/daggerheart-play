/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { applyCustomConditionEdit, type CustomConditionDraft, type CustomConditionRecord } from '../../../domain/rules/customConditions';
import { Button, Dialog, Notice, TextAreaField, TextField } from '../../components/common';
import styles from './CustomConditionEditor.module.css';

export interface CustomConditionEditorProps {
  conditions: CustomConditionRecord[];
  condition?: CustomConditionRecord;
  onSave: (draft: CustomConditionDraft) => boolean | void;
  onClose: () => void;
}

export function CustomConditionEditor({ conditions, condition, onSave, onClose }: CustomConditionEditorProps) {
  const [draft, setDraft] = useState<CustomConditionDraft>({
    name: condition?.name ?? '',
    notes: condition?.notes ?? '',
    removalCondition: condition?.removalCondition ?? ''
  });
  const [issue, setIssue] = useState<string | null>(null);
  const title = condition ? 'Изменить состояние' : 'Пользовательское состояние';
  return (
    <Dialog className={styles.dialog} title={<h2>{title}</h2>} aria-label={title} onClose={onClose}>
      <form className={styles.form} onSubmit={(event) => {
        event.preventDefault();
        const plan = applyCustomConditionEdit(conditions, draft, condition?.id ?? 'new-custom-condition');
        if (plan.issue) { setIssue(plan.issue); return; }
        if (onSave(draft) === false) { setIssue('Не удалось сохранить состояние. Проверьте лист и повторите.'); return; }
        onClose();
      }}>
        <TextField label="Название состояния" value={draft.name} required autoFocus onInput={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))} />
        <TextAreaField label="Описание состояния" value={draft.notes} rows={3} onInput={(event) => setDraft((current) => ({ ...current, notes: event.currentTarget.value }))} />
        <TextAreaField label="Условие снятия" value={draft.removalCondition} rows={2} hint="Памятка: состояние снимается вручную." onInput={(event) => setDraft((current) => ({ ...current, removalCondition: event.currentTarget.value }))} />
        {issue && <Notice tone="error" role="alert">{issue}</Notice>}
        <div className={styles.actions}>
          <Button type="button" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="primary">Сохранить состояние</Button>
        </div>
      </form>
    </Dialog>
  );
}
