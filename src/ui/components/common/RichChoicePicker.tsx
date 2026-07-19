import { ArrowLeft, ChevronDown, X } from 'lucide-react';
import { useMemo, useState } from 'preact/hooks';
import { AssetImage } from './AssetImage';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { IconButton } from './IconButton';
import { ListDetailLayout } from './ListDetailLayout';
import { ListItem } from './ListItem';
import { SearchField } from './SearchField';
import { SectionHeader } from './SectionHeader';
import { Surface } from './Surface';
import { cleanMarkdownText } from '../../../core/utils/markdownText';
import styles from './RichChoicePicker.module.css';

export interface RichChoicePickerItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string | null;
  disabled?: boolean;
}

export interface RichChoicePickerProps {
  label: string;
  items: RichChoicePickerItem[];
  value: string;
  placeholder: string;
  onChange: (id: string) => void;
  emptyOptionLabel?: string;
  searchPlaceholder?: string;
  className?: string;
}

/**
 * A picker for decisions that cannot be safely made from a one-line label.
 * Keep native selects for compact parameters; use this for game entities with
 * artwork, rules text, provenance, or other decision-making context.
 */
export function RichChoicePicker({
  label,
  items,
  value,
  placeholder,
  onChange,
  emptyOptionLabel,
  searchPlaceholder = 'Найти…',
  className = ''
}: RichChoicePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [narrowDetailOpen, setNarrowDetailOpen] = useState(false);
  const selected = items.find((item) => item.id === value) ?? null;
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => [item.title, item.subtitle, item.description]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedQuery));
  }, [items, query]);
  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
    setPreviewId(null);
    setNarrowDetailOpen(false);
  };
  const openPicker = () => {
    setPreviewId(selected?.id ?? null);
    setNarrowDetailOpen(false);
    setOpen(true);
  };
  const preview = matches.find((item) => item.id === previewId)
    ?? matches.find((item) => item.id === value)
    ?? matches[0]
    ?? null;
  const previewEmptyOption = Boolean(emptyOptionLabel && previewId === '');
  const showPreview = preview || previewEmptyOption;
  const previewDescription = preview?.description ? cleanMarkdownText(preview.description, { stripEmphasis: true, normalizeLineBreaks: true }) : '';
  const showItem = (id: string | null) => {
    setPreviewId(id);
    setNarrowDetailOpen(true);
  };

  return (
    <div className={`dh-rich-choice-picker ${styles.root} ${className}`.trim()}>
      <span className={styles.label}>{label}</span>
      <Button
        className={styles.trigger}
        variant="secondary"
        fullWidth
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        iconAfter={<ChevronDown size={16} aria-hidden="true" />}
        onClick={openPicker}
      >
        <span className={styles.triggerText}>{selected?.title ?? placeholder}</span>
        {selected?.subtitle && <span className={styles.triggerMeta}>{selected.subtitle}</span>}
      </Button>

      {open && (
        <Dialog aria-label={`Выбор: ${label}`} className={styles.dialog} onClose={() => setOpen(false)}>
          <SectionHeader
            title={label}
            subtitle={selected ? `Выбрано: ${selected.title}` : placeholder}
            actions={(
              <IconButton variant="ghost" size="sm" aria-label={`Закрыть выбор: ${label}`} title="Закрыть" onClick={() => setOpen(false)}>
                <X size={16} aria-hidden="true" />
              </IconButton>
            )}
          />
          <SearchField aria-label={`Поиск: ${label}`} value={query} placeholder={searchPlaceholder} onInput={(event) => setQuery(event.currentTarget.value)} />
          <ListDetailLayout
            className={styles.layout}
            narrowDetailOpen={narrowDetailOpen && Boolean(showPreview)}
            listLabel={`${label}: варианты`}
            detailLabel={`Описание: ${label}`}
            listClassName={styles.list}
            detailClassName={styles.detail}
            list={(
              <div className={styles.options} role="listbox" aria-label={`${label}: варианты`}>
                {emptyOptionLabel && (
                  <ListItem
                    role="option"
                    aria-selected={!value}
                    title={emptyOptionLabel}
                    subtitle="Оставить без выбора"
                    onClick={() => showItem('')}
                  />
                )}
                {matches.map((item) => (
                  <ListItem
                    key={item.id}
                    role="option"
                    aria-selected={item.id === value}
                    align="start"
                    lines={2}
                    title={item.title}
                    subtitle={item.subtitle}
                    leftAccessory={item.imageUrl ? <AssetImage className={styles.thumbnail} src={item.imageUrl} alt="" /> : undefined}
                    disabled={item.disabled}
                    onClick={() => showItem(item.id)}
                  />
                ))}
                {matches.length === 0 && <p className={styles.empty}>Ничего не найдено.</p>}
              </div>
            )}
            detail={showPreview ? (
              <Surface className={styles.preview} tone="subtle" padding="md">
                <Button className={styles.back} variant="ghost" size="sm" iconBefore={<ArrowLeft size={15} aria-hidden="true" />} onClick={() => setNarrowDetailOpen(false)}>
                  К списку
                </Button>
                {preview?.imageUrl && <AssetImage className={styles.art} src={preview.imageUrl} alt="" />}
                <div className={styles.previewCopy}>
                  <strong className={styles.previewTitle}>{preview?.title ?? emptyOptionLabel}</strong>
                  {preview?.subtitle && <span className={styles.meta}>{preview.subtitle}</span>}
                {previewDescription && <p className={styles.description}>{previewDescription}</p>}
                </div>
                <Button
                  className={styles.choose}
                  variant="primary"
                  disabled={preview?.disabled || (!preview && !emptyOptionLabel)}
                  onClick={() => choose(preview?.id ?? '')}
                >
                  {preview?.id === value || (!preview && !value) ? 'Выбрано' : 'Выбрать'}
                </Button>
              </Surface>
            ) : null}
          />
        </Dialog>
      )}
    </div>
  );
}
