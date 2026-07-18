/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { MonitorPlay } from 'lucide-react';
import { normalizeSessionRoomId } from '../../domain/p2p/sessionLinks';
import { toastService } from '../../services/ToastService';
import { Button, SectionHeader, Surface, TextControl } from '../components/common';

interface PlayerQuickJoinCardProps {
  onJoinRoom: (roomId: string) => void;
}

export function PlayerQuickJoinCard({ onJoinRoom }: PlayerQuickJoinCardProps) {
  const [joinRoomId, setJoinRoomId] = useState('');

  const normalizedRoomId = (): string => {
    const normalized = normalizeSessionRoomId(joinRoomId, '');
    if (!normalized) {
      toastService.show('Введите код комнаты.', 'warning');
      return '';
    }
    return normalized;
  };

  const joinPlayer = () => {
    const normalized = normalizedRoomId();
    if (normalized) onJoinRoom(normalized);
  };

  return (
    <Surface className="role-entry__card role-entry__join-card" aria-label="Присоединиться игроком">
      <SectionHeader title="Игрок" actions={<MonitorPlay size={20} aria-hidden="true" />} />
      <label>
        <span>Код комнаты</span>
        <TextControl value={joinRoomId} onInput={(event) => setJoinRoomId(event.currentTarget.value)} placeholder="Например 7K2Q" />
      </label>
      <Button fullWidth variant="primary" type="button" onClick={joinPlayer}>
        В игру
      </Button>
    </Surface>
  );
}
