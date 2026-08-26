/** @jsxImportSource preact */
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { EditableContentCollectionKey, EditableRawContent, RawAdversaryFeature } from '../../../../domain/content/types';
import { cleanCustomContentDraft, createCustomContentDraft, validateCustomContentDraft, type CustomContentDraft } from '../../../../domain/content/customContentDraft';
import { ADVERSARY_TYPES, DAMAGE_TYPE_LABELS, DOMAIN_LABELS, DOMAIN_NAMES, RANGE_OPTIONS, TRAIT_LABELS } from '../../../../domain/rules/constants';
import type { TraitId } from '../../../../domain/rules/types';
import { contentService } from '../../../../services/serviceRegistry';
import { Button, ConfirmDialog, IconButton, ImageFilePicker, Notice, NumberField, SelectField, TextAreaField, TextField } from '../../../components/common';
import { readFileAsDataUrl } from '../sharedTools/readFileAsDataUrl';

export interface CompendiumEditorTarget {
  collection: EditableContentCollectionKey;
  raw: EditableRawContent;
  persisted: boolean;
}

const LABELS: Record<EditableContentCollectionKey, string> = {
  adversaries: 'противника',
  classes: 'класс',
  environments: 'окружение',
  beastforms: 'звероформу',
  ancestries: 'родословную',
  communities: 'сообщество',
  subclasses: 'подкласс',
  domainCards: 'карту домена',
  equipment: 'снаряжение'
};

type RawRecord = CustomContentDraft;

