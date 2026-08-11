/** @jsxImportSource preact */
import { X } from 'lucide-react';
import { useState } from 'preact/hooks';
import type { EncounterEnvironment } from '../../../domain/rules/types';
import { preparedActorService } from '../../../services/serviceRegistry';
import { Button, Dialog, IconButton, NumberField, TextAreaField, TextField } from '../../components/common';

export function PreparedEnvironmentEditor({ environment, onClose }: { environment: EncounterEnvironment; onClose: () => void }) {
  const [draft, setDraft] = useState<EncounterEnvironment>(() => ({ ...environment }));
  const numberValue = (value: string, fallback: number, min = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.trunc(parsed)) : fallback;
  };
  const save = () => {
    if (!draft.name.trim()) return;
    const { id: _id, preparedTemplateId: _template, createdAt: _created, updatedAt: _updated, ...patch } = draft;
    if (preparedActorService.updateEnvironmentTemplate(environment.id, { ...patch, name: draft.name.trim() })) onClose();
  };

  return (
    <Dialog
      aria-label={`Редактор шаблона ${environment.name}`}
      className="player-prepared-editor"
      title={<div className="player-prepared-editor__title"><strong>Редактировать окружение</strong><span>Изменения применятся к будущим экземплярам.</span></div>}
      actions={<IconButton variant="ghost" title="Закрыть" aria-label="Закрыть редактор" onClick={onClose}><X size={17} /></IconButton>}
      onClose={onClose}
    >
      <div className="player-prepared-editor__body">
        <section className="player-prepared-editor__grid player-prepared-editor__grid--identity">
          <TextField label="Название" value={draft.name} autoFocus onInput={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))} />
          <NumberField label="Ранг" min={1} max={4} value={draft.tier} onInput={(event) => setDraft((current) => ({ ...current, tier: numberValue(event.currentTarget.value, current.tier, 1) }))} />
          <NumberField label="Сложность" min={0} value={draft.difficulty} onInput={(event) => setDraft((current) => ({ ...current, difficulty: numberValue(event.currentTarget.value, current.difficulty) }))} />
          <TextField label="Тип" value={draft.typeName} onInput={(event) => setDraft((current) => ({ ...current, typeName: event.currentTarget.value }))} />
        </section>
        <section className="player-prepared-editor__grid player-prepared-editor__grid--text">
          <TextAreaField label="Кратко" value={draft.summary} onInput={(event) => setDraft((current) => ({ ...current, summary: event.currentTarget.value }))} />
          <TextAreaField label="Импульсы" value={draft.impulses} onInput={(event) => setDraft((current) => ({ ...current, impulses: event.currentTarget.value }))} />
          <TextAreaField label="Потенциальные противники" value={draft.potentialAdversaries} onInput={(event) => setDraft((current) => ({ ...current, potentialAdversaries: event.currentTarget.value }))} />
          <TextAreaField label="Особенности" value={draft.featureText} onInput={(event) => setDraft((current) => ({ ...current, featureText: event.currentTarget.value }))} />
          <TextAreaField label="Описание" value={draft.body} onInput={(event) => setDraft((current) => ({ ...current, body: event.currentTarget.value }))} />
          <TextAreaField label="Заметки мастера" value={draft.notes} onInput={(event) => setDraft((current) => ({ ...current, notes: event.currentTarget.value }))} />
        </section>
        <TextField label="Изображение (URL)" value={draft.imageUrl ?? ''} onInput={(event) => setDraft((current) => ({ ...current, imageUrl: event.currentTarget.value.trim() || null }))} />
      </div>
      <footer className="player-prepared-editor__footer">
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant="primary" disabled={!draft.name.trim()} onClick={save}>Сохранить</Button>
      </footer>
    </Dialog>
  );
}
