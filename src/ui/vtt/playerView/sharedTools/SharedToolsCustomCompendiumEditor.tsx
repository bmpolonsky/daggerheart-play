/** @jsxImportSource preact */
import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Adversary, AdversaryFeature } from '@combat/lib/api';
import { ADVERSARY_ROLE_OPTIONS } from '@combat/lib/customAdversaries';
import { encounterService as combatEncounterService } from '@combat/services/encounterService';
import { adversariesService } from '@combat/services/adversariesService';
import { useStream } from '../../../../core/hooks/useStream';
import { createId } from '../../../../core/utils/id';
import { loadCustomEnvironments, saveCustomEnvironments } from '../../../../core/persistence/browserProjectContent';
import type { LibraryEnvironment, RawAdversaryFeature, RawEnvironmentItem } from '../../../../domain/content/types';
import { contentService } from '../../../../services/serviceRegistry';
import { Button, ConfirmDialog, Field, IconButton, ImageFilePicker, ListItem, Notice, SearchField, SectionHeader, SelectControl, TextAreaControl, TextControl, Toolbar } from '../../../components/common';
import { readFileAsDataUrl } from './readFileAsDataUrl';

type EntityKind = 'adversary' | 'environment';

interface AdversaryDraft {
  id: number | null;
  name: string;
  tier: string;
  roleId: string;
  summary: string;
  image: string;
  difficulty: string;
  hp: string;
  stress: string;
  attackBonus: string;
  attackRange: string;
  damageType: string;
  damageDieCount: string;
  damageDieSize: string;
  damageBonus: string;
  weaponName: string;
  motives: string;
  experiences: string;
  mainBody: string;
  featuresText: string;
}

interface EnvironmentDraft {
  id: string;
  name: string;
  tier: string;
  typeName: string;
  difficulty: string;
  summary: string;
  imageUrl: string;
  body: string;
  featureText: string;
  impulses: string;
  potentialAdversaries: string;
}

type Draft = AdversaryDraft | EnvironmentDraft;

