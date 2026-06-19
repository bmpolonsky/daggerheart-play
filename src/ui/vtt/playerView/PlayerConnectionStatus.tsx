/** @jsxImportSource preact */
import { useStream } from '../../../core/hooks/useStream';
import { p2pSessionService } from '../../../services/serviceRegistry';
import type { TableViewRole } from './types';

export function PlayerConnectionStatus({ hasCharacter, hasSessionRoom, role }: { hasCharacter: boolean; hasSessionRoom: boolean; role: TableViewRole }) {
  const p2pSession = useStream(p2pSessionService.session$);
  const showConnectionOverlay = role === 'player' && hasSessionRoom && hasCharacter && (
    !p2pSession.connected ||
    p2pSession.status === 'connecting' ||
    p2pSession.status === 'degraded' ||
    p2pSession.status === 'error' ||
    !p2pSession.lastSnapshotAt
  );

  return (
    <>
      {showConnectionOverlay && (
        <section className="player-connection-overlay" role="status" aria-live="polite">
          <div className="player-connection-overlay__spinner" aria-hidden="true" />
          <strong>{p2pSession.status === 'error' ? 'Связь с сервером мастера потеряна' : 'Подключаемся к серверу мастера'}</strong>
          <span>{p2pSession.message}</span>
        </section>
      )}
    </>
  );
}
