/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import { p2pSessionService } from '../../../services/serviceRegistry';
import type { TableViewRole } from './types';

const INITIAL_SNAPSHOT_OVERLAY_TIMEOUT_MS = 5000;

export function PlayerConnectionStatus({
  hasCharacter,
  hasSelectedPlayerSeat,
  hasSessionRoom,
  role
}: {
  hasCharacter: boolean;
  hasSelectedPlayerSeat: boolean;
  hasSessionRoom: boolean;
  role: TableViewRole;
}) {
  const p2pSession = useStream(p2pSessionService.session$);
  const hasMasterPeer = p2pSession.role === 'player' && p2pSession.peers.length > 0;
  const waitingForInitialSnapshot = role === 'player' && hasSessionRoom && hasSelectedPlayerSeat && hasMasterPeer && !p2pSession.lastSnapshotAt;
  const [initialSnapshotWaitExpired, setInitialSnapshotWaitExpired] = useState(false);

  useEffect(() => {
    setInitialSnapshotWaitExpired(false);
    if (!waitingForInitialSnapshot) return;
    const timeoutId = window.setTimeout(() => setInitialSnapshotWaitExpired(true), INITIAL_SNAPSHOT_OVERLAY_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [waitingForInitialSnapshot]);

  const showConnectionOverlay = role === 'player' && hasSessionRoom && (
    (waitingForInitialSnapshot && !initialSnapshotWaitExpired) ||
    hasCharacter && (
    !p2pSession.connected ||
    p2pSession.status === 'connecting' ||
    p2pSession.status === 'degraded' ||
    p2pSession.status === 'error'
    )
  );
  const title = p2pSession.status === 'error'
    ? 'Связь с сервером мастера потеряна'
    : waitingForInitialSnapshot
      ? 'Ждем данные от мастера'
      : 'Подключаемся к серверу мастера';
  const message = waitingForInitialSnapshot
    ? 'Сцена и персонаж появятся после синхронизации.'
    : p2pSession.message;

  return (
    <>
      {showConnectionOverlay && (
        <section className="player-connection-overlay" role="status" aria-live="polite">
          <div className="player-connection-overlay__spinner" aria-hidden="true" />
          <strong>{title}</strong>
          <span>{message}</span>
        </section>
      )}
    </>
  );
}