export function SharedToolsCustomCompendiumEditor({
  kind,
  initialId = 'new',
  onClose
}: {
  kind: EntityKind;
  initialId?: string;
  onClose?: () => void;
}) {
  adversariesService.ensureLoaded();
  contentService.ensureLoaded();

  const adversariesState = useStream(adversariesService.adversaries$);
  const content = useStream(contentService.content$);
  const customAdversaries = adversariesState.items.filter((item) => item.isCustom);
  const customEnvironments = content.environments.filter(isCustomEnvironment);
  const [selectedId, setSelectedId] = useState<string>('new');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'error'; message: string } | null>(null);
  const draftDirtyRef = useRef(false);
  const selectedAdversary = kind === 'adversary' && selectedId !== 'new'
    ? customAdversaries.find((item) => String(item.id) === selectedId) ?? null
    : null;
  const selectedEnvironment = kind === 'environment' && selectedId !== 'new'
    ? customEnvironments.find((item) => item.id === selectedId) ?? null
    : null;
  const [draft, setDraft] = useState<Draft>(() => createDraft(kind));
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredAdversaries = useMemo(() => customAdversaries.filter((item) => (
    normalizedSearch ? [item.name, item.roleName, item.summary].join(' ').toLowerCase().includes(normalizedSearch) : true
  )), [customAdversaries, normalizedSearch]);
  const filteredEnvironments = useMemo(() => customEnvironments.filter((item) => (
    normalizedSearch ? [item.name, item.typeName, item.summary, item.body].join(' ').toLowerCase().includes(normalizedSearch) : true
  )), [customEnvironments, normalizedSearch]);

  useEffect(() => {
    if (selectedId === 'new' && draftDirtyRef.current) return;
    if (kind === 'adversary') setDraft(adversaryDraftFromItem(selectedAdversary));
    if (kind === 'environment') setDraft(environmentDraftFromItem(selectedEnvironment));
  }, [kind, selectedAdversary, selectedEnvironment, selectedId]);

  useEffect(() => {
    draftDirtyRef.current = false;
    setSelectedId(initialId || 'new');
    setDraft(createDraft(kind));
    setSearchTerm('');
    setNotice(null);
  }, [initialId, kind]);

  const startNewDraft = () => {
    draftDirtyRef.current = false;
    setSelectedId('new');
    setDraft(createDraft(kind));
    setNotice(null);
  };

  const selectExisting = (id: string) => {
    draftDirtyRef.current = false;
    setSelectedId(id);
  };

  const updateDraft = (patch: Partial<AdversaryDraft> | Partial<EnvironmentDraft>) => {
    draftDirtyRef.current = true;
    setDraft((current) => ({ ...current, ...patch }) as Draft);
  };

  const save = async () => {
    try {
      if (kind === 'adversary') {
        const adversaryDraft = draft as AdversaryDraft;
        const payload = adversaryPayloadFromDraft(adversaryDraft);
        const saved = adversaryDraft.id
          ? await adversariesService.updateCustomAdversary(adversaryDraft.id, payload)
          : await adversariesService.createCustomAdversary(payload);
        await contentService.reload();
        draftDirtyRef.current = false;
        setSelectedId(String(saved.id));
        setNotice({ tone: 'success', message: 'Противник сохранен.' });
      } else {
        const saved = await saveEnvironmentDraft(draft as EnvironmentDraft);
        await contentService.reload();
        draftDirtyRef.current = false;
        setSelectedId(`environment:${saved.id ?? saved.slug}`);
        setNotice({ tone: 'success', message: 'Окружение сохранено.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Не удалось сохранить запись.' });
    }
  };

  const remove = async () => {
    try {
      if (kind === 'adversary') {
        const adversaryId = (draft as AdversaryDraft).id;
        if (!adversaryId) return;
        await adversariesService.removeCustomAdversary(adversaryId);
        setSelectedId('new');
        setNotice({ tone: 'info', message: 'Противник удален.' });
      } else {
        await removeEnvironmentDraft(draft as EnvironmentDraft);
        setSelectedId('new');
        setNotice({ tone: 'info', message: 'Окружение удалено.' });
      }
      await contentService.reload();
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Не удалось удалить запись.' });
    }
  };

  const addToEncounter = () => {
    if (kind !== 'adversary') return;
    const adversary = selectedAdversary;
    if (!adversary) return;
    combatEncounterService.addAdversary(adversary);
    setNotice({ tone: 'success', message: 'Противник добавлен в бой.' });
  };

  const hasExisting = selectedId !== 'new';

  return (
    <section className="player-tools-section player-custom-compendium-section">
      <SectionHeader
        title={kind === 'adversary' ? 'Свои противники' : 'Свои окружения'}
        actions={(
          <Toolbar aria-label="Действия редактора справочника">
          {onClose && (
            <IconButton type="button" variant="ghost" size="sm" title="Закрыть редактор" aria-label="Закрыть редактор" onClick={onClose}>
              <X size={15} aria-hidden="true" />
            </IconButton>
          )}
          <Button
            size="sm"
            variant="primary"
            type="button"
            iconBefore={<Plus size={15} aria-hidden="true" />}
            onClick={startNewDraft}
          >
            Новая
          </Button>
          </Toolbar>
        )}
      />

      {kind === 'adversary' && adversariesState.isLoading ? (
        <Notice tone="info">Загружаем противников…</Notice>
      ) : <div className="player-custom-compendium-layout">
        <aside className="player-custom-compendium-sidebar">
          <SearchField value={searchTerm} onInput={(event) => setSearchTerm(event.currentTarget.value)} placeholder="Поиск..." />
          <div className="player-custom-compendium-list">
            <EntityListButton active={selectedId === 'new'} title="Новая запись" subtitle={kind === 'adversary' ? 'Homebrew противник' : 'Homebrew окружение'} onClick={startNewDraft} />
            {kind === 'adversary' && filteredAdversaries.map((item) => (
              <EntityListButton key={item.id} active={selectedId === String(item.id)} title={item.name} subtitle={`Ранг ${item.tier} / ${item.roleName}`} onClick={() => selectExisting(String(item.id))} />
            ))}
            {kind === 'environment' && filteredEnvironments.map((item) => (
              <EntityListButton key={item.id} active={selectedId === item.id} title={item.name} subtitle={`Ранг ${item.tier} / ${item.typeName}`} onClick={() => selectExisting(item.id)} />
            ))}
          </div>
        </aside>

        <div className="player-custom-compendium-editor">
          {notice && <Notice tone={notice.tone}>{notice.message}</Notice>}
          {kind === 'adversary'
            ? <AdversaryForm draft={draft as AdversaryDraft} onChange={updateDraft} />
            : <EnvironmentForm draft={draft as EnvironmentDraft} onChange={updateDraft} />}
          <Toolbar className="player-custom-compendium-actions" aria-label="Сохранение записи справочника">
            {kind === 'adversary' && hasExisting && (
              <Button type="button" variant="secondary" onClick={addToEncounter}>В бой</Button>
            )}
            {hasExisting && (
              <IconButton type="button" variant="danger" size="sm" title="Удалить" aria-label="Удалить запись" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={15} aria-hidden="true" />
              </IconButton>
            )}
            <Button type="button" variant="primary" onClick={() => void save()}>Сохранить</Button>
          </Toolbar>
        </div>
      </div>}
      {deleteOpen && (
        <ConfirmDialog
          title={`Удалить ${kind === 'adversary' ? 'противника' : 'окружение'} «${draft.name || 'Без названия'}»?`}
          body="Пользовательская запись исчезнет из справочника. Это действие нельзя отменить."
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => {
            setDeleteOpen(false);
            void remove();
          }}
        />
      )}
    </section>
  );
}

