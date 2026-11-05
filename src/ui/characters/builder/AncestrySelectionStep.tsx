import type { GenericLibraryItem } from '../../../domain/content/types';
import { useState } from 'preact/hooks';
import { ChevronRight } from 'lucide-react';
import { AssetImage, Avatar, ChoiceCard, Notice, SearchField, SegmentedControl } from '../../components/common';
import { ancestrySelectionPresentation, filterAncestryOptions, type AncestryFeatureOption } from './ancestrySelectionPresentation';
import { initials } from './formatting';
import styles from './AncestrySelectionStep.module.css';

export interface AncestrySelectionStepProps {
  ancestries: GenericLibraryItem[];
  firstId: string;
  secondId?: string;
  onModeChange: (mixed: boolean) => void;
  onFirstChange: (id: string) => void;
  onSecondChange: (id: string) => void;
}

export function AncestrySelectionStep({ ancestries, firstId, secondId, onModeChange, onFirstChange, onSecondChange }: AncestrySelectionStepProps) {
  const view = ancestrySelectionPresentation(ancestries, firstId, secondId);
  const [singleQuery, setSingleQuery] = useState('');
  const singleOptions = filterAncestryOptions(view.singleOptions, singleQuery);
  return (
    <section className={styles.step} role="group" aria-label="Шаг: Родословная">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h3 className="cinematic-builder-title">Родословная</h3>
          <SegmentedControl label="Тип родословной" value={view.mixed ? 'mixed' : 'single'}
            options={[{ value: 'single', label: 'Одна родословная' }, { value: 'mixed', label: 'Смешанная' }]}
            onChange={mode => onModeChange(mode === 'mixed')} />
        </div>
        {view.mixed && <div className={styles.pair} role="status" aria-label="Выбранные свойства родословной">
          {view.pair.map((text, index) => <span key={index}>{index + 1}. {text}</span>)}
        </div>}
        {view.issue && <Notice tone="error" role="alert">{view.issue}</Notice>}
      </header>
      {view.mixed ? <div className={`${styles.body} dh-scroll`} role="region" aria-label="Выбор свойств смешанной родословной" tabIndex={0}>
        <FeatureSelection title="Первое свойство" label="Первое свойство родословной" options={view.firstOptions} selected={view.first} onChange={onFirstChange} />
        <FeatureSelection title="Второе свойство" label="Второе свойство родословной" options={view.secondOptions} selected={view.second} onChange={onSecondChange} />
      </div> : <div className={`${styles.body} ${styles.singleBody} dh-scroll`} role="region" aria-label="Выбор родословной">
        <div className={`${styles.featureBlock} ${styles.singleList}`}>
          <SearchField size="sm" aria-label="Поиск родословной" placeholder="Найти родословную…" value={singleQuery} onInput={event => setSingleQuery(event.currentTarget.value)} />
          <div className={`${styles.options} dh-scroll`} role="region" aria-label="Родословные" tabIndex={0}>
            {singleOptions.map(item => <ChoiceCard className={styles.option} selected={item.id === firstId} aria-pressed={item.id === firstId}
              key={item.id} data-ancestry-option onClick={() => onFirstChange(item.id)}>
              <Avatar src={item.imageUrl ?? undefined} fallback={initials(item.name)} size="sm" />
              <span className={styles.optionCopy}><strong>{item.name}</strong><span>{item.featureNames}</span></span>
            </ChoiceCard>)}
            {!singleOptions.length && <p className={styles.empty}>Родословные не найдены.</p>}
          </div>
        </div>
        <SingleAncestryDetail view={view} />
      </div>}
    </section>
  );
}

// A new selection must not inherit a native keyboard scroll animation still
// targeting the old detail element. Keep disclosure state outside that keyed
// element so comparing ancestries does not unexpectedly close their descriptions.
// Leaving single-ancestry mode still unmounts this component and resets it.
function SingleAncestryDetail({ view }: { view: ReturnType<typeof ancestrySelectionPresentation> }) {
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  return (
    <section key={view.firstAncestry?.id ?? 'empty'} className={`${styles.singleDetail} dh-scroll`} aria-label="Свойства выбранной родословной" tabIndex={0}>
      {view.firstAncestry ? <>
        <h4>{view.firstAncestry.name}</h4>
        {view.singleFeatures.map(feature => <div className={styles.feature} key={feature.id}><strong>{feature.name}</strong><p>{feature.description}</p></div>)}
        {(view.singleDescription || view.firstAncestry.imageUrl) && <details className={styles.description} open={descriptionOpen} onToggle={event => setDescriptionOpen(event.currentTarget.open)}><summary><ChevronRight className={styles.descriptionChevron} size={16} aria-hidden="true" /><span>Описание родословной</span></summary>
          {view.firstAncestry.imageUrl && <AssetImage src={view.firstAncestry.imageUrl} className={styles.ancestryArt} alt={view.firstAncestry.name} />}
          {view.singleDescription && <p>{view.singleDescription}</p>}
        </details>}
      </> : <p className={styles.empty}>Родословная ещё не выбрана.</p>}
    </section>
  );
}

function FeatureSelection({ title, label, options, selected, onChange }: {
  title: string; label: string; options: AncestryFeatureOption[]; selected: AncestryFeatureOption | null; onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = filterAncestryOptions(options, query);
  return <section className={styles.featureBlock} role="group" aria-label={label}>
    <h4>{title}</h4>
    <SearchField size="sm" aria-label={`Поиск: ${title}`} placeholder="Найти родословную или свойство…" value={query} onInput={event => setQuery(event.currentTarget.value)} />
    <div className={`${styles.options} dh-scroll`} role="region" aria-label={`Варианты: ${label}`} tabIndex={0}>
      {filtered.map(item => <ChoiceCard className={styles.option} selected={item.id === selected?.id} aria-pressed={item.id === selected?.id}
        aria-label={`${item.title} — ${item.subtitle}`} key={item.id} data-ancestry-option onClick={() => onChange(item.id)}>
        <Avatar src={item.imageUrl ?? undefined} fallback={initials(item.title)} size="sm" />
        <span className={styles.optionCopy}><strong>{item.title}</strong><span>{item.subtitle}</span></span>
      </ChoiceCard>)}
      {!filtered.length && <p className={styles.empty}>Свойства не найдены.</p>}
    </div>
    <div className={styles.feature} aria-label="Описание выбранного свойства">
      {selected ? <><strong>{selected.subtitle}</strong><p>{selected.description || 'Описание свойства отсутствует.'}</p></>
        : <p className={styles.empty}>Свойство ещё не выбрано.</p>}
    </div>
  </section>;
}
