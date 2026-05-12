import type { P2PSessionState } from '../../../../services/P2PSessionService';

export function gmPlayerSessionText(session: P2PSessionState): string {
  if (session.status === 'error') return 'Не удалось открыть комнату';
  if (session.status === 'connecting') return 'Открываем комнату';
  if (!session.connected) return 'Комната не открыта';
  if (session.peers.length > 0) return `Игроков онлайн: ${session.peers.length}`;
  return session.roomId ? `Комната ${session.roomId} · ждем игроков` : 'Ждем игроков';
}
