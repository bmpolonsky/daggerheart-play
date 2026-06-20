import { X } from 'lucide-react';
import type { CharacterBuilderChoicePreview } from "../../../domain/characterBuilder";
import { AssetImage } from '../../components/common/AssetImage';
import { IconButton } from '../../components/common/IconButton';

export function BuilderChoiceDetail({ preview, onClose }: { preview: CharacterBuilderChoicePreview; onClose?: () => void }) {
  return (
    <aside className="cinematic-builder-choice-detail" aria-label="Описание выбора">
      {onClose && (
        <IconButton
          className="cinematic-builder-choice-detail-close"
          type="button"
          variant="ghost"
          size="sm"
          title="Закрыть описание"
          aria-label="Закрыть описание"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </IconButton>
      )}
      {preview.imageUrl && <AssetImage src={preview.imageUrl} alt="" />}
      <div className="cinematic-builder-choice-detail-copy dh-scroll">
        <span className="cinematic-card-meta">{preview.kicker}</span>
        <strong>{preview.title}</strong>
        {preview.subtitle && <em>{preview.subtitle}</em>}
        {preview.facts?.length ? (
          <div className="cinematic-builder-choice-detail-facts">
            {preview.facts.map((fact) => <span key={fact}>{fact}</span>)}
          </div>
        ) : null}
        <p>{preview.body}</p>
      </div>
    </aside>
  );
}
