/** @jsxImportSource preact */
import { Plus, Trash2, X } from 'lucide-react';
import { useState } from 'preact/hooks';
import { createId } from '../../../core/utils/id';
import { ADVERSARY_TYPES, DAMAGE_TYPE_LABELS, RANGES, adversaryTypeLabel } from '../../../domain/rules/constants';
import type { Adversary, AdversaryFeature, DamageType } from '../../../domain/rules/types';
import { preparedActorService } from '../../../services/serviceRegistry';
import { Button, Dialog, IconButton, NumberField, SelectField, TextAreaField, TextField } from '../../components/common';

const FEATURE_KINDS: Array<{ id: AdversaryFeature['kind']; label: string }> = [
  { id: 'action', label: 'Действие' },
  { id: 'reaction', label: 'Реакция' },
  { id: 'passive', label: 'Пассивное' },
  { id: 'fear', label: 'Страх' }
];

export function PreparedAdversaryEditor({ adversary, onClose }: { adversary: Adversary; onClose: () => void }) {
  const [draft, setDraft] = useState<Adversary>(() => ({
    ...adversary,
    hp: { ...adversary.hp, marked: 0 },
    stress: { ...adversary.stress, marked: 0 },
    thresholds: { ...adversary.thresholds },
    standardAttack: { ...adversary.standardAttack },
    experiences: adversary.experiences.map((experience) => ({ ...experience })),
    features: adversary.features.map((feature) => ({ ...feature })),
    conditions: []
  }));
  const updateNumber = (value: string, fallback: number, min = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.trunc(parsed)) : fallback;
  };
  const save = () => {
    if (!draft.name.trim()) return;
    const { id: _id, preparedTemplateId: _template, createdAt: _created, updatedAt: _updated, ...patch } = draft;
    if (preparedActorService.updateAdversaryTemplate(adversary.id, { ...patch, name: draft.name.trim() })) onClose();
  };

  return (
    <Dialog
      aria-label={`Редактор шаблона ${adversary.name}`}
      className="player-prepared-editor"
      title={<div className="player-prepared-editor__title"><strong>Редактировать противника</strong><span>Изменения применятся к будущим экземплярам.</span></div>}
      actions={<IconButton variant="ghost" title="Закрыть" aria-label="Закрыть редактор" onClick={onClose}><X size={17} /></IconButton>}
      onClose={onClose}
    >
      <div className="player-prepared-editor__body">
        <section className="player-prepared-editor__grid player-prepared-editor__grid--identity">
          <TextField label="Название" value={draft.name} autoFocus onInput={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))} />
          <NumberField label="Ранг" min={1} max={4} value={draft.tier} onInput={(event) => setDraft((current) => ({ ...current, tier: updateNumber(event.currentTarget.value, current.tier, 1) }))} />
          <SelectField label="Роль" value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.currentTarget.value as Adversary['type'] }))}>
            {ADVERSARY_TYPES.map((type) => <option key={type} value={type}>{adversaryTypeLabel(type)}</option>)}
          </SelectField>
        </section>

        <section className="player-prepared-editor__grid player-prepared-editor__grid--stats">
          <NumberField label="Сложность" min={0} value={draft.difficulty} onInput={(event) => setDraft((current) => ({ ...current, difficulty: updateNumber(event.currentTarget.value, current.difficulty) }))} />
          <NumberField label="Раны" min={1} value={draft.hp.max} onInput={(event) => setDraft((current) => ({ ...current, hp: { marked: 0, max: updateNumber(event.currentTarget.value, current.hp.max, 1) } }))} />
          <NumberField label="Стресс" min={0} value={draft.stress.max} onInput={(event) => setDraft((current) => ({ ...current, stress: { marked: 0, max: updateNumber(event.currentTarget.value, current.stress.max) } }))} />
          <NumberField label="Порог ощутимого" min={0} value={draft.thresholds.major} onInput={(event) => setDraft((current) => ({ ...current, thresholds: { ...current.thresholds, major: updateNumber(event.currentTarget.value, current.thresholds.major) } }))} />
          <NumberField label="Порог тяжёлого" min={0} value={draft.thresholds.severe} onInput={(event) => setDraft((current) => ({ ...current, thresholds: { ...current.thresholds, severe: updateNumber(event.currentTarget.value, current.thresholds.severe) } }))} />
          <NumberField label="Модификатор атаки" value={draft.attackModifier} onInput={(event) => setDraft((current) => ({ ...current, attackModifier: updateNumber(event.currentTarget.value, current.attackModifier, -99) }))} />
        </section>

        <section className="player-prepared-editor__section">
          <h3>Обычная атака</h3>
          <div className="player-prepared-editor__grid player-prepared-editor__grid--attack">
            <TextField label="Название" value={draft.standardAttack.name} onInput={(event) => setDraft((current) => ({ ...current, standardAttack: { ...current.standardAttack, name: event.currentTarget.value } }))} />
            <SelectField label="Дистанция" value={draft.standardAttack.range} onChange={(event) => setDraft((current) => ({ ...current, standardAttack: { ...current.standardAttack, range: event.currentTarget.value } }))}>
              {RANGES.map((range) => <option key={range} value={range}>{range}</option>)}
            </SelectField>
            <TextField label="Урон" value={draft.standardAttack.damageFormula} onInput={(event) => setDraft((current) => ({ ...current, standardAttack: { ...current.standardAttack, damageFormula: event.currentTarget.value } }))} />
            <SelectField label="Тип урона" value={draft.standardAttack.damageType} onChange={(event) => setDraft((current) => ({ ...current, standardAttack: { ...current.standardAttack, damageType: event.currentTarget.value as DamageType } }))}>
              {(Object.keys(DAMAGE_TYPE_LABELS) as DamageType[]).map((type) => <option key={type} value={type}>{DAMAGE_TYPE_LABELS[type]}</option>)}
            </SelectField>
          </div>
        </section>

        <section className="player-prepared-editor__section">
          <h3>Описание</h3>
          <div className="player-prepared-editor__grid player-prepared-editor__grid--text">
            <TextAreaField label="Кратко" value={draft.summary} onInput={(event) => setDraft((current) => ({ ...current, summary: event.currentTarget.value }))} />
            <TextAreaField label="Мотивы и тактика" value={draft.motives} onInput={(event) => setDraft((current) => ({ ...current, motives: event.currentTarget.value }))} />
            <TextAreaField label="Полное описание" value={draft.mainBody} onInput={(event) => setDraft((current) => ({ ...current, mainBody: event.currentTarget.value }))} />
            <TextAreaField label="Заметки мастера" value={draft.notes} onInput={(event) => setDraft((current) => ({ ...current, notes: event.currentTarget.value }))} />
          </div>
          <TextField label="Изображение (URL)" value={draft.imageUrl ?? ''} onInput={(event) => setDraft((current) => ({ ...current, imageUrl: event.currentTarget.value.trim() || null }))} />
        </section>

        <EditorCollection
          title="Опыт"
          addLabel="Добавить опыт"
          onAdd={() => setDraft((current) => ({ ...current, experiences: [...current.experiences, { id: createId('advexp'), name: 'Новый опыт', modifier: 2 }] }))}
        >
          {draft.experiences.map((experience) => (
            <div className="player-prepared-editor__collection-row" key={experience.id}>
              <TextField label="Название" value={experience.name} onInput={(event) => setDraft((current) => ({ ...current, experiences: current.experiences.map((item) => item.id === experience.id ? { ...item, name: event.currentTarget.value } : item) }))} />
              <NumberField label="Модификатор" value={experience.modifier} onInput={(event) => setDraft((current) => ({ ...current, experiences: current.experiences.map((item) => item.id === experience.id ? { ...item, modifier: updateNumber(event.currentTarget.value, item.modifier, -99) } : item) }))} />
              <IconButton variant="ghost" tone="danger" title="Удалить опыт" aria-label={`Удалить опыт ${experience.name}`} onClick={() => setDraft((current) => ({ ...current, experiences: current.experiences.filter((item) => item.id !== experience.id) }))}><Trash2 size={14} /></IconButton>
            </div>
          ))}
        </EditorCollection>

        <EditorCollection
          title="Особенности"
          addLabel="Добавить особенность"
          onAdd={() => setDraft((current) => ({ ...current, features: [...current.features, { id: createId('feature'), name: 'Особенность', kind: 'action', cost: '', text: '' }] }))}
        >
          {draft.features.map((feature) => (
            <div className="player-prepared-editor__feature" key={feature.id}>
              <div className="player-prepared-editor__grid player-prepared-editor__grid--feature">
                <TextField label="Название" value={feature.name} onInput={(event) => updateFeature(setDraft, feature.id, { name: event.currentTarget.value })} />
                <SelectField label="Тип" value={feature.kind} onChange={(event) => updateFeature(setDraft, feature.id, { kind: event.currentTarget.value as AdversaryFeature['kind'] })}>
                  {FEATURE_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
                </SelectField>
                <TextField label="Стоимость" value={feature.cost ?? ''} onInput={(event) => updateFeature(setDraft, feature.id, { cost: event.currentTarget.value })} />
                <IconButton variant="ghost" tone="danger" title="Удалить особенность" aria-label={`Удалить особенность ${feature.name}`} onClick={() => setDraft((current) => ({ ...current, features: current.features.filter((item) => item.id !== feature.id) }))}><Trash2 size={14} /></IconButton>
              </div>
              <TextAreaField label="Текст" value={feature.text} onInput={(event) => updateFeature(setDraft, feature.id, { text: event.currentTarget.value })} />
            </div>
          ))}
        </EditorCollection>
      </div>
      <footer className="player-prepared-editor__footer">
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant="primary" disabled={!draft.name.trim()} onClick={save}>Сохранить</Button>
      </footer>
    </Dialog>
  );
}

function EditorCollection({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children: preact.ComponentChildren }) {
  return (
    <section className="player-prepared-editor__section">
      <header><h3>{title}</h3><Button size="xs" variant="ghost" iconBefore={<Plus size={13} />} onClick={onAdd}>{addLabel}</Button></header>
      <div className="player-prepared-editor__collection">{children}</div>
    </section>
  );
}

function updateFeature(setDraft: (updater: (current: Adversary) => Adversary) => void, id: string, patch: Partial<AdversaryFeature>) {
  setDraft((current) => ({ ...current, features: current.features.map((feature) => feature.id === id ? { ...feature, ...patch } : feature) }));
}
