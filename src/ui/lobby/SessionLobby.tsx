/** @jsxImportSource preact */
import { GmLobbyCard } from './GmLobbyCard';
import { PlayerQuickJoinCard } from './PlayerQuickJoinCard';
import { StoredGamesCard } from './StoredGamesCard';

export interface LobbyInviteContext {
  origin: string;
  basePath?: string;
}

interface SessionLobbyProps {
  inviteContext: LobbyInviteContext;
  sceneImageUrl: string;
  onEnterGm: () => void;
  onJoinRoom: (roomId: string) => void;
}

export function SessionLobby({ inviteContext, onEnterGm, onJoinRoom, sceneImageUrl }: SessionLobbyProps) {
  return (
    <section className="role-entry" aria-label="Выбор роли">
      <div className="role-entry__scene" aria-hidden="true" style={{ '--role-entry-scene-image': `url("${sceneImageUrl}")` }} />
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
      </div>
    </section>
  );
}
