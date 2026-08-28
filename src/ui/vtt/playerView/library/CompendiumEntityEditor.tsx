/** @jsxImportSource preact */
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { EditableContentCollectionKey, EditableRawContent, RawAdversaryFeature } from '../../../../domain/content/types';
import { cleanCustomContentDraft, createCustomContentDraft, validateCustomContentDraft, type CustomContentDraft } from '../../../../domain/content/customContentDraft';
import { ADVERSARY_TYPES, DAMAGE_TYPE_LABELS, DOMAIN_LABELS, DOMAIN_NAMES, RANGE_OPTIONS, TRAIT_LABELS, adversaryTypeLabel } from '../../../../domain/rules/constants';
import type { TraitId } from '../../../../domain/rules/types';
import { contentService } from '../../../../services/serviceRegistry';
import { Button, ConfirmDialog, IconButton, ImageFilePicker, Notice, NumberControl, SelectControl, TextAreaControl, TextControl } from '../../../components/common';
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
const DIE_SIZES = [4, 6, 8, 10, 12, 20] as const;

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
        <div className={`player-custom-compendium-form ${target.collection === 'adversaries' ? '' : 'player-custom-compendium-form--generic'}`.trim()}>
          {target.collection !== 'adversaries' && <IdentityFields collection={target.collection} draft={draft} setField={setField} />}
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
    <section className={`player-compendium-editor__identity-layout ${supportsImage ? '' : 'player-compendium-editor__identity-layout--no-art'}`.trim()}>
      <div className="player-compendium-editor__identity-fields">
        <TextAreaControl className="player-compendium-editor__title-control" aria-label="Название" placeholder="Название" rows={1} value={text(draft.name ?? draft.title)} autoFocus onInput={(event) => setField('name', event.currentTarget.value)} />
        {(collection === 'environments' || collection === 'classes' || collection === 'beastforms') && (
          <TextAreaControl className="player-compendium-editor__summary-control" aria-label="Кратко" placeholder="Краткое описание" rows={2} value={text(draft.short_description)} onInput={(event) => setField('short_description', event.currentTarget.value)} />
        )}
      </div>
      {supportsImage && (
        <ImageFilePicker
          label="Изображение"
          className="player-compendium-editor__art-picker"
          imageUrl={text(draft.image_url)}
          aspectRatio="1 / 1"
          hideLabel
          size="compact"
          previewStyle={{ objectFit: 'contain' }}
          onFileSelect={async (file) => setField('image_url', await readFileAsDataUrl(file))}
          onClear={() => setField('image_url', null)}
        />
      )}
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
  const role = text(draft.type_slug, 'standard').toLowerCase();
  const attackBonus = number(draft.attack_bonus, 0);
  const damageBonus = number(draft.damage_bonus, 0);
  const damageDieSize = number(draft.damage_die_size, 6);
  const changeRole = (value: string) => {
    const type = ADVERSARY_TYPES.find((candidate) => candidate.toLowerCase() === value);
    setField('type_slug', value);
    if (type) setField('type_name', adversaryTypeLabel(type));
    setField('horde_per_hp', value === 'horde' ? Math.max(1, number(draft.horde_per_hp, 1)) : null);
  };
  return (
    <section className="player-compendium-statblock" aria-label="Карточка противника">
      <div className="player-compendium-statblock__identity">
        <div className="player-compendium-statblock__identity-copy">
          <TextAreaControl className="player-compendium-editor__title-control" aria-label="Название" placeholder="Название противника" rows={2} value={text(draft.name)} autoFocus onInput={(event) => setField('name', event.currentTarget.value)} />
          <div className="player-compendium-statblock__meta">
            <label>Ранг <NumberControl tone="plain" aria-label="Ранг" min={1} max={4} value={number(draft.tier, 1)} onInput={(event) => setField('tier', int(event.currentTarget.value, 1))} /></label>
            <label>Тип <SelectControl aria-label="Тип" value={role} onChange={(event) => changeRole(event.currentTarget.value)}>
              {ADVERSARY_TYPES.map((type) => <option key={type} value={type.toLowerCase()}>{adversaryTypeLabel(type)}</option>)}
            </SelectControl></label>
          </div>
          <TextAreaControl className="player-compendium-editor__summary-control" aria-label="Кратко" placeholder="Краткое описание" rows={2} value={text(draft.short_description)} onInput={(event) => setField('short_description', event.currentTarget.value)} />
        </div>
        <ImageFilePicker
          label="Изображение"
          className="player-compendium-editor__art-picker"
          imageUrl={text(draft.image_url)}
          aspectRatio="1 / 1"
          hideLabel
          size="compact"
          previewStyle={{ objectFit: 'contain' }}
          onFileSelect={async (file) => setField('image_url', await readFileAsDataUrl(file))}
          onClear={() => setField('image_url', null)}
        />
      </div>

      <label className="player-compendium-statblock__prose player-compendium-statblock__prose--editable"><strong>Мотивы и тактика</strong><TextAreaControl className="player-compendium-editor__summary-control" aria-label="Мотивы и тактика" rows={2} value={text(draft.motives)} onInput={(event) => setField('motives', event.currentTarget.value)} /></label>

      <div className="player-compendium-statblock__rules">
        <div className="player-compendium-statblock__line">
          <InlineNumber label="Сложность" min={0} value={number(draft.difficulty, 12)} onInput={(value) => setField('difficulty', int(value, 12))} />
          <label className="player-compendium-statblock__number player-compendium-statblock__thresholds">
            <strong>Пороги</strong>
            <NumberControl tone="plain" aria-label="Ощутимый порог" min={0} value={thresholds[0]} onInput={(event) => setField('damage_thresholds', [int(event.currentTarget.value, 0), thresholds[1]])} />
            <span>/</span>
            <NumberControl tone="plain" aria-label="Тяжёлый порог" min={0} value={thresholds[1]} onInput={(event) => setField('damage_thresholds', [thresholds[0], int(event.currentTarget.value, 0)])} />
          </label>
          <InlineNumber label="Раны" min={1} value={number(draft.hp, 4)} onInput={(value) => setField('hp', int(value, 4))} />
          <InlineNumber label="Стресс" min={0} value={number(draft.stress, 0)} onInput={(value) => setField('stress', int(value, 0))} />
          {role === 'horde' && <InlineNumber label="Противников на Рану" min={1} value={number(draft.horde_per_hp, 1)} onInput={(value) => setField('horde_per_hp', int(value, 1))} />}
        </div>
        <div className="player-compendium-statblock__line player-compendium-statblock__attack">
          <InlineNumber label={attackBonus >= 0 ? 'Атака +' : 'Атака'} value={attackBonus} onInput={(value) => setField('attack_bonus', int(value, 0))} />
          <TextAreaControl className="player-compendium-statblock__weapon" aria-label="Название атаки" placeholder="Название атаки" rows={1} value={text(draft.weapon_name)} onInput={(event) => setField('weapon_name', event.currentTarget.value)} />
          <RangeControl value={text(draft.attack_range)} onChange={(value) => setField('attack_range', value)} />
          <span className="player-compendium-statblock__damage">
            {damageDieSize > 0 && <NumberControl tone="plain" aria-label="Количество костей" min={1} value={number(draft.damage_die_count, 1)} onInput={(event) => setField('damage_die_count', int(event.currentTarget.value, 1))} />}
            <SelectControl className={`player-compendium-statblock__select player-compendium-statblock__die-select ${damageDieSize > 0 ? '' : 'player-compendium-statblock__die-select--none'}`.trim()} aria-label="Кость урона" value={String(damageDieSize)} onChange={(event) => setField('damage_die_size', int(event.currentTarget.value, 0))}>
              <option value="0">Без кости</option>
              {DIE_SIZES.map((size) => <option key={size} value={size}>d{size}</option>)}
            </SelectControl>
            {damageDieSize > 0 && damageBonus >= 0 && <span>+</span>}
            <NumberControl tone="plain" aria-label={damageDieSize > 0 ? 'Бонус урона' : 'Фиксированный урон'} value={damageBonus} onInput={(event) => setField('damage_bonus', int(event.currentTarget.value, 0))} />
            <DamageControl value={text(draft.damage_type, 'physical')} onChange={(value) => setField('damage_type', value)} />
          </span>
        </div>
        <label className="player-compendium-statblock__experience"><strong>Опыт</strong><TextControl tone="plain" aria-label="Опыт" placeholder="Например: Маскировка +3" value={text(draft.experiences)} onInput={(event) => setField('experiences', event.currentTarget.value)} /></label>
      </div>

      <FeatureListEditor title="Свойства" value={draft.features} onChange={(features) => setField('features', features)} />

    </section>
  );
}

