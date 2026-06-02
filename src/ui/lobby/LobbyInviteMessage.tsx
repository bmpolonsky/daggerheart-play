/** @jsxImportSource preact */
import { useStore } from '../../core/hooks/useStore';
import { p2pSessionService } from '../../services/serviceRegistry';

export function LobbyInviteMessage() {
  const { message } = useStore(p2pSessionService.inviteStore);
  return message ? <p className="role-entry__message">{message}</p> : null;
}
