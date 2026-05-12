import type { CharacterBuilderChoicePreview } from "../../../domain/characterBuilder";

export function BuilderChoiceDetail({ preview }: { preview: CharacterBuilderChoicePreview }) {
  return (
    <aside className="cinematic-builder-choice-detail">
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