function EnvironmentFields({ draft, setField }: EditorFieldsProps) {
  return <>
    <div className="player-compendium-cardfields">
      <CardField label="Ранг"><NumberControl aria-label="Ранг" min={1} max={4} value={number(draft.tier, 1)} onInput={(event) => setField('tier', int(event.currentTarget.value, 1))} /></CardField>
      <CardField label="Сложность"><NumberControl aria-label="Сложность" min={0} value={number(draft.difficulty, 12)} onInput={(event) => setField('difficulty', int(event.currentTarget.value, 12))} /></CardField>
      <CardField label="Тип" grow><TextControl aria-label="Тип" placeholder="Окружение" value={text(draft.type_name)} onInput={(event) => setField('type_name', event.currentTarget.value)} /></CardField>
    </div>
    <FeatureListEditor title="Свойства" value={draft.features} onChange={(features) => setField('features', features)} />
    <CardField label="Импульсы" wide><TextAreaControl aria-label="Импульсы" placeholder="Импульсы окружения" rows={2} value={text(draft.impulses)} onInput={(event) => setField('impulses', event.currentTarget.value)} /></CardField>
    <CardField label="Противники" wide><TextAreaControl aria-label="Потенциальные противники" placeholder="Потенциальные противники" rows={2} value={text(draft.potential_adversaries)} onInput={(event) => setField('potential_adversaries', event.currentTarget.value)} /></CardField>
    <details className="player-compendium-editor__details"><summary>Полное описание</summary><TextAreaControl aria-label="Полное описание" placeholder="Описание" rows={3} value={text(draft.main_body)} onInput={(event) => setField('main_body', event.currentTarget.value)} /></details>
  </>;
}

