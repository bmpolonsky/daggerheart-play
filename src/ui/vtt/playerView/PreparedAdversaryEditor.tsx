/** @jsxImportSource preact */
import { Plus, Trash2, X } from 'lucide-react';
import { useState } from 'preact/hooks';
import { createId } from '../../../core/utils/id';
import { ADVERSARY_TYPES, DAMAGE_TYPE_LABELS, RANGES, adversaryTypeLabel } from '../../../domain/rules/constants';
import type { Adversary, AdversaryFeature, DamageType } from '../../../domain/rules/types';
import { preparedActorService } from '../../../services/serviceRegistry';
import { Button, Dialog, IconButton, ImageFilePicker, NumberControl, SelectControl, TextAreaControl, TextControl } from '../../components/common';
import { readFileAsDataUrl } from './sharedTools/readFileAsDataUrl';

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
  const setType = (type: Adversary['type']) => setDraft((current) => ({
    ...current,
    type,
    hordePerHp: type === 'Horde' ? Math.max(1, current.hordePerHp ?? 1) : null
  }));
  const save = () => {
    if (!draft.name.trim()) return;
    const { id: _id, preparedTemplateId: _template, createdAt: _created, updatedAt: _updated, ...patch } = draft;
    if (preparedActorService.updateAdversaryTemplate(adversary.id, { ...patch, name: draft.name.trim() })) onClose();
  };

  return (
    <Dialog
      aria-label={`Редактор шаблона ${adversary.name}`}
      className="player-prepared-editor player-prepared-editor--adversary"
      title={<div className="player-prepared-editor__title"><strong>Редактировать противника</strong><span>Изменения применятся к будущим экземплярам.</span></div>}
      actions={<IconButton variant="ghost" title="Закрыть" aria-label="Закрыть редактор" onClick={onClose}><X size={17} /></IconButton>}
      onClose={onClose}
    >
      <div className="player-prepared-editor__body">
        <section className="player-compendium-statblock" aria-label="Карточка подготовленного противника">
          <div className="player-compendium-statblock__identity">
            <div className="player-compendium-statblock__identity-copy">
              <TextAreaControl className="player-compendium-editor__title-control" aria-label="Название" placeholder="Название противника" rows={2} value={draft.name} autoFocus onInput={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))} />
              <div className="player-compendium-statblock__meta">
                <label>Ранг <NumberControl tone="plain" aria-label="Ранг" min={1} max={4} value={draft.tier} onInput={(event) => setDraft((current) => ({ ...current, tier: updateNumber(event.currentTarget.value, current.tier, 1) }))} /></label>
                <label>Тип <SelectControl aria-label="Тип" value={draft.type} onChange={(event) => setType(event.currentTarget.value as Adversary['type'])}>
                  {ADVERSARY_TYPES.map((type) => <option key={type} value={type}>{adversaryTypeLabel(type)}</option>)}
                </SelectControl></label>
              </div>
              <TextAreaControl className="player-compendium-editor__summary-control" aria-label="Кратко" placeholder="Краткое описание" rows={2} value={draft.summary} onInput={(event) => setDraft((current) => ({ ...current, summary: event.currentTarget.value }))} />
            </div>
            <ImageFilePicker
              label="Изображение"
              className="player-compendium-editor__art-picker"
              imageUrl={draft.imageUrl ?? ''}
              aspectRatio="1 / 1"
              hideLabel
              size="compact"
              previewStyle={{ objectFit: 'contain' }}
              onFileSelect={async (file) => {
                const imageUrl = await readFileAsDataUrl(file);
                setDraft((current) => ({ ...current, imageUrl }));
              }}
              onClear={() => setDraft((current) => ({ ...current, imageUrl: null }))}
            />
          </div>

          <label className="player-compendium-statblock__prose player-compendium-statblock__prose--editable"><strong>Мотивы и тактика</strong><TextAreaControl className="player-compendium-editor__summary-control" aria-label="Мотивы и тактика" rows={2} value={draft.motives} onInput={(event) => setDraft((current) => ({ ...current, motives: event.currentTarget.value }))} /></label>

          <div className="player-compendium-statblock__rules">
            <div className="player-compendium-statblock__line">
              <InlineNumber label="Сложность" min={0} value={draft.difficulty} onInput={(value) => setDraft((current) => ({ ...current, difficulty: updateNumber(value, current.difficulty) }))} />
              <div className="player-compendium-statblock__number player-compendium-statblock__thresholds">
                <strong>Пороги</strong>
                <NumberControl tone="plain" aria-label="Ощутимый порог" min={0} value={draft.thresholds.major} onInput={(event) => setDraft((current) => ({ ...current, thresholds: { ...current.thresholds, major: updateNumber(event.currentTarget.value, current.thresholds.major) } }))} />
                <span>/</span>
                <NumberControl tone="plain" aria-label="Тяжёлый порог" min={0} value={draft.thresholds.severe} onInput={(event) => setDraft((current) => ({ ...current, thresholds: { ...current.thresholds, severe: updateNumber(event.currentTarget.value, current.thresholds.severe) } }))} />
              </div>
              <InlineNumber label="Раны" min={1} value={draft.hp.max} onInput={(value) => setDraft((current) => ({ ...current, hp: { marked: 0, max: updateNumber(value, current.hp.max, 1) } }))} />
              <InlineNumber label="Стресс" min={0} value={draft.stress.max} onInput={(value) => setDraft((current) => ({ ...current, stress: { marked: 0, max: updateNumber(value, current.stress.max) } }))} />
              {draft.type === 'Horde' && <InlineNumber label="Противников на Рану" min={1} value={draft.hordePerHp ?? 1} onInput={(value) => setDraft((current) => ({ ...current, hordePerHp: updateNumber(value, current.hordePerHp ?? 1, 1) }))} />}
            </div>
            <div className="player-compendium-statblock__line player-compendium-statblock__attack">
              <InlineNumber label={draft.attackModifier >= 0 ? 'Атака +' : 'Атака'} value={draft.attackModifier} onInput={(value) => setDraft((current) => ({ ...current, attackModifier: updateNumber(value, current.attackModifier, -99) }))} />
              <TextAreaControl className="player-compendium-statblock__weapon" aria-label="Название атаки" placeholder="Название атаки" rows={1} value={draft.standardAttack.name} onInput={(event) => setDraft((current) => ({ ...current, standardAttack: { ...current.standardAttack, name: event.currentTarget.value } }))} />
              <SelectControl className="player-compendium-statblock__select" aria-label="Дистанция" value={draft.standardAttack.range} onChange={(event) => setDraft((current) => ({ ...current, standardAttack: { ...current.standardAttack, range: event.currentTarget.value } }))}>
                {RANGES.map((range) => <option key={range} value={range}>{range}</option>)}
              </SelectControl>
              <span className="player-compendium-statblock__damage">
                <TextControl tone="plain" className="player-prepared-adversary__damage-formula" aria-label="Урон" value={draft.standardAttack.damageFormula} onInput={(event) => setDraft((current) => ({ ...current, standardAttack: { ...current.standardAttack, damageFormula: event.currentTarget.value } }))} />
                <SelectControl className="player-compendium-statblock__select" aria-label="Тип урона" value={draft.standardAttack.damageType} onChange={(event) => setDraft((current) => ({ ...current, standardAttack: { ...current.standardAttack, damageType: event.currentTarget.value as DamageType } }))}>
                  {(Object.keys(DAMAGE_TYPE_LABELS) as DamageType[]).map((type) => <option key={type} value={type}>{DAMAGE_TYPE_LABELS[type]}</option>)}
                </SelectControl>
              </span>
            </div>
          </div>

          <EditorCollection title="Опыт" onAdd={() => setDraft((current) => ({ ...current, experiences: [...current.experiences, { id: createId('advexp'), name: 'Новый опыт', modifier: 2 }] }))}>
            {draft.experiences.map((experience, index) => (
              <div className="player-compendium-editor__collection-item" key={experience.id}>
                <div className="player-compendium-editor__collection-head">
                  <TextControl tone="plain" aria-label={`Название опыта ${index + 1}`} placeholder="Название опыта" value={experience.name} onInput={(event) => setDraft((current) => ({ ...current, experiences: current.experiences.map((item) => item.id === experience.id ? { ...item, name: event.currentTarget.value } : item) }))} />
                  <div className="player-compendium-editor__move-actions">
                    <NumberControl tone="plain" aria-label={`Модификатор опыта ${index + 1}`} value={experience.modifier} onInput={(event) => setDraft((current) => ({ ...current, experiences: current.experiences.map((item) => item.id === experience.id ? { ...item, modifier: updateNumber(event.currentTarget.value, item.modifier, -99) } : item) }))} />
                    <IconButton variant="ghost" tone="danger" size="xs" title="Удалить опыт" aria-label={`Удалить опыт ${experience.name}`} onClick={() => setDraft((current) => ({ ...current, experiences: current.experiences.filter((item) => item.id !== experience.id) }))}><Trash2 size={13} /></IconButton>
                  </div>
                </div>
              </div>
            ))}
          </EditorCollection>

          <EditorCollection title="Свойства" onAdd={() => setDraft((current) => ({ ...current, features: [...current.features, { id: createId('feature'), name: '', kind: 'action', cost: '', text: '' }] }))}>
            {draft.features.map((feature, index) => (
              <div className="player-compendium-editor__collection-item" key={feature.id}>
                <div className="player-compendium-editor__collection-head">
                  <TextControl tone="plain" aria-label={`Название свойства ${index + 1}`} placeholder="Название свойства" value={feature.name} onInput={(event) => updateFeature(setDraft, feature.id, { name: event.currentTarget.value })} />
                  <IconButton variant="ghost" tone="danger" size="xs" title="Удалить свойство" aria-label={`Удалить свойство ${feature.name || index + 1}`} onClick={() => setDraft((current) => ({ ...current, features: current.features.filter((item) => item.id !== feature.id) }))}><Trash2 size={13} /></IconButton>
                </div>
                <TextAreaControl className="player-compendium-editor__feature-text" aria-label={`Текст свойства ${index + 1}`} placeholder="Текст свойства" rows={2} value={feature.text} onInput={(event) => updateFeature(setDraft, feature.id, { text: event.currentTarget.value })} />
              </div>
            ))}
          </EditorCollection>
        </section>
      </div>
      <footer className="player-prepared-editor__footer">
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button variant="primary" disabled={!draft.name.trim()} onClick={save}>Сохранить</Button>
      </footer>
    </Dialog>
  );
}

function InlineNumber({ label, value, min, onInput }: { label: string; value: number; min?: number; onInput: (value: string) => void }) {
  return <label className="player-compendium-statblock__number"><strong>{label}</strong><NumberControl tone="plain" aria-label={label} min={min} value={value} onInput={(event) => onInput(event.currentTarget.value)} /></label>;
}

function EditorCollection({ title, onAdd, children }: { title: string; onAdd: () => void; children: preact.ComponentChildren }) {
  return (
    <section className="player-compendium-editor__section">
      <header><h4>{title}</h4><Button size="xs" variant="ghost" iconBefore={<Plus size={13} />} onClick={onAdd}>Добавить</Button></header>
      <div className="player-compendium-editor__collection">{children}</div>
    </section>
  );
}

function updateFeature(setDraft: (updater: (current: Adversary) => Adversary) => void, id: string, patch: Partial<AdversaryFeature>) {
  setDraft((current) => ({ ...current, features: current.features.map((feature) => feature.id === id ? { ...feature, ...patch } : feature) }));
}
