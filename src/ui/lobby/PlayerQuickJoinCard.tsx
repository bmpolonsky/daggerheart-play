/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { MonitorPlay } from 'lucide-react';
import { normalizeSessionRoomId } from '../../domain/p2p/sessionLinks';
import { p2pSessionService } from '../../services/serviceRegistry';
import { Button } from '../components/common/Button';
import { TextControl } from '../components/common/Field';
import { Surface } from '../components/common/Surface';

interface PlayerQuickJoinCardProps {
  onJoinRoom: (roomId: string) => void;
}

export function PlayerQuickJoinCard({ onJoinRoom }: PlayerQuickJoinCardProps) {
  const [joinRoomId, setJoinRoomId] = useState('');

  const joinPlayer = () => {
    const normalized = normalizeSessionRoomId(joinRoomId, '');
    if (!normalized) {
      p2pSessionService.setInviteMessage('Введите код комнаты.');
      return;
    }
    onJoinRoom(normalized);
  };

  return (
    <Surface className="role-entry__card role-entry__join-card" aria-label="Присоединиться игроком">
      <header>
        <MonitorPlay size={20} />
        <div>
          <strong>Игрок</strong>
          <span>Быстрый вход в комнату.</span>
        </div>
      </header>
      <label>
        <span>Код комнаты</span>
        <TextControl value={joinRoomId} onInput={(event) => setJoinRoomId(event.currentTarget.value)} placeholder="Например 7K2Q" />
      </label>
      <Button fullWidth variant="primary" type="button" onClick={joinPlayer}>
        Присоединиться
      </Button>
    </Surface>
  );
}