function ClassFields({ draft, setField }: EditorFieldsProps) {
  const domains = stringArray(draft.domain_slugs);
  return <>
    <div className="player-compendium-cardfields">
      <CardField label="Уклонение"><NumberControl aria-label="Уклонение" min={0} value={number(draft.evasion, 10)} onInput={(event) => setField('evasion', int(event.currentTarget.value, 10))} /></CardField>
      <CardField label="Раны"><NumberControl aria-label="Раны" min={1} value={number(draft.hp, 6)} onInput={(event) => setField('hp', int(event.currentTarget.value, 6))} /></CardField>
      <CardField label="Домен I" grow><DomainControl value={domains[0] ?? ''} onChange={(value) => setField('domain_slugs', compact([value, domains[1]]))} /></CardField>
      <CardField label="Домен II" grow><DomainControl value={domains[1] ?? ''} onChange={(value) => setField('domain_slugs', compact([domains[0], value]))} /></CardField>
    </div>
    <FeatureListEditor title="Свойства" value={draft.features} onChange={(features) => setField('features', features)} />
    <details className="player-compendium-editor__details"><summary>Описание класса</summary><TextAreaControl aria-label="Описание класса" placeholder="Описание" rows={3} value={text(draft.description ?? draft.main_body)} onInput={(event) => setField('description', event.currentTarget.value)} /></details>
    <StringListEditor title="Начальные предметы" values={stringArray(draft.class_items)} onChange={(values) => setField('class_items', values)} />
    <StringListEditor title="Вопросы предыстории" values={stringArray(draft.background_questions)} onChange={(values) => setField('background_questions', values)} />
    <StringListEditor title="Вопросы связей" values={stringArray(draft.connection_questions)} onChange={(values) => setField('connection_questions', values)} />
  </>;
}

