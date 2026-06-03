/** @jsxImportSource preact */
import { useStream } from '../../core/hooks/useStream';
import { p2pSessionService } from '../../services/serviceRegistry';

export function LobbyInviteMessage() {
  const { message } = useStream(p2pSessionService.invite$);
  return message ? <p className="role-entry__message">{message}</p> : null;
}
