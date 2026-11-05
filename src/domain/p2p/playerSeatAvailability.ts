import type { P2PSessionState } from '../../services/P2PSessionService';
import type { TableParticipant } from '../tabletop/types';

/** A completed snapshot belongs to one player session, not every room visited by the tab. */
export function playerSeatAvailability(
  session: Pick<P2PSessionState, 'roomId' | 'role' | 'lastSnapshotAt'>,
  roomId: string,
  participants: Record<string, TableParticipant>
) {
  const hasSnapshot = session.role === 'player' && session.roomId === roomId && Boolean(session.lastSnapshotAt);
  const seats = hasSnapshot ? Object.values(participants).filter(participant => participant.role === 'player') : [];
  return { hasSnapshot, seats };
}
