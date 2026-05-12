/** @jsxImportSource preact */
import { UserRound } from 'lucide-react';
import type { CharactersState } from '../../../../domain/rules/types';
import type { TableParticipant } from '../../../../domain/tabletop/types';

export function PlayerSeatPicker({ characters, seats, onSelect }: { characters: CharactersState; seats: TableParticipant[]; onSelect: (seatId: string) => void }) {
  return (
    <section className="player-seat-picker" aria-label="Выбор игрока">
      <header>
        <UserRound size={20} />
        <div>
          <strong>Кем вы играете?</strong>
          <span>Выберите свое место в игре.</span>
        </div>
      </header>
      <div className="player-seat-picker__list">
        {seats.map((seat) => {
          const character = seat.actorIds[0] ? characters.entities[seat.actorIds[0]] : null;
          return (
            <button type="button" key={seat.id} onClick={() => onSelect(seat.id)}>
              <strong>{seat.name}</strong>
              <span>{character?.name ?? 'Персонаж не назначен'}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
