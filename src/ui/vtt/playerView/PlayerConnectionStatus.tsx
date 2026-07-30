/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import {
  tableConnectionPresentation,
  type SessionIdentity,
  type TableSessionContext
} from '../../../domain/p2p/sessionPresentation';
import { p2pSessionService } from '../../../services/serviceRegistry';

const INITIAL_SNAPSHOT_OVERLAY_TIMEOUT_MS = 5000;

export function PlayerConnectionStatus({
  context,
  hasCharacter,
  selectedParticipantId,
  storedSession
}: {
  context: TableSessionContext;
  hasCharacter: boolean;
  selectedParticipantId: string | null;
  storedSession: SessionIdentity | null;
}) {
  const p2pSession = useStream(p2pSessionService.session$);
  const [initialSnapshotWaitExpired, setInitialSnapshotWaitExpired] = useState(false);
  const presentation = tableConnectionPresentation({
    context,
    liveSession: p2pSession,
    storedSession,
    selectedParticipantId,
    hasCharacter,
    initialWaitDelayed: initialSnapshotWaitExpired
  });
  const waitingForInitialSnapshot = presentation.phase === 'restoring';

  useEffect(() => {
    setInitialSnapshotWaitExpired(false);
    if (!waitingForInitialSnapshot) return;
    const timeoutId = window.setTimeout(() => setInitialSnapshotWaitExpired(true), INITIAL_SNAPSHOT_OVERLAY_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [waitingForInitialSnapshot]);

  return (
    <>
      {presentation.phase !== 'hidden' && (
        <section className="player-connection-overlay" role="status" aria-live="polite">
          <div className="player-connection-overlay__spinner" aria-hidden="true" />
          <strong>{presentation.title}</strong>
          <span>{presentation.message}</span>
        </section>
      )}
    </>
  );
}
