/** @jsxImportSource preact */
import { Eye, Image } from "lucide-react";
import type { GameHandout } from "../../../../domain/rules/types";
import { cssImageUrl } from "../helpers";
import { playerViewUiActions } from "../playerViewUiState";

export function GmHandoutsPanel({
  handouts
}: {
  handouts: GameHandout[];
}) {
  return (
    <section className="player-gm-handouts" aria-label="Раздатка">
      {handouts.map((handout) => (
        <article className="player-gm-handouts__row" key={handout.id}>
          <div className="player-gm-handouts__preview" aria-label={handout.imageUrl ? 'Изображение раздатки' : 'Без изображения'}>
            {handout.imageUrl ? <img src={cssImageUrl(handout.imageUrl)} alt="" /> : <Image size={18} />}
          </div>
          <div className="player-gm-handouts__body">
            <strong>{handout.title || 'Без названия'}</strong>
            <small>{handout.body || 'Без текста'}</small>
          </div>
          <div className="player-gm-handouts__actions">
            <button type="button" title="Подготовить к показу в чате" onClick={() => playerViewUiActions.openHandoutDraft(handout)}>
              <Eye size={14} />
              <span>В чат</span>
            </button>
          </div>
        </article>
      ))}
      {handouts.length === 0 && <p className="player-roster-empty">Раздатки пока нет.</p>}
    </section>
  );
}
