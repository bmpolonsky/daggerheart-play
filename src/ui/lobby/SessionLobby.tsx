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
  onOpenCall: (roomId: string) => void;
}

export function SessionLobby({ inviteContext, onEnterGm, onJoinRoom, onOpenCall, sceneImageUrl }: SessionLobbyProps) {
  return (
    <section className="role-entry" aria-label="Выбор роли">
      <div className="role-entry__scene" aria-hidden="true" style={{ '--role-entry-scene-image': `url("${sceneImageUrl}")` }} />
      <div className="role-entry__content">
        <div className="role-entry__lobby-shell">
          <div className="role-entry__primary-flow">
            <GmLobbyCard inviteContext={inviteContext} onEnterGm={onEnterGm} onOpenCall={onOpenCall} />
          </div>
          <div className="role-entry__side-flow">
            <PlayerQuickJoinCard onJoinRoom={onJoinRoom} />
            <StoredGamesCard />
          </div>
        </div>
      </div>
    </section>
  );
}
