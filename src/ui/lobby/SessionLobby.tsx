/** @jsxImportSource preact */
import { GmLobbyCard } from './GmLobbyCard';
import { LobbyInviteMessage } from './LobbyInviteMessage';
import { PlayerQuickJoinCard } from './PlayerQuickJoinCard';
import { StoredGamesCard } from './StoredGamesCard';

export interface LobbyInviteContext {
  origin: string;
  basePath?: string;
}

interface SessionLobbyProps {
  inviteContext: LobbyInviteContext;
  onEnterGm: () => void;
  onJoinRoom: (roomId: string) => void;
}

export function SessionLobby({ inviteContext, onEnterGm, onJoinRoom }: SessionLobbyProps) {
  return (
    <section className="role-entry" aria-label="Выбор роли">
      <div className="role-entry__scene" aria-hidden="true" />
      <div className="role-entry__content">
        <div className="role-entry__title">
          <div>
            <h1>Лобби игры</h1>
          </div>
        </div>
        <div className="role-entry__lobby-shell">
          <div className="role-entry__actions role-entry__actions--lobby">
            <GmLobbyCard inviteContext={inviteContext} onEnterGm={onEnterGm} />
            <PlayerQuickJoinCard onJoinRoom={onJoinRoom} />
          </div>
          <StoredGamesCard />
        </div>
        <LobbyInviteMessage />
      </div>
    </section>
  );
}
