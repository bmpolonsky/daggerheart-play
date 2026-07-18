/** @jsxImportSource preact */
import { UserRound } from 'lucide-react';
import type { CharactersState } from '../../../../domain/rules/types';
import type { TableParticipant } from '../../../../domain/tabletop/types';
import { ChoiceCard } from '../../../components/common/ChoiceCard';

export function PlayerSeatPicker({ characters, seats, onSelect }: { characters: CharactersState; seats: TableParticipant[]; onSelect: (seatId: string) => void }) {
  return (
    <section className="player-seat-picker" aria-label="Выбор игрока">
      <header>
        <UserRound size={20} />
        <div>
          <strong>Кем вы играете?</strong>
        </div>
      </header>
      <div className="player-seat-picker__list">
        {seats.map((seat) => {
          const character = seat.actorIds[0] ? characters.entities[seat.actorIds[0]] : null;
          return (
            <ChoiceCard key={seat.id} onClick={() => onSelect(seat.id)}>
              <strong>{seat.name}</strong>
              <span>{character?.name ?? 'Персонаж не назначен'}</span>
            </ChoiceCard>
          );
        })}
      </div>
    </section>
  );
}
