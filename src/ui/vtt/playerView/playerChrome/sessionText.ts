import type { P2PSessionState } from '../../../../services/P2PSessionService';

export function gmPlayerSessionText(session: P2PSessionState): string {
  if (session.status === 'error') return 'Не удалось запустить сетевую игру';
  if (session.status === 'connecting') return 'Запускаем сетевую игру';
  if (!session.connected) return 'Сетевая игра не запущена';
  if (session.peers.length > 0) return `Игроков онлайн: ${session.peers.length}`;
  return session.roomId ? `Код ${session.roomId} — ждём игроков` : 'Ждём игроков';
}
