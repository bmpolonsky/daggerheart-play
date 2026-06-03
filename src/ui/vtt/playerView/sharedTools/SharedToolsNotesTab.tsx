/** @jsxImportSource preact */
import type { GameState } from '../../../../domain/rules/types';
import { gameService } from '../../../../services/serviceRegistry';
import { TextAreaControl } from '../../../components/common/Field';

export function SharedToolsNotesTab({ game }: { game: GameState }) {
  return (
    <section className="player-tools-section">
      <header><strong>Заметки</strong></header>
      <TextAreaControl
        className="player-tools-textarea"
        value={game.tableNotes}
        onInput={(event) => gameService.updateGame({ tableNotes: event.currentTarget.value })}
        placeholder="Личные заметки мастера"
      />
    </section>
  );
}
