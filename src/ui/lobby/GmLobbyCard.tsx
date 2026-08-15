/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { Crown, Trash2 } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { characterService, sceneTableService } from '../../services/serviceRegistry';
import { Button, EmptyState, IconButton, SectionHeader, SelectControl, Surface, TextControl, Toolbar } from '../components/common';

interface GmLobbyCardProps {
  onEnterGm: () => void;
}

export function GmLobbyCard({ onEnterGm }: GmLobbyCardProps) {
  const { entities: characterEntities, order: characterOrder } = useStream(characterService.characters$);
  const { participants } = useStream(sceneTableService.sceneTable$);
  const [opening, setOpening] = useState(false);
  const characterOptions = characterOrder.map((id) => characterEntities[id]).filter(Boolean);
  const playerSeats = Object.values(participants).filter((participant) => participant.role === 'player');

  const enterGm = async () => {
    if (opening) return;
    setOpening(true);
    try {
      onEnterGm();
    } finally {
      setOpening(false);
    }
  };

  return (
    <Surface className="role-entry__card role-entry__gm-card" aria-label="Рабочее пространство мастера">
      <SectionHeader title="Подготовка игры" actions={<Crown size={20} aria-hidden="true" />} />
      <div className="role-entry__players">
        <SectionHeader
          title="Игроки"
          actions={
          <Button size="sm" type="button" onClick={() => sceneTableService.createPlayerSeat({ name: `Игрок ${playerSeats.length + 1}`, characterId: characterOptions[playerSeats.length]?.id })}>
            Добавить
          </Button>
          }
        />
        {playerSeats.map((seat) => (
          <article className="role-entry__player-row" key={seat.id}>
            <TextControl
              aria-label="Имя игрока"
              value={seat.name}
              onInput={(event) => sceneTableService.updatePlayerSeat(seat.id, { name: event.currentTarget.value })}
            />
            <SelectControl
              aria-label="Персонаж игрока"
              value={seat.actorIds[0] ?? ''}
              onChange={(event) => sceneTableService.updatePlayerSeat(seat.id, { characterId: event.currentTarget.value || null })}
            >
              <option value="">Не назначен</option>
              {characterOptions.map((character) => (
                <option key={character.id} value={character.id}>{character.name}</option>
              ))}
            </SelectControl>
            <IconButton variant="ghost" size="sm" type="button" title="Удалить игрока" aria-label={`Удалить игрока ${seat.name}`} onClick={() => sceneTableService.removePlayerSeat(seat.id)}>
              <Trash2 size={15} aria-hidden="true" />
            </IconButton>
          </article>
        ))}
        {playerSeats.length === 0 && <EmptyState size="sm" title="Добавьте игроков" />}
      </div>
      <Toolbar className="role-entry__inline-actions">
        <Button variant="primary" type="button" disabled={opening} onClick={() => void enterGm()}>
          {opening ? 'Открываем...' : 'Открыть игру'}
        </Button>
      </Toolbar>
    </Surface>
  );
}
