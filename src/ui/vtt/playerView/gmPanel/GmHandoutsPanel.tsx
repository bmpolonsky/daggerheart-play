/** @jsxImportSource preact */
import { Image } from "lucide-react";
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
        <button className="player-gm-handouts__row" key={handout.id} type="button" onClick={() => playerViewUiActions.openHandoutDraft(handout)}>
          <div className="player-gm-handouts__preview" aria-label={handout.imageUrl ? 'Изображение раздатки' : 'Без изображения'}>
            {handout.imageUrl ? <img src={cssImageUrl(handout.imageUrl)} alt="" /> : <Image size={18} />}
          </div>
          <div className="player-gm-handouts__body">
            <strong>{handout.title || 'Без названия'}</strong>
            <small>{handout.body || 'Без текста'}</small>
          </div>
        </button>
      ))}
      {handouts.length === 0 && <p className="player-roster-empty">Раздатки пока нет.</p>}
    </section>
  );
}
