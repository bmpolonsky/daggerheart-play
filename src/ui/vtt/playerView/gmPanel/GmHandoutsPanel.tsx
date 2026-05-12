/** @jsxImportSource preact */
import { Eye, Image } from "lucide-react";
import type { GameHandout } from "../../../../domain/rules/types";
import { feedService } from "../../../../services/serviceRegistry";
import { cssImageUrl } from "../helpers";

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
            <button type="button" title="Показать игрокам в чате" onClick={() => feedService.addHandout('Мастер', handout, { title: 'Раздатка' })}>
              <Eye size={14} />
              <span>Показать</span>
            </button>
          </div>
        </article>
      ))}
      {handouts.length === 0 && <p className="player-roster-empty">Раздатки пока нет.</p>}
    </section>
  );
}
