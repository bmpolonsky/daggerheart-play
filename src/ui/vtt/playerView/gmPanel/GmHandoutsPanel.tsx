/** @jsxImportSource preact */
import { Image } from "lucide-react";
import type { GameHandout } from "../../../../domain/rules/types";
import { AssetImage } from "../../../components/common/AssetImage";
import { ChoiceCard } from "../../../components/common/ChoiceCard";
import { playerViewUiActions } from "../playerViewUiState";
import { renderRulesText } from "../sheetText";

export function GmHandoutsPanel({
  handouts
}: {
  handouts: GameHandout[];
}) {
  return (
    <section className="player-gm-handouts" aria-label="Раздатка">
      {handouts.map((handout) => (
        <ChoiceCard className="player-gm-handouts__row" key={handout.id} type="button" onClick={() => playerViewUiActions.openHandoutDraft(handout)}>
          <div className="player-gm-handouts__preview" aria-label={handout.imageUrl ? 'Изображение раздатки' : 'Без изображения'}>
            {handout.imageUrl ? <AssetImage src={handout.imageUrl} alt="" /> : <Image size={18} />}
          </div>
          <div className="player-gm-handouts__body">
            <strong>{handout.title || 'Без названия'}</strong>
            <small>{renderRulesText(handout.body || 'Без текста')}</small>
          </div>
        </ChoiceCard>
      ))}
      {handouts.length === 0 && <p className="player-roster-empty">Раздатки пока нет.</p>}
    </section>
  );
}
