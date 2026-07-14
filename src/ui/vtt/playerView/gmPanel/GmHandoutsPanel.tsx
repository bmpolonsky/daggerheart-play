/** @jsxImportSource preact */
import { Image } from "lucide-react";
import type { GameHandout } from "../../../../domain/rules/types";
import { AssetImage } from "../../../components/common/AssetImage";
import { ListItem } from "../../../components/common/ListItem";
import { playerViewUiActions } from "../playerViewUiState";
import { renderRulesText } from "../sheetText";

export function GmHandoutsPanel({
  handouts,
  onOpenChronicle
}: {
  handouts: GameHandout[];
  onOpenChronicle?: () => void;
}) {
  return (
    <section className="player-gm-handouts" aria-label="Раздатка">
      {handouts.map((handout) => (
        <ListItem
          className="player-gm-handouts__row"
          key={handout.id}
          title={handout.title || 'Без названия'}
          subtitle={renderRulesText(handout.body || 'Без текста')}
          leftAccessory={<div className="player-gm-handouts__preview" aria-label={handout.imageUrl ? 'Изображение раздатки' : 'Без изображения'}>
            {handout.imageUrl ? <AssetImage src={handout.imageUrl} alt="" /> : <Image size={18} />}
          </div>}
          lines={2}
          align="start"
          onClick={() => { playerViewUiActions.openHandoutDraft(handout); onOpenChronicle?.(); }}
        />
      ))}
      {handouts.length === 0 && <p className="player-roster-empty">Раздатки пока нет.</p>}
    </section>
  );
}