export function CompendiumEntityEditor({ target, onClose, onDirtyChange, onSaved }: {
  target: CompendiumEditorTarget;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: (target: CompendiumEditorTarget) => void;
}) {
  const initial = useMemo(() => createCustomContentDraft(target.collection, target.raw), [target.collection, target.raw]);
  const [draft, setDraft] = useState<RawRecord>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const dirty = JSON.stringify(draft) !== baseline;
  const name = text(draft.name ?? draft.title);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const setField = (key: string, value: unknown) => {
    setNotice(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const close = () => {
    if (dirty && typeof window !== 'undefined' && !window.confirm('Отменить несохранённые изменения?')) return;
    onClose();
  };
  const save = async () => {
    const validationError = validateCustomContentDraft(target.collection, draft);
    if (validationError) {
      setNotice({ tone: 'error', message: validationError });
      return;
    }
    try {
      const saved = await contentService.saveCustomContent(target.collection, cleanCustomContentDraft(draft));
      const next = createCustomContentDraft(target.collection, saved);
      setDraft(next);
      setBaseline(JSON.stringify(next));
      setNotice({ tone: 'success', message: 'Материал сохранён.' });
      onSaved?.({ collection: target.collection, raw: saved, persisted: true });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Не удалось сохранить материал.' });
    }
  };
  const remove = async () => {
    const id = draft.id ?? draft.slug;
    if (id === undefined) return;
    try {
      await contentService.removeCustomContent(target.collection, id as string | number);
      onClose();
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Не удалось удалить материал.' });
    }
  };

  return (
    <aside className="player-library-detail player-compendium-editor" aria-label={`Редактор: ${name || LABELS[target.collection]}`}>
      <div className="player-library-detail__body">
        <IconButton className="player-library-detail__close" type="button" variant="ghost" size="sm" title="Закрыть редактор" aria-label="Закрыть редактор" onClick={close}>
          <X size={18} aria-hidden="true" />
        </IconButton>
        <header className="player-compendium-editor__header">
          <span className="player-library-card__kicker">Свой материал</span>
          <h3>{target.persisted ? `Редактировать ${LABELS[target.collection]}` : `Создать ${LABELS[target.collection]}`}</h3>
        </header>
        {notice && <Notice tone={notice.tone}>{notice.message}</Notice>}
        <div className="player-custom-compendium-form">
          <IdentityFields collection={target.collection} draft={draft} setField={setField} />
          <CollectionFields collection={target.collection} draft={draft} setField={setField} />
        </div>
      </div>
      <footer className="player-library-detail__footer player-compendium-editor__footer">
        {target.persisted && (
          <IconButton variant="danger" size="sm" title="Удалить" aria-label="Удалить материал" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={15} aria-hidden="true" />
          </IconButton>
        )}
        <Button variant="ghost" onClick={close}>Отмена</Button>
        <Button variant="primary" disabled={!name} onClick={() => void save()}>Сохранить</Button>
      </footer>
      {deleteOpen && (
        <ConfirmDialog
          title={`Удалить «${name || 'Без названия'}»?`}
          body="Материал исчезнет из компендиума. Уже подготовленные игровые экземпляры не изменятся."
          confirmLabel="Удалить"
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => { setDeleteOpen(false); void remove(); }}
        />
      )}
    </aside>
  );
}

function IdentityFields({ collection, draft, setField }: EditorFieldsProps) {
  const supportsImage = collection !== 'beastforms';
  return (
    <section className="player-compendium-editor__section">
      <div className="player-custom-compendium-grid player-custom-compendium-grid--media">
        <div className="player-compendium-editor__identity-fields">
          <TextField label="Название" value={text(draft.name ?? draft.title)} autoFocus onInput={(event) => setField('name', event.currentTarget.value)} />
          {(collection === 'adversaries' || collection === 'environments' || collection === 'classes' || collection === 'beastforms') && (
            <TextAreaField label="Кратко" rows={3} value={text(draft.short_description)} onInput={(event) => setField('short_description', event.currentTarget.value)} />
          )}
        </div>
        {supportsImage && (
          <ImageFilePicker
            label="Изображение"
            imageUrl={text(draft.image_url)}
            aspectRatio="4 / 3"
            onFileSelect={async (file) => setField('image_url', await readFileAsDataUrl(file))}
            onClear={() => setField('image_url', null)}
          />
        )}
      </div>
    </section>
  );
}

interface EditorFieldsProps {
  collection: EditableContentCollectionKey;
  draft: RawRecord;
  setField: (key: string, value: unknown) => void;
}

function CollectionFields(props: EditorFieldsProps) {
  switch (props.collection) {
    case 'adversaries': return <AdversaryFields {...props} />;
    case 'environments': return <EnvironmentFields {...props} />;
    case 'classes': return <ClassFields {...props} />;
    case 'subclasses': return <SubclassFields {...props} />;
    case 'domainCards': return <DomainCardFields {...props} />;
    case 'equipment': return <EquipmentFields {...props} />;
    case 'beastforms': return <BeastformFields {...props} />;
    case 'ancestries':
    case 'communities': return <CardLikeFields {...props} />;
  }
}

function AdversaryFields({ draft, setField }: EditorFieldsProps) {
  const thresholds = numberArray(draft.damage_thresholds, [0, 0]);
  return <>
    <EditorSection title="Основные параметры">
      <div className="player-custom-compendium-grid player-custom-compendium-grid--stats">
        <NumberField label="Ранг" min={1} max={4} value={number(draft.tier, 1)} onInput={(event) => setField('tier', int(event.currentTarget.value, 1))} />
        <SelectField label="Роль" value={text(draft.type_slug, 'standard')} onChange={(event) => setField('type_slug', event.currentTarget.value)}>
          {ADVERSARY_TYPES.filter((type) => type !== 'Custom').map((type) => <option key={type} value={type.toLowerCase()}>{type}</option>)}
        </SelectField>
        <NumberField label="Сложность" min={0} value={number(draft.difficulty, 12)} onInput={(event) => setField('difficulty', int(event.currentTarget.value, 12))} />
        <NumberField label="Раны" min={1} value={number(draft.hp, 4)} onInput={(event) => setField('hp', int(event.currentTarget.value, 4))} />
        <NumberField label="Стресс" min={0} value={number(draft.stress, 0)} onInput={(event) => setField('stress', int(event.currentTarget.value, 0))} />
        <NumberField label="Порог ощутимого" min={0} value={thresholds[0]} onInput={(event) => setField('damage_thresholds', [int(event.currentTarget.value, 0), thresholds[1]])} />
        <NumberField label="Порог тяжёлого" min={0} value={thresholds[1]} onInput={(event) => setField('damage_thresholds', [thresholds[0], int(event.currentTarget.value, 0)])} />
        <NumberField label="Ран на противника" min={1} value={nullableNumber(draft.horde_per_hp)} onInput={(event) => setField('horde_per_hp', optionalInt(event.currentTarget.value))} />
      </div>
    </EditorSection>
    <EditorSection title="Обычная атака">
      <div className="player-custom-compendium-grid player-custom-compendium-grid--stats">
        <TextField label="Название атаки" value={text(draft.weapon_name)} onInput={(event) => setField('weapon_name', event.currentTarget.value)} />
        <NumberField label="Модификатор" value={number(draft.attack_bonus, 0)} onInput={(event) => setField('attack_bonus', int(event.currentTarget.value, 0))} />
        <NumberField label="Количество костей" min={0} value={number(draft.damage_die_count, 1)} onInput={(event) => setField('damage_die_count', int(event.currentTarget.value, 1))} />
        <NumberField label="Грани" min={0} value={number(draft.damage_die_size, 6)} onInput={(event) => setField('damage_die_size', int(event.currentTarget.value, 6))} />
        <NumberField label="Бонус урона" value={number(draft.damage_bonus, 0)} onInput={(event) => setField('damage_bonus', int(event.currentTarget.value, 0))} />
        <RangeSelect value={text(draft.attack_range)} onChange={(value) => setField('attack_range', value)} />
        <DamageSelect value={text(draft.damage_type, 'physical')} onChange={(value) => setField('damage_type', value)} />
      </div>
    </EditorSection>
    <EditorSection title="Описание">
      <TextAreaField label="Мотивы и тактика" rows={3} value={text(draft.motives)} onInput={(event) => setField('motives', event.currentTarget.value)} />
      <StringListEditor title="Опыт" values={experienceValues(draft.experiences)} onChange={(values) => setField('experiences', values.join('; '))} />
      <TextAreaField label="Полное описание" rows={5} value={text(draft.main_body)} onInput={(event) => setField('main_body', event.currentTarget.value)} />
    </EditorSection>
    <FeatureListEditor title="Особенности" value={draft.features} includeAdversaryFields onChange={(features) => setField('features', features)} />
  </>;
}

function EnvironmentFields({ draft, setField }: EditorFieldsProps) {
  return <>
    <EditorSection title="Параметры">
      <div className="player-custom-compendium-grid player-custom-compendium-grid--stats">
        <NumberField label="Ранг" min={1} max={4} value={number(draft.tier, 1)} onInput={(event) => setField('tier', int(event.currentTarget.value, 1))} />
        <NumberField label="Сложность" min={0} value={number(draft.difficulty, 12)} onInput={(event) => setField('difficulty', int(event.currentTarget.value, 12))} />
        <TextField label="Тип" value={text(draft.type_name, 'Окружение')} onInput={(event) => setField('type_name', event.currentTarget.value)} />
      </div>
    </EditorSection>
    <EditorSection title="Описание">
      <TextAreaField label="Описание" rows={5} value={text(draft.main_body)} onInput={(event) => setField('main_body', event.currentTarget.value)} />
      <TextAreaField label="Импульсы" rows={3} value={text(draft.impulses)} onInput={(event) => setField('impulses', event.currentTarget.value)} />
      <TextAreaField label="Потенциальные противники" rows={3} value={text(draft.potential_adversaries)} onInput={(event) => setField('potential_adversaries', event.currentTarget.value)} />
    </EditorSection>
    <FeatureListEditor title="Особенности" value={draft.features} onChange={(features) => setField('features', features)} />
  </>;
}

function ClassFields({ draft, setField }: EditorFieldsProps) {
  const domains = stringArray(draft.domain_slugs);
  return <>
    <EditorSection title="Параметры класса">
      <div className="player-custom-compendium-grid player-custom-compendium-grid--stats">
        <NumberField label="Уклонение" min={0} value={number(draft.evasion, 10)} onInput={(event) => setField('evasion', int(event.currentTarget.value, 10))} />
        <NumberField label="Раны" min={1} value={number(draft.hp, 6)} onInput={(event) => setField('hp', int(event.currentTarget.value, 6))} />
        <DomainSelect label="Первый домен" value={domains[0] ?? ''} onChange={(value) => setField('domain_slugs', compact([value, domains[1]]))} />
        <DomainSelect label="Второй домен" value={domains[1] ?? ''} onChange={(value) => setField('domain_slugs', compact([domains[0], value]))} />
      </div>
      <TextAreaField label="Описание" rows={5} value={text(draft.description ?? draft.main_body)} onInput={(event) => setField('description', event.currentTarget.value)} />
    </EditorSection>
    <FeatureListEditor title="Свойства класса" value={draft.features} onChange={(features) => setField('features', features)} />
    <StringListEditor title="Начальные предметы" values={stringArray(draft.class_items)} onChange={(values) => setField('class_items', values)} />
    <StringListEditor title="Вопросы предыстории" values={stringArray(draft.background_questions)} onChange={(values) => setField('background_questions', values)} />
    <StringListEditor title="Вопросы связей" values={stringArray(draft.connection_questions)} onChange={(values) => setField('connection_questions', values)} />
  </>;
}

function SubclassFields({ draft, setField }: EditorFieldsProps) {
  const classes = contentService.content$.get().classes;
  return <>
    <EditorSection title="Параметры подкласса">
      <div className="player-custom-compendium-grid player-custom-compendium-grid--stats">
        <SelectField label="Класс" value={text(draft.class_slug)} onChange={(event) => {
          const selected = classes.find((item) => item.slug === event.currentTarget.value);
          setField('class_slug', event.currentTarget.value);
          if (selected) setField('class_name', selected.name);
        }}>
          <option value="">Не выбран</option>
          {classes.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
        </SelectField>
        <TraitSelect label="Характеристика заклинателя" value={text(draft.spellcast_trait)} allowEmpty onChange={(value) => setField('spellcast_trait', value || null)} />
      </div>
      <TextAreaField label="Описание" rows={4} value={text(draft.description ?? draft.main_body)} onInput={(event) => setField('description', event.currentTarget.value)} />
    </EditorSection>
    <FeatureListEditor title="Основа" value={draft.foundation_features} onChange={(features) => setField('foundation_features', features)} />
    <FeatureListEditor title="Специализация" value={draft.specialization_features} onChange={(features) => setField('specialization_features', features)} />
    <FeatureListEditor title="Мастерство" value={draft.mastery_features} onChange={(features) => setField('mastery_features', features)} />
  </>;
}

function CardLikeFields({ draft, setField }: EditorFieldsProps) {
  return <>
    <EditorSection title="Описание">
      <TextAreaField label="Краткое описание" rows={3} value={text(draft.short_description)} onInput={(event) => setField('short_description', event.currentTarget.value)} />
      <TextAreaField label="Описание" rows={5} value={text(draft.description ?? draft.main_body)} onInput={(event) => setField('description', event.currentTarget.value)} />
    </EditorSection>
    <FeatureListEditor title="Свойства" value={draft.features} onChange={(features) => setField('features', features)} />
  </>;
}

function DomainCardFields({ draft, setField }: EditorFieldsProps) {
  return <>
    <EditorSection title="Параметры карты">
      <div className="player-custom-compendium-grid player-custom-compendium-grid--stats">
        <DomainSelect label="Домен" value={text(draft.domain_slug)} onChange={(value) => {
          setField('domain_slug', value);
          const domain = DOMAIN_NAMES.find((item) => item.toLowerCase() === value);
          if (domain) setField('domain_name', DOMAIN_LABELS[domain]);
        }} />
        <NumberField label="Уровень" min={1} max={10} value={number(draft.level, 1)} onInput={(event) => setField('level', int(event.currentTarget.value, 1))} />
        <SelectField label="Тип" value={text(draft.card_type, 'ability')} onChange={(event) => setField('card_type', event.currentTarget.value)}>
          <option value="ability">Способность</option><option value="spell">Заклинание</option><option value="grimoire">Гримуар</option>
        </SelectField>
        <NumberField label="Стоимость призыва" min={0} value={number(draft.stress_cost, 0)} onInput={(event) => setField('stress_cost', int(event.currentTarget.value, 0))} />
        <TextField label="Стоимость активации" value={text(draft.activation_cost)} onInput={(event) => setField('activation_cost', event.currentTarget.value)} />
      </div>
      <TextAreaField label="Описание" rows={4} value={text(draft.description ?? draft.main_body)} onInput={(event) => setField('description', event.currentTarget.value)} />
    </EditorSection>
    <FeatureListEditor title="Свойства" value={draft.features} onChange={(features) => setField('features', features)} />
  </>;
}

function EquipmentFields({ draft, setField }: EditorFieldsProps) {
  const type = text(draft.type_slug, 'item');
  const isWeapon = type === 'primary-weapon' || type === 'secondary-weapon' || type === 'combat-wheelchair';
  const isArmor = type === 'armor';
  const thresholds = numberArray(draft.base_thresholds, [0, 0]);
  return <>
    <EditorSection title="Параметры снаряжения">
      <div className="player-custom-compendium-grid player-custom-compendium-grid--stats">
        <SelectField label="Тип" value={type} onChange={(event) => setField('type_slug', event.currentTarget.value)}>
          <option value="primary-weapon">Основное оружие</option><option value="secondary-weapon">Дополнительное оружие</option><option value="armor">Броня</option><option value="consumable">Расходник</option><option value="item">Предмет</option><option value="combat-wheelchair">Боевое кресло</option>
        </SelectField>
        <NumberField label="Ранг" min={1} max={4} value={number(draft.tier, 1)} onInput={(event) => setField('tier', int(event.currentTarget.value, 1))} />
        <NumberField label="Использования" min={0} value={nullableNumber(draft.uses)} onInput={(event) => setField('uses', optionalInt(event.currentTarget.value))} />
        {isWeapon && <TraitSelect label="Характеристика" value={text(draft.char_trait)} allowSpellcast onChange={(value) => setField('char_trait', value)} />}
        {isWeapon && <RangeSelect value={text(draft.range)} onChange={(value) => setField('range', value)} />}
        {isWeapon && <NumberField label="Количество костей" min={0} value={number(draft.die_num, 1)} onInput={(event) => setField('die_num', int(event.currentTarget.value, 1))} />}
        {isWeapon && <NumberField label="Грани" min={0} value={number(draft.die_size, 8)} onInput={(event) => setField('die_size', int(event.currentTarget.value, 8))} />}
        {isWeapon && <NumberField label="Бонус урона" value={number(draft.bonus, 0)} onInput={(event) => setField('bonus', int(event.currentTarget.value, 0))} />}
        {isWeapon && <DamageSelect value={text(draft.damage_ty, 'physical')} onChange={(value) => setField('damage_ty', value)} />}
        {isWeapon && <SelectField label="Хват" value={String(number(draft.burden, 1))} onChange={(event) => setField('burden', int(event.currentTarget.value, 1))}><option value="1">Одноручное</option><option value="2">Двуручное</option></SelectField>}
        {isArmor && <NumberField label="Показатель брони" min={0} value={number(draft.armor_score, 0)} onInput={(event) => setField('armor_score', int(event.currentTarget.value, 0))} />}
        {isArmor && <NumberField label="Порог ощутимого" min={0} value={thresholds[0]} onInput={(event) => setField('base_thresholds', [int(event.currentTarget.value, 0), thresholds[1]])} />}
        {isArmor && <NumberField label="Порог тяжёлого" min={0} value={thresholds[1]} onInput={(event) => setField('base_thresholds', [thresholds[0], int(event.currentTarget.value, 0)])} />}
      </div>
    </EditorSection>
    <FeatureListEditor title="Свойства" value={draft.features} onChange={(features) => setField('features', features)} />
  </>;
}

function BeastformFields({ draft, setField }: EditorFieldsProps) {
  return <>
    <EditorSection title="Параметры звероформы">
      <div className="player-custom-compendium-grid player-custom-compendium-grid--stats">
        <NumberField label="Ранг" min={1} max={4} value={number(draft.tier, 1)} onInput={(event) => setField('tier', int(event.currentTarget.value, 1))} />
        <NumberField label="Уровень" min={1} max={10} value={nullableNumber(draft.level)} onInput={(event) => setField('level', optionalInt(event.currentTarget.value))} />
        <NumberField label="Модификатор уклонения" value={number(draft.evasion, 0)} onInput={(event) => setField('evasion', int(event.currentTarget.value, 0))} />
        <TraitSelect label="Атака через" value={text(draft.attack_trait, 'agility')} onChange={(value) => setField('attack_trait', value)} />
        <NumberField label="Грани урона" min={0} value={number(draft.attack_die, 8)} onInput={(event) => setField('attack_die', int(event.currentTarget.value, 8))} />
        <NumberField label="Бонус урона" value={number(draft.attack_bonus, 0)} onInput={(event) => setField('attack_bonus', int(event.currentTarget.value, 0))} />
        <RangeSelect value={text(draft.attack_range)} onChange={(value) => setField('attack_range', value)} />
        <DamageSelect value={text(draft.attack_type, 'physical')} onChange={(value) => setField('attack_type', value)} />
        <TraitSelect label="Преимущество к характеристике" value={text(draft.trait_type)} allowEmpty onChange={(value) => setField('trait_type', value || null)} />
        <NumberField label="Бонус характеристики" value={number(draft.trait_bonus, 0)} onInput={(event) => setField('trait_bonus', int(event.currentTarget.value, 0))} />
      </div>
    </EditorSection>
    <EditorSection title="Описание">
      <TextAreaField label="Примеры" rows={3} value={text(draft.examples)} onInput={(event) => setField('examples', event.currentTarget.value)} />
      <TextAreaField label="Преимущества" rows={3} value={text(draft.advantages)} onInput={(event) => setField('advantages', event.currentTarget.value)} />
    </EditorSection>
    <FeatureListEditor title="Особенности" value={draft.features} onChange={(features) => setField('features', features)} />
  </>;
}

function FeatureListEditor({ title, value, includeAdversaryFields = false, onChange }: { title: string; value: unknown; includeAdversaryFields?: boolean; onChange: (features: RawAdversaryFeature[]) => void }) {
  const features = featureArray(value);
  const update = (index: number, patch: RawAdversaryFeature) => onChange(features.map((feature, itemIndex) => itemIndex === index ? { ...feature, ...patch } : feature));
  return (
    <EditorSection title={title} action={<Button size="xs" variant="ghost" iconBefore={<Plus size={13} />} onClick={() => onChange([...features, { id: `feature-${Date.now()}`, name: '', main_body: '' }])}>Добавить</Button>}>
      <div className="player-compendium-editor__collection">
        {features.map((feature, index) => (
          <div className="player-compendium-editor__collection-item" key={String(feature.id ?? index)}>
            <div className="player-compendium-editor__collection-head">
              <TextField label="Название" value={text(feature.name)} onInput={(event) => update(index, { name: event.currentTarget.value })} />
              {includeAdversaryFields && <SelectField label="Тип" value={text(feature.kind, 'action')} onChange={(event) => update(index, { kind: event.currentTarget.value })}><option value="action">Действие</option><option value="reaction">Реакция</option><option value="passive">Пассивное</option><option value="fear">Страх</option></SelectField>}
              {includeAdversaryFields && <TextField label="Стоимость" value={text(feature.cost)} onInput={(event) => update(index, { cost: event.currentTarget.value })} />}
              <MoveButtons index={index} length={features.length} onMove={(next) => onChange(move(features, index, next))} onRemove={() => onChange(features.filter((_, itemIndex) => itemIndex !== index))} label={text(feature.name, 'особенность')} />
            </div>
            <TextAreaField label="Текст" rows={3} value={text(feature.main_body ?? feature.text)} onInput={(event) => update(index, { main_body: event.currentTarget.value })} />
          </div>
        ))}
        {features.length === 0 && <p className="player-tools-empty">Пока ничего нет.</p>}
      </div>
    </EditorSection>
  );
}

function StringListEditor({ title, values, onChange }: { title: string; values: string[]; onChange: (values: string[]) => void }) {
  return (
    <EditorSection title={title} action={<Button size="xs" variant="ghost" iconBefore={<Plus size={13} />} onClick={() => onChange([...values, ''])}>Добавить</Button>}>
      <div className="player-compendium-editor__string-list">
        {values.map((value, index) => (
          <div className="player-compendium-editor__string-row" key={`${index}-${values.length}`}>
            <TextAreaField label={`${title}: ${index + 1}`} rows={2} value={value} onInput={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.currentTarget.value : item))} />
            <MoveButtons index={index} length={values.length} onMove={(next) => onChange(move(values, index, next))} onRemove={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} label={value || title} />
          </div>
        ))}
      </div>
    </EditorSection>
  );
}