function EntityListButton({ active, title, subtitle, onClick }: { active: boolean; title: string; subtitle: string; onClick: () => void }) {
  return (
    <ListItem
      className={`player-custom-compendium-list__item ${active ? 'dh-is-selected' : ''}`}
      title={title}
      subtitle={subtitle}
      lines={2}
      align="start"
      onClick={onClick}
    />
  );
}

function AdversaryForm({ draft, onChange }: { draft: AdversaryDraft; onChange: (patch: Partial<AdversaryDraft>) => void }) {
  return (
    <div className="player-custom-compendium-form">
      <div className="player-custom-compendium-grid player-custom-compendium-grid--title">
        <Field label="Название"><TextControl value={draft.name} onInput={(event) => onChange({ name: event.currentTarget.value })} /></Field>
        <Field label="Ранг"><TextControl value={draft.tier} onInput={(event) => onChange({ tier: event.currentTarget.value })} /></Field>
        <Field label="Роль">
          <SelectControl value={draft.roleId} onChange={(event) => onChange({ roleId: event.currentTarget.value })}>
            {ADVERSARY_ROLE_OPTIONS.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </SelectControl>
        </Field>
      </div>
      <div className="player-custom-compendium-grid player-custom-compendium-grid--media">
        <Field label="Кратко"><TextAreaControl value={draft.summary} rows={4} onInput={(event) => onChange({ summary: event.currentTarget.value })} /></Field>
        <ImageFilePicker label="Изображение" imageUrl={draft.image} aspectRatio="4 / 3" onFileSelect={async (file) => onChange({ image: await readFileAsDataUrl(file) })} onClear={() => onChange({ image: '' })} />
      </div>
      <div className="player-custom-compendium-grid player-custom-compendium-grid--stats">
        <Field label="Сложность"><TextControl value={draft.difficulty} onInput={(event) => onChange({ difficulty: event.currentTarget.value })} /></Field>
        <Field label="Раны"><TextControl value={draft.hp} onInput={(event) => onChange({ hp: event.currentTarget.value })} /></Field>
        <Field label="Стресс"><TextControl value={draft.stress} onInput={(event) => onChange({ stress: event.currentTarget.value })} /></Field>
        <Field label="ATK"><TextControl value={draft.attackBonus} onInput={(event) => onChange({ attackBonus: event.currentTarget.value })} /></Field>
        <Field label="Кости"><TextControl value={draft.damageDieCount} onInput={(event) => onChange({ damageDieCount: event.currentTarget.value })} /></Field>
        <Field label="Грани"><TextControl value={draft.damageDieSize} onInput={(event) => onChange({ damageDieSize: event.currentTarget.value })} /></Field>
        <Field label="Бонус урона"><TextControl value={draft.damageBonus} onInput={(event) => onChange({ damageBonus: event.currentTarget.value })} /></Field>
      </div>
      <div className="player-custom-compendium-grid">
        <Field label="Атака"><TextControl value={draft.weaponName} onInput={(event) => onChange({ weaponName: event.currentTarget.value })} /></Field>
        <Field label="Дистанция"><TextControl value={draft.attackRange} onInput={(event) => onChange({ attackRange: event.currentTarget.value })} /></Field>
        <Field label="Тип урона"><TextControl value={draft.damageType} onInput={(event) => onChange({ damageType: event.currentTarget.value })} /></Field>
      </div>
      <Field label="Мотивы"><TextAreaControl value={draft.motives} rows={3} onInput={(event) => onChange({ motives: event.currentTarget.value })} /></Field>
      <Field label="Опыт"><TextAreaControl value={draft.experiences} rows={3} onInput={(event) => onChange({ experiences: event.currentTarget.value })} /></Field>
      <Field label="Описание"><TextAreaControl value={draft.mainBody} rows={6} onInput={(event) => onChange({ mainBody: event.currentTarget.value })} /></Field>
      <Field label="Особенности"><TextAreaControl value={draft.featuresText} rows={8} onInput={(event) => onChange({ featuresText: event.currentTarget.value })} /></Field>
    </div>
  );
}

function EnvironmentForm({ draft, onChange }: { draft: EnvironmentDraft; onChange: (patch: Partial<EnvironmentDraft>) => void }) {
  return (
    <div className="player-custom-compendium-form">
      <div className="player-custom-compendium-grid player-custom-compendium-grid--title">
        <Field label="Название"><TextControl value={draft.name} onInput={(event) => onChange({ name: event.currentTarget.value })} /></Field>
        <Field label="Ранг"><TextControl value={draft.tier} onInput={(event) => onChange({ tier: event.currentTarget.value })} /></Field>
        <Field label="Тип"><TextControl value={draft.typeName} onInput={(event) => onChange({ typeName: event.currentTarget.value })} /></Field>
        <Field label="Сложность"><TextControl value={draft.difficulty} onInput={(event) => onChange({ difficulty: event.currentTarget.value })} /></Field>
      </div>
      <div className="player-custom-compendium-grid player-custom-compendium-grid--media">
        <Field label="Кратко"><TextAreaControl value={draft.summary} rows={4} onInput={(event) => onChange({ summary: event.currentTarget.value })} /></Field>
        <ImageFilePicker label="Изображение" imageUrl={draft.imageUrl} aspectRatio="4 / 3" onFileSelect={async (file) => onChange({ imageUrl: await readFileAsDataUrl(file) })} onClear={() => onChange({ imageUrl: '' })} />
      </div>
      <Field label="Описание"><TextAreaControl value={draft.body} rows={6} onInput={(event) => onChange({ body: event.currentTarget.value })} /></Field>
      <Field label="Особенности"><TextAreaControl value={draft.featureText} rows={8} onInput={(event) => onChange({ featureText: event.currentTarget.value })} /></Field>
      <Field label="Импульсы"><TextAreaControl value={draft.impulses} rows={3} onInput={(event) => onChange({ impulses: event.currentTarget.value })} /></Field>
      <Field label="Потенциальные противники"><TextAreaControl value={draft.potentialAdversaries} rows={3} onInput={(event) => onChange({ potentialAdversaries: event.currentTarget.value })} /></Field>
    </div>
  );
}

function createDraft(kind: EntityKind): Draft {
  return kind === 'adversary' ? adversaryDraftFromItem(null) : environmentDraftFromItem(null);
}

function adversaryDraftFromItem(item: Adversary | null): AdversaryDraft {
  return {
    id: item?.id ?? null,
    name: item?.name ?? '',
    tier: String(item?.tier ?? 1),
    roleId: item?.roleId ?? 'standard',
    summary: item?.summary ?? '',
    image: item?.image ?? '',
    difficulty: String(item?.difficulty ?? 12),
    hp: String(item?.hp ?? 4),
    stress: String(item?.stress ?? 0),
    attackBonus: item?.attackBonus ?? '0',
    attackRange: item?.attackRange ?? '',
    damageType: item?.damageType ?? '',
    damageDieCount: String(item?.damageDieCount ?? 1),
    damageDieSize: String(item?.damageDieSize ?? 6),
    damageBonus: String(item?.damageBonus ?? 0),
    weaponName: item?.weaponName ?? '',
    motives: item?.motives ?? '',
    experiences: item?.experiences ?? '',
    mainBody: item?.mainBody ?? '',
    featuresText: serializeFeatures(item?.features ?? [])
  };
}

function adversaryPayloadFromDraft(draft: AdversaryDraft): Partial<Adversary> {
  return {
    name: draft.name,
    tier: numberValue(draft.tier, 1),
    roleId: draft.roleId,
    summary: draft.summary,
    image: draft.image || null,
    difficulty: numberValue(draft.difficulty, 12),
    hp: numberValue(draft.hp, 4),
    stress: numberValue(draft.stress, 0),
    attackBonus: draft.attackBonus,
    attackRange: draft.attackRange,
    damageType: draft.damageType,
    damageDieCount: numberValue(draft.damageDieCount, 1),
    damageDieSize: numberValue(draft.damageDieSize, 6),
    damageBonus: numberValue(draft.damageBonus, 0),
    weaponName: draft.weaponName,
    motives: draft.motives,
    experiences: draft.experiences,
    mainBody: draft.mainBody,
    features: parseCombatFeatureText(draft.featuresText)
  };
}

function environmentDraftFromItem(item: LibraryEnvironment | null): EnvironmentDraft {
  return {
    id: item ? environmentRawId(item.raw) : createId('environment'),
    name: item?.name ?? '',
    tier: String(item?.tier ?? 1),
    typeName: item?.typeName ?? 'Окружение',
    difficulty: String(item?.difficulty ?? 12),
    summary: item?.summary ?? '',
    imageUrl: item?.raw.image_url ?? item?.imageUrl ?? '',
    body: item?.body ?? '',
    featureText: item?.featureText ?? '',
    impulses: item?.impulses ?? '',
    potentialAdversaries: item?.potentialAdversaries ?? ''
  };
}

async function saveEnvironmentDraft(draft: EnvironmentDraft): Promise<RawEnvironmentItem> {
  if (!draft.name.trim()) throw new Error('Введите название окружения');
  const raw = rawEnvironmentFromDraft(draft);
  const current = await loadCustomEnvironments();
  const next = [
    raw,
    ...current.filter((item) => environmentRawKey(item) !== environmentRawKey(raw))
  ];
  saveCustomEnvironments(next);
  return raw;
}

async function removeEnvironmentDraft(draft: EnvironmentDraft): Promise<void> {
  const current = await loadCustomEnvironments();
  saveCustomEnvironments(current.filter((item) => environmentRawKey(item) !== `environment:${draft.id}`));
}

function rawEnvironmentFromDraft(draft: EnvironmentDraft): RawEnvironmentItem {
  return {
    id: draft.id,
    slug: slugify(draft.name || draft.id),
    source_slugs: ['custom'],
    tier: numberValue(draft.tier, 1),
    difficulty: numberValue(draft.difficulty, 12),
    type_slug: slugify(draft.typeName || 'environment'),
    type_name: draft.typeName.trim() || 'Окружение',
    image_url: draft.imageUrl.trim() || null,
    language: 'ru',
    name: draft.name.trim(),
    short_description: draft.summary.trim(),
    main_body: draft.body.trim(),
    features: parseFeatureText(draft.featureText),
    impulses: draft.impulses.trim(),
    potential_adversaries: draft.potentialAdversaries.trim()
  };
}

function isCustomEnvironment(item: LibraryEnvironment): boolean {
  return Array.isArray(item.raw.source_slugs) && item.raw.source_slugs.includes('custom');
}

function environmentRawId(raw: RawEnvironmentItem): string {
  return String(raw.id ?? raw.slug ?? createId('environment'));
}

function environmentRawKey(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const raw = value as RawEnvironmentItem;
  return `environment:${String(raw.id ?? raw.slug ?? '')}`;
}

function serializeFeatures(features: Array<{ name?: string | null; text?: string | null; main_body?: string | null }>): string {
  return features
    .map((feature) => {
      const name = feature.name?.trim();
      const text = (feature.text ?? feature.main_body ?? '').trim();
      if (!name) return text;
      return text ? `### ${name}\n${text}` : `### ${name}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function parseFeatureText(value: string): RawAdversaryFeature[] {
  const text = value.trim();
  if (!text) return [];
  const sections = text.split(/\n(?=###\s+)/g);
  return sections.map((section, index) => {
    const lines = section.trim().split('\n');
    const heading = lines[0]?.match(/^###\s*(.+)$/);
    const name = heading?.[1]?.trim() || `Особенность ${index + 1}`;
    const body = heading ? lines.slice(1).join('\n').trim() : section.trim();
    return {
      id: `feature-${index + 1}`,
      name,
      main_body: body
    };
  }).filter((feature) => feature.name || feature.main_body);
}

function parseCombatFeatureText(value: string): AdversaryFeature[] {
  return parseFeatureText(value).map((feature) => ({
    id: feature.id ?? createId('feature'),
    name: feature.name ?? 'Особенность',
    text: feature.main_body ?? feature.text ?? ''
  }));
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || createId('entity');
}