function SubclassFields({ draft, setField }: EditorFieldsProps) {
  const classes = contentService.content$.get().classes;
  return <>
    <div className="player-compendium-cardfields">
      <CardField label="Класс" grow><SelectControl aria-label="Класс" value={text(draft.class_slug)} onChange={(event) => {
          const selected = classes.find((item) => item.slug === event.currentTarget.value);
          setField('class_slug', event.currentTarget.value);
          if (selected) setField('class_name', selected.name);
        }}>
          <option value="">Не выбран</option>
          {classes.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
        </SelectControl></CardField>
      <CardField label="Заклинание" grow><TraitControl aria-label="Заклинание" value={text(draft.spellcast_trait)} allowEmpty onChange={(value) => setField('spellcast_trait', value || null)} /></CardField>
    </div>
    <details className="player-compendium-editor__details"><summary>Описание подкласса</summary><TextAreaControl aria-label="Описание подкласса" placeholder="Описание" rows={3} value={text(draft.description ?? draft.main_body)} onInput={(event) => setField('description', event.currentTarget.value)} /></details>
    <FeatureListEditor title="Основа" value={draft.foundation_features} onChange={(features) => setField('foundation_features', features)} />
    <FeatureListEditor title="Специализация" value={draft.specialization_features} onChange={(features) => setField('specialization_features', features)} />
    <FeatureListEditor title="Мастерство" value={draft.mastery_features} onChange={(features) => setField('mastery_features', features)} />
  </>;
}

function CardLikeFields({ draft, setField }: EditorFieldsProps) {
  return <>
    <FeatureListEditor title="Свойства" value={draft.features} onChange={(features) => setField('features', features)} />
    <details className="player-compendium-editor__details"><summary>Описание</summary><TextAreaControl aria-label="Краткое описание" placeholder="Краткое описание" rows={2} value={text(draft.short_description)} onInput={(event) => setField('short_description', event.currentTarget.value)} /><TextAreaControl aria-label="Полное описание" placeholder="Полное описание" rows={3} value={text(draft.description ?? draft.main_body)} onInput={(event) => setField('description', event.currentTarget.value)} /></details>
  </>;
}

function DomainCardFields({ draft, setField }: EditorFieldsProps) {
  return <>
    <div className="player-compendium-cardfields">
      <CardField label="Домен" grow><DomainControl value={text(draft.domain_slug)} onChange={(value) => {
          setField('domain_slug', value);
          const domain = DOMAIN_NAMES.find((item) => item.toLowerCase() === value);
          if (domain) setField('domain_name', DOMAIN_LABELS[domain]);
        }} /></CardField>
      <CardField label="Уровень"><NumberControl aria-label="Уровень" min={1} max={10} value={number(draft.level, 1)} onInput={(event) => setField('level', int(event.currentTarget.value, 1))} /></CardField>
      <CardField label="Тип" grow><SelectControl aria-label="Тип" value={text(draft.card_type, 'ability')} onChange={(event) => setField('card_type', event.currentTarget.value)}>
          <option value="ability">Способность</option><option value="spell">Заклинание</option><option value="grimoire">Гримуар</option>
        </SelectControl></CardField>
      <CardField label="Призыв"><NumberControl aria-label="Стоимость призыва" min={0} value={number(draft.stress_cost, 0)} onInput={(event) => setField('stress_cost', int(event.currentTarget.value, 0))} /></CardField>
      <CardField label="Активация" grow><TextControl aria-label="Стоимость активации" placeholder="Нет" value={text(draft.activation_cost)} onInput={(event) => setField('activation_cost', event.currentTarget.value)} /></CardField>
    </div>
    <CardField label="Описание" wide><TextAreaControl aria-label="Описание" placeholder="Описание карты" rows={4} value={text(draft.description ?? draft.main_body)} onInput={(event) => setField('description', event.currentTarget.value)} /></CardField>
    <FeatureListEditor title="Свойства" value={draft.features} onChange={(features) => setField('features', features)} />
  </>;
}

function EquipmentFields({ draft, setField }: EditorFieldsProps) {
  const type = text(draft.type_slug, 'item');
  const isWeapon = type === 'primary-weapon' || type === 'secondary-weapon' || type === 'combat-wheelchair';
  const isArmor = type === 'armor';
  const thresholds = numberArray(draft.base_thresholds, [0, 0]);
  const damageDie = number(draft.die_size, 8);
  const damageBonus = number(draft.bonus, 0);
  return <>
    <div className="player-compendium-cardfields">
      <CardField label="Тип" grow><SelectControl aria-label="Тип" value={type} onChange={(event) => setField('type_slug', event.currentTarget.value)}>
          <option value="primary-weapon">Основное оружие</option><option value="secondary-weapon">Дополнительное оружие</option><option value="armor">Броня</option><option value="consumable">Расходник</option><option value="item">Предмет</option><option value="combat-wheelchair">Боевое кресло</option>
        </SelectControl></CardField>
      <CardField label="Ранг"><NumberControl aria-label="Ранг" min={1} max={4} value={number(draft.tier, 1)} onInput={(event) => setField('tier', int(event.currentTarget.value, 1))} /></CardField>
      <CardField label="Использования"><NumberControl aria-label="Использования" min={0} value={nullableNumber(draft.uses)} onInput={(event) => setField('uses', optionalInt(event.currentTarget.value))} /></CardField>
      {isWeapon && <CardField label="Характеристика" grow><TraitControl value={text(draft.char_trait)} allowSpellcast onChange={(value) => setField('char_trait', value)} /></CardField>}
      {isWeapon && <CardField label="Дистанция" grow><RangeControl value={text(draft.range)} onChange={(value) => setField('range', value)} /></CardField>}
      {isWeapon && <CardField label="Урон"><span className="player-compendium-cardfield__formula">{damageDie > 0 && <NumberControl aria-label="Количество костей" min={1} value={number(draft.die_num, 1)} onInput={(event) => setField('die_num', int(event.currentTarget.value, 1))} />}<DieControl value={damageDie} allowNone onChange={(value) => setField('die_size', value)} />{damageDie > 0 && damageBonus >= 0 && <span>+</span>}<NumberControl aria-label={damageDie > 0 ? 'Бонус урона' : 'Фиксированный урон'} value={damageBonus} onInput={(event) => setField('bonus', int(event.currentTarget.value, 0))} /></span></CardField>}
      {isWeapon && <CardField label="Тип урона" grow><DamageControl value={text(draft.damage_ty, 'physical')} onChange={(value) => setField('damage_ty', value)} /></CardField>}
      {isWeapon && <CardField label="Хват" grow><SelectControl aria-label="Хват" value={String(number(draft.burden, 1))} onChange={(event) => setField('burden', int(event.currentTarget.value, 1))}><option value="1">Одноручное</option><option value="2">Двуручное</option></SelectControl></CardField>}
      {isArmor && <CardField label="Броня"><NumberControl aria-label="Показатель брони" min={0} value={number(draft.armor_score, 0)} onInput={(event) => setField('armor_score', int(event.currentTarget.value, 0))} /></CardField>}
      {isArmor && <CardField label="Пороги"><span className="player-compendium-cardfield__formula"><NumberControl aria-label="Ощутимый порог" min={0} value={thresholds[0]} onInput={(event) => setField('base_thresholds', [int(event.currentTarget.value, 0), thresholds[1]])} /><span>/</span><NumberControl aria-label="Тяжёлый порог" min={0} value={thresholds[1]} onInput={(event) => setField('base_thresholds', [thresholds[0], int(event.currentTarget.value, 0)])} /></span></CardField>}
    </div>
    <FeatureListEditor title="Свойства" value={draft.features} onChange={(features) => setField('features', features)} />
  </>;
}

function BeastformFields({ draft, setField }: EditorFieldsProps) {
  const attackBonus = number(draft.attack_bonus, 0);
  return <>
    <div className="player-compendium-cardfields">
      <CardField label="Ранг"><NumberControl aria-label="Ранг" min={1} max={4} value={number(draft.tier, 1)} onInput={(event) => setField('tier', int(event.currentTarget.value, 1))} /></CardField>
      <CardField label="Уровень"><NumberControl aria-label="Уровень" min={1} max={10} value={nullableNumber(draft.level)} onInput={(event) => setField('level', optionalInt(event.currentTarget.value))} /></CardField>
      <CardField label="Уклонение"><NumberControl aria-label="Модификатор уклонения" value={number(draft.evasion, 0)} onInput={(event) => setField('evasion', int(event.currentTarget.value, 0))} /></CardField>
      <CardField label="Атака" grow><TraitControl aria-label="Атака через" value={text(draft.attack_trait, 'agility')} onChange={(value) => setField('attack_trait', value)} /></CardField>
      <CardField label="Урон"><span className="player-compendium-cardfield__formula"><DieControl value={number(draft.attack_die, 8)} onChange={(value) => setField('attack_die', value)} />{attackBonus >= 0 && <span>+</span>}<NumberControl aria-label="Бонус урона" value={attackBonus} onInput={(event) => setField('attack_bonus', int(event.currentTarget.value, 0))} /></span></CardField>
      <CardField label="Дистанция" grow><RangeControl value={text(draft.attack_range)} onChange={(value) => setField('attack_range', value)} /></CardField>
      <CardField label="Тип урона" grow><DamageControl value={text(draft.attack_type, 'physical')} onChange={(value) => setField('attack_type', value)} /></CardField>
      <CardField label="Преимущество" grow><TraitControl aria-label="Преимущество к характеристике" value={text(draft.trait_type)} allowEmpty onChange={(value) => setField('trait_type', value || null)} /></CardField>
      <CardField label="Бонус"><NumberControl aria-label="Бонус характеристики" value={number(draft.trait_bonus, 0)} onInput={(event) => setField('trait_bonus', int(event.currentTarget.value, 0))} /></CardField>
    </div>
    <FeatureListEditor title="Свойства" value={draft.features} onChange={(features) => setField('features', features)} />
    <CardField label="Примеры" wide><TextAreaControl aria-label="Примеры" placeholder="Примеры звероформ" rows={2} value={text(draft.examples)} onInput={(event) => setField('examples', event.currentTarget.value)} /></CardField>
    <CardField label="Преимущества" wide><TextAreaControl aria-label="Преимущества" placeholder="Преимущества звероформы" rows={2} value={text(draft.advantages)} onInput={(event) => setField('advantages', event.currentTarget.value)} /></CardField>
  </>;
}

function FeatureListEditor({ title, value, onChange }: { title: string; value: unknown; onChange: (features: RawAdversaryFeature[]) => void }) {
  const features = featureArray(value);
  const update = (index: number, patch: RawAdversaryFeature) => onChange(features.map((feature, itemIndex) => itemIndex === index ? { ...feature, ...patch } : feature));
  return (
    <EditorSection title={title} action={<Button size="xs" variant="ghost" iconBefore={<Plus size={13} />} onClick={() => onChange([...features, { id: `feature-${Date.now()}`, name: '', main_body: '' }])}>Добавить</Button>}>
      <div className="player-compendium-editor__collection">
        {features.map((feature, index) => (
          <div className="player-compendium-editor__collection-item" key={String(feature.id ?? index)}>
            <div className="player-compendium-editor__collection-head">
              <TextControl tone="plain" aria-label={`Название свойства ${index + 1}`} placeholder="Название свойства" value={text(feature.name)} onInput={(event) => update(index, { name: event.currentTarget.value })} />
              <MoveButtons index={index} length={features.length} onMove={(next) => onChange(move(features, index, next))} onRemove={() => onChange(features.filter((_, itemIndex) => itemIndex !== index))} label={text(feature.name, 'особенность')} />
            </div>
            <TextAreaControl className="player-compendium-editor__feature-text" aria-label={`Текст свойства ${index + 1}`} placeholder="Текст свойства" rows={2} value={text(feature.main_body ?? feature.text)} onInput={(event) => update(index, { main_body: event.currentTarget.value })} />
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
            <TextControl aria-label={`${title}: ${index + 1}`} value={value} onInput={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.currentTarget.value : item))} />
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

function CardField({ label, grow = false, wide = false, children }: { label: string; grow?: boolean; wide?: boolean; children: preact.ComponentChildren }) {
  return <div className={`player-compendium-cardfield ${grow ? 'player-compendium-cardfield--grow' : ''} ${wide ? 'player-compendium-cardfield--wide' : ''}`.trim()}><strong>{label}</strong>{children}</div>;
}

function DomainControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <SelectControl aria-label="Домен" value={value} onChange={(event) => onChange(event.currentTarget.value)}><option value="">Не выбран</option>{DOMAIN_NAMES.filter((domain) => domain !== 'Custom').map((domain) => <option key={domain} value={domain.toLowerCase()}>{DOMAIN_LABELS[domain]}</option>)}</SelectControl>;
}

function InlineNumber({ label, value, min, onInput }: { label: string; value: number; min?: number; onInput: (value: string) => void }) {
  return <label className="player-compendium-statblock__number"><strong>{label}</strong><NumberControl tone="plain" aria-label={label} min={min} value={value} onInput={(event) => onInput(event.currentTarget.value)} /></label>;
}

function RangeControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <SelectControl className="player-compendium-statblock__select" aria-label="Дистанция" value={rangeOptionValue(value)} onChange={(event) => onChange(event.currentTarget.value)}><option value="">Дистанция</option>{RANGE_OPTIONS.map((range) => <option key={range.id} value={range.id}>{range.name}</option>)}</SelectControl>;
}

function DamageControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <SelectControl className="player-compendium-statblock__select" aria-label="Тип урона" value={damageOptionValue(value)} onChange={(event) => onChange(event.currentTarget.value)}>{Object.entries(DAMAGE_TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}<option value="any">Любой</option></SelectControl>;
}

function TraitControl({ value, allowEmpty = false, allowSpellcast = false, onChange, ...props }: { value: string; allowEmpty?: boolean; allowSpellcast?: boolean; onChange: (value: string) => void; 'aria-label'?: string }) {
  return <SelectControl aria-label={props['aria-label'] ?? 'Характеристика'} value={value} onChange={(event) => onChange(event.currentTarget.value)}>{allowEmpty && <option value="">Не выбрана</option>}{(Object.keys(TRAIT_LABELS) as TraitId[]).map((trait) => <option key={trait} value={trait}>{TRAIT_LABELS[trait]}</option>)}{allowSpellcast && <option value="spellcast">Заклинание</option>}</SelectControl>;
}

function DieControl({ value, allowNone = false, onChange }: { value: number; allowNone?: boolean; onChange: (value: number) => void }) {
  return <SelectControl aria-label="Кость урона" value={String(value)} onChange={(event) => onChange(int(event.currentTarget.value, allowNone ? 0 : 6))}>{allowNone && <option value="0">Без кости</option>}{DIE_SIZES.map((size) => <option key={size} value={size}>d{size}</option>)}</SelectControl>;
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
function text(value: unknown, fallback = ''): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback; }
function number(value: unknown, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function int(value: string, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback; }
function optionalInt(value: string): number | null { return value.trim() ? int(value, 0) : null; }
function nullableNumber(value: unknown): number | '' { return value === null || value === undefined || value === '' ? '' : number(value, 0); }
function compact(values: Array<string | undefined>): string[] { return values.filter((value): value is string => Boolean(value)); }
function move<T>(values: T[], from: number, to: number): T[] { const next = [...values]; const [item] = next.splice(from, 1); if (item !== undefined) next.splice(to, 0, item); return next; }
