import { ImagePlus, Music, X } from 'lucide-react';
import type { CSSProperties, ChangeEvent } from 'react';
import { publicAssetUrl } from '../../../domain/content/publicAssets';
import { IconButton } from './IconButton';
import styles from './ImageFilePicker.module.css';

export type FilePickerPreviewStyle = Pick<CSSProperties, 'objectFit' | 'objectPosition' | 'transform' | 'transformOrigin'>;
type UiNode = any;

export interface FilePickerProps {
  accept: string;
  label: string;
  valueLabel?: string;
  previewUrl?: string | null;
  emptyLabel?: string;
  className?: string;
  aspectRatio?: string;
  previewStyle?: FilePickerPreviewStyle;
  previewContent?: UiNode;
  size?: 'default' | 'compact';
  hideLabel?: boolean;
  icon?: 'image' | 'music';
  onFileSelect: (file: File) => void | Promise<void>;
  onClear?: () => void;
}

export function FilePicker({
  accept,
  label,
  valueLabel,
  previewUrl,
  emptyLabel = 'Загрузить',
  className = '',
  aspectRatio = '1 / 1',
  previewStyle,
  previewContent,
  size = 'default',
  hideLabel = false,
  icon = 'image',
  onFileSelect,
  onClear
}: FilePickerProps) {
  const resolvedPreviewUrl = previewUrl?.trim() ?? '';
  const resolvedValueLabel = valueLabel?.trim() ?? '';
  const hasFile = Boolean(previewContent || resolvedPreviewUrl || resolvedValueLabel);
  const style = { '--image-file-picker-aspect': aspectRatio } as CSSProperties;

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await onFileSelect(file);
    input.value = '';
  };
  const renderedIcon = icon === 'music' ? <Music size={22} /> : <ImagePlus size={22} />;
  const rootClassName = [
    'image-file-picker',
    styles.root,
    size !== 'default' ? `image-file-picker--${size}` : '',
    size !== 'default' ? styles.compact : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} style={style}>
      <span className={`image-file-picker__label ${styles.label} ${hideLabel ? styles.visuallyHidden : ''}`}>{label}</span>
      <div className={`image-file-picker__frame ${styles.frame}`}>
        <label className={`image-file-picker__upload-target ${styles.uploadTarget}`}>
          {previewContent ?? (resolvedPreviewUrl ? (
            <img src={resolvedPreviewUrl} alt="" style={previewStyle} />
          ) : (
            <span className={hasFile ? `image-file-picker__file ${styles.file}` : `image-file-picker__empty ${styles.empty}`}>
              {renderedIcon}
              {hasFile ? resolvedValueLabel : emptyLabel}
            </span>
          ))}
          <input type="file" accept={accept} onChange={handleChange} aria-label={label} />
        </label>
        {hasFile && onClear && (
          <IconButton className={`image-file-picker__clear ${styles.clear}`} variant="danger" size="sm" type="button" onClick={onClear} aria-label={`Убрать ${label.toLowerCase()}`}>
            <X size={14} aria-hidden="true" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

export interface ImageFilePickerProps extends Omit<FilePickerProps, 'accept' | 'previewUrl' | 'icon' | 'valueLabel'> {
  imageUrl?: string | null;
}

export function ImageFilePicker({ imageUrl, ...props }: ImageFilePickerProps) {
  return <FilePicker {...props} accept="image/*" previewUrl={imageUrl ? publicAssetUrl(imageUrl) : imageUrl} icon="image" />;
}
