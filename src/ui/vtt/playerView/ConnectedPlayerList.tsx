/** @jsxImportSource preact */
import { CameraOff, Hand, MicOff, Phone } from 'lucide-react';
import { useEffect } from 'preact/hooks';
import type { ConnectedPlayerRow } from './types';
import { Badge, IconButton, ListItem } from '../../components/common';

export function ConnectedPlayerList({ players, focusRaisedRequestId, onClearActivationRequest }: {
  players: ConnectedPlayerRow[];
  focusRaisedRequestId: number;
  onClearActivationRequest?: (request: NonNullable<ConnectedPlayerRow['activationRequest']>) => void;
}) {
  useEffect(() => {
    if (focusRaisedRequestId <= 0) return;
    const target = document.querySelector<HTMLElement>('[data-focused-player="true"]');
    target?.scrollIntoView({ block: 'nearest' });
    target?.focus({ preventScroll: true });
  }, [focusRaisedRequestId]);

  if (players.length === 0) return <p className="player-participant-group__empty">Никто не подключён.</p>;
  return (
    <div className="player-people-list">
      {players.map((player) => (
        <div
          key={player.id}
          className="player-people-row-focus"
          data-focused-player={player.activationRequest ? 'true' : undefined}
          tabIndex={-1}
        >
          <ListItem
            className="player-people-row"
            title={player.playerName}
            subtitle={player.characterName || 'Персонаж не назначен'}
            leftAccessory={<i className="player-roster__presence dh-is-online" aria-label="Подключён" />}
            rightAccessory={(
              <div className="player-people-row__state">
                {player.inCall && <Phone size={13} aria-label="В звонке" />}
                {player.inCall && player.micMuted && <MicOff size={13} aria-label="Микрофон выключен" />}
                {player.inCall && player.cameraOff && <CameraOff size={13} aria-label="Камера выключена" />}
                {player.activationRequest && (
                  <>
                    <Badge tone="gold" size="xs">Рука</Badge>
                    <IconButton
                      size="xs"
                      variant="primary"
                      title={`Дать активацию ${player.playerName}`}
                      aria-label={`Дать активацию ${player.playerName}`}
                      onClick={() => player.activationRequest && onClearActivationRequest?.(player.activationRequest)}
                    >
                      <Hand size={13} aria-hidden="true" />
                    </IconButton>
                  </>
                )}
              </div>
            )}
          />
        </div>
      ))}
    </div>
  );
}
