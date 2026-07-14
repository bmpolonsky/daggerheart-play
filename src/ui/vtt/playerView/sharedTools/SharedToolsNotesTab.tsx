/** @jsxImportSource preact */
import type { GameState } from '../../../../domain/rules/types';
import { gameService } from '../../../../services/serviceRegistry';
import { TextAreaControl } from '../../../components/common/Field';

export function SharedToolsNotesTab({ game }: { game: GameState }) {
  return (
    <section className="player-tools-section player-tools-notes-section">
      <div className="player-tools-notes-workspace">
        <TextAreaControl
          className="player-tools-notes-editor"
          aria-label="Заметки кампании"
          value={game.tableNotes}
          onInput={(event) => gameService.updateGame({ tableNotes: event.currentTarget.value })}
          placeholder={'Незакрытые линии\n\nЧто изменилось после последней сцены?\n\nКого и что вернуть в историю?'}
        />
      </div>
    </section>
  );
}