function MoveButtons({ index, length, onMove, onRemove, label }: { index: number; length: number; onMove: (index: number) => void; onRemove: () => void; label: string }) {
  return <div className="player-compendium-editor__move-actions">
    <IconButton size="xs" variant="ghost" disabled={index === 0} title="Выше" aria-label={`Переместить выше: ${label}`} onClick={() => onMove(index - 1)}><ChevronUp size={13} /></IconButton>
    <IconButton size="xs" variant="ghost" disabled={index === length - 1} title="Ниже" aria-label={`Переместить ниже: ${label}`} onClick={() => onMove(index + 1)}><ChevronDown size={13} /></IconButton>
    <IconButton size="xs" variant="danger" title="Удалить" aria-label={`Удалить: ${label}`} onClick={onRemove}><Trash2 size={13} /></IconButton>
  </div>;
}

function EditorSection({ title, action, children }: { title: string; action?: preact.ComponentChildren; children: preact.ComponentChildren }) {
  return <section className="player-compendium-editor__section"><header><h4>{title}</h4>{action}</header>{children}</section>;
}

function DomainSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <SelectField label={label} value={value} onChange={(event) => onChange(event.currentTarget.value)}><option value="">Не выбран</option>{DOMAIN_NAMES.filter((domain) => domain !== 'Custom').map((domain) => <option key={domain} value={domain.toLowerCase()}>{DOMAIN_LABELS[domain]}</option>)}</SelectField>;
}

