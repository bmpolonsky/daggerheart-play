import type { GenericLibraryItem } from "../../../domain/content/types";
import { CLASS_LABELS, DEFAULT_TRAITS, TRAIT_LABELS } from "../../../domain/rules/constants";
import type { Character, DaggerheartClass } from "../../../domain/rules/types";
import { BuilderStat } from "./BuilderStat";
import { initials, signed } from "./formatting";
import { BUILDER_TRAIT_IDS } from "./traits";

export function BuilderLivePreview({
  draft,
  classImageUrl,
  ancestryName,
  communityName,
  subclassName,
  cards,
  canCreate,
  blockingCount
}: {
  draft: Partial<Character> & { className?: DaggerheartClass };
  classImageUrl: string | null;
  ancestryName?: string;
  communityName?: string;
  subclassName?: string;
  cards: GenericLibraryItem[];
  canCreate: boolean;
  blockingCount: number;
}) {
  const previewImage = draft.portraitUrl || classImageUrl || '';
  const traits = draft.traits ?? DEFAULT_TRAITS;
  return (
    <aside className="cinematic-builder-preview">
      <div className="cinematic-builder-preview-art">
        {previewImage ? <img src={previewImage} alt="" /> : <span>{initials(draft.name ?? 'DH')}</span>}
        <div>
          <strong>{draft.name || 'Новый герой'}</strong>
          <span>{draft.className ? CLASS_LABELS[draft.className] : 'Класс'} · уровень {draft.level ?? 1}</span>
        </div>
      </div>
      <div className="cinematic-builder-preview-line">
        <span>{ancestryName || 'Родословная'}</span>
        <span>{communityName || 'Сообщество'}</span>
        <span>{subclassName || 'Подкласс'}</span>
      </div>
      <div className="dh-stat-grid cinematic-builder-preview-stats">
        <BuilderStat label="Уклонение" value={draft.evasion ?? 10} />
        <BuilderStat label="Броня" value={draft.armor?.score ?? 0} />
        <BuilderStat label="Ощутимый" value={draft.thresholds?.major ?? 0} />
        <BuilderStat label="Тяжелый" value={draft.thresholds?.severe ?? 0} />
      </div>
      <div className="cinematic-builder-preview-traits">
        {BUILDER_TRAIT_IDS.map((trait) => (
          <span key={trait}><strong>{TRAIT_LABELS[trait]}</strong>{signed(traits[trait] ?? 0)}</span>
        ))}
      </div>
      <div className="cinematic-builder-preview-cards">
        <strong>Карты в стартовой руке</strong>
        {cards.length ? cards.map((card) => <span key={card.id}>{card.name}</span>) : <span>Выберите две карты доменов</span>}
      </div>
      <div className={`cinematic-builder-readiness ${canCreate ? 'dh-is-ready' : ''}`}>
        <strong>{canCreate ? 'Готов к сцене' : `Осталось: ${blockingCount}`}</strong>
        <span>{canCreate ? 'Персонаж появится в игре.' : 'Заполните обязательные выборы.'}</span>
      </div>
    </aside>
  );
}
