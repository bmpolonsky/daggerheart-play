import { ImagePlus, Music, X } from 'lucide-react';
import type { CSSProperties, ChangeEvent } from 'react';

interface FilePickerProps {
  accept: string;
  label: string;
  valueLabel?: string;
  previewUrl?: string | null;
  emptyLabel?: string;
  className?: string;
  aspectRatio?: string;
  size?: 'default' | 'compact';
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
  size = 'default',
  icon = 'image',
  onFileSelect,
  onClear
}: FilePickerProps) {
  const resolvedPreviewUrl = previewUrl?.trim() ?? '';
  const resolvedValueLabel = valueLabel?.trim() ?? '';
  const hasFile = Boolean(resolvedPreviewUrl || resolvedValueLabel);
  const style = { '--image-file-picker-aspect': aspectRatio } as CSSProperties;

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await onFileSelect(file);
    input.value = '';
  };
  const renderedIcon = icon === 'music' ? <Music size={22} /> : <ImagePlus size={22} />;

  return (
    <div className={['image-file-picker', size !== 'default' ? `image-file-picker--${size}` : '', className].filter(Boolean).join(' ')} style={style}>
      <span className="image-file-picker__label">{label}</span>
      <div className="image-file-picker__frame">
        <label className="image-file-picker__upload-target">
          {resolvedPreviewUrl ? (
            <img src={resolvedPreviewUrl} alt="" />
          ) : (
            <span className={hasFile ? 'image-file-picker__file' : 'image-file-picker__empty'}>
              {renderedIcon}
              {hasFile ? resolvedValueLabel : emptyLabel}
            </span>
          )}
          <input type="file" accept={accept} onChange={handleChange} aria-label={label} />
        </label>
        {hasFile && onClear && (
          <button className="image-file-picker__clear" type="button" onClick={onClear} aria-label={`Убрать ${label.toLowerCase()}`}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

interface ImageFilePickerProps extends Omit<FilePickerProps, 'accept' | 'previewUrl' | 'icon' | 'valueLabel'> {
  imageUrl?: string | null;
}

export function ImageFilePicker({ imageUrl, ...props }: ImageFilePickerProps) {
  return <FilePicker {...props} accept="image/*" previewUrl={imageUrl} icon="image" />;
}