function TraitSelect({ label, value, allowEmpty = false, allowSpellcast = false, onChange }: { label: string; value: string; allowEmpty?: boolean; allowSpellcast?: boolean; onChange: (value: string) => void }) {
  return <SelectField label={label} value={value} onChange={(event) => onChange(event.currentTarget.value)}>{allowEmpty && <option value="">Не выбрана</option>}{(Object.keys(TRAIT_LABELS) as TraitId[]).map((trait) => <option key={trait} value={trait}>{TRAIT_LABELS[trait]}</option>)}{allowSpellcast && <option value="spellcast">Характеристика заклинателя</option>}</SelectField>;
}

function RangeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <SelectField label="Дистанция" value={rangeOptionValue(value)} onChange={(event) => onChange(event.currentTarget.value)}><option value="">Не указана</option>{RANGE_OPTIONS.map((range) => <option key={range.id} value={range.id}>{range.name}</option>)}</SelectField>;
}

function DamageSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <SelectField label="Тип урона" value={damageOptionValue(value)} onChange={(event) => onChange(event.currentTarget.value)}>{Object.entries(DAMAGE_TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}<option value="any">Любой</option></SelectField>;
}

function rangeOptionValue(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return RANGE_OPTIONS.find((option) => (
    option.id.replace(/-/g, '') === normalized || option.name.toLowerCase().replace(/[\s_-]+/g, '') === normalized
  ))?.id ?? '';
}

function damageOptionValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'magical' || normalized.includes('маг')) return 'magic';
  return normalized in DAMAGE_TYPE_LABELS || normalized === 'any' ? normalized : 'physical';
}

function featureArray(value: unknown): RawAdversaryFeature[] {
  return Array.isArray(value) ? value.filter((item): item is RawAdversaryFeature => Boolean(item && typeof item === 'object')).map((item) => ({ ...item })) : [];
}
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []; }
function numberArray(value: unknown, fallback: [number, number]): [number, number] { return Array.isArray(value) && value.length >= 2 ? [number(value[0], fallback[0]), number(value[1], fallback[1])] : fallback; }
function experienceValues(value: unknown): string[] { return text(value).split(/[;\n]+/).map((item) => item.trim()).filter(Boolean); }
function text(value: unknown, fallback = ''): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback; }
function number(value: unknown, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function int(value: string, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback; }
function optionalInt(value: string): number | null { return value.trim() ? int(value, 0) : null; }
function nullableNumber(value: unknown): number | '' { return value === null || value === undefined || value === '' ? '' : number(value, 0); }
function compact(values: Array<string | undefined>): string[] { return values.filter((value): value is string => Boolean(value)); }
function move<T>(values: T[], from: number, to: number): T[] { const next = [...values]; const [item] = next.splice(from, 1); if (item !== undefined) next.splice(to, 0, item); return next; }
