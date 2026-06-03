/** @jsxImportSource preact */
import { useStream } from '../../../../../core/hooks/useStream';
import type { CharacterWealth } from '../../../../../domain/rules/types';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { characterService, gameService } from '../../../../../services/serviceRegistry';
import { FeedCardHeader } from './RollFeedCard';

type WealthFieldKind = keyof CharacterWealth;

const WEALTH_FIELDS: Array<{ kind: WealthFieldKind; label: string }> = [
  { kind: 'coins', label: 'Монеты' },
  { kind: 'handfuls', label: 'Горсти' },
  { kind: 'bags', label: 'Мешки' },
  { kind: 'chests', label: 'Сундуки' }
];

export function WealthFeedCard({ item }: { item: TableFeedItem }) {
  const editor = item.wealthEditor;
  const game = useStream(gameService.game$);
  const characters = useStream(characterService.characters$);
  const character = editor ? characters.entities[editor.characterId] : null;
  const visibleFields = WEALTH_FIELDS.filter((field) => field.kind !== 'coins' || game.showCoins);
  if (!character) return null;

  return (
    <>
      <FeedCardHeader item={item} label={item.kicker} />
      <section className="feed-wealth-editor" aria-label="Редактировать деньги">
        <strong>{item.title}</strong>
        <div className={`feed-wealth-editor__grid ${game.showCoins ? 'feed-wealth-editor__grid--coins' : ''}`}>
          {visibleFields.map((field) => (
            <WealthInput
              key={field.kind}
              characterId={character.id}
              kind={field.kind}
              label={field.label}
              value={character.wealth[field.kind]}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function WealthInput({
  characterId,
  kind,
  label,
  value
}: {
  characterId: string;
  kind: WealthFieldKind;
  label: string;
  value: number;
}) {
  const max = kind === 'chests' ? 1 : 9;
  return (
    <label className="feed-wealth-editor__field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onInput={(event) => characterId && characterService.updateWealth(characterId, { [kind]: Number(event.currentTarget.value) } as Partial<CharacterWealth>)}
      />
    </label>
  );
}
