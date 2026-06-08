import { X } from 'lucide-react';
import type { CharacterBuilderChoicePreview } from "../../../domain/characterBuilder";
import { IconButton } from '../../components/common/IconButton';

export function BuilderChoiceDetail({ preview, onClose }: { preview: CharacterBuilderChoicePreview; onClose?: () => void }) {
  return (
    <aside className="cinematic-builder-choice-detail">
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
      {preview.imageUrl && <img src={preview.imageUrl} alt="" />}
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
