/** @jsxImportSource preact */
import { parsePlayerSessionLocation } from '../../domain/p2p/sessionLinks';
import { publicAssetUrl } from '../../domain/content/publicAssets';
import { DEFAULT_LOBBY_SCENE_IMAGE } from '../../domain/tabletop/defaultArt';
import { PlayerJoinLobby } from './PlayerJoinLobby';
import { SessionLobby } from './SessionLobby';

type RoleRouteId = 'entry' | 'gm' | 'join' | 'player' | 'call' | 'combat' | 'cards';

interface RoleEntryProps {
  basePath: string;
  onSelectRole: (route: RoleRouteId, hash?: string, search?: string, roomId?: string) => void;
}

export function RoleEntry({ basePath, onSelectRole }: RoleEntryProps) {
  const sessionParams = typeof window === 'undefined'
    ? null
    : parsePlayerSessionLocation(window.location.pathname, basePath);
  const sceneImageUrl = publicAssetUrl(DEFAULT_LOBBY_SCENE_IMAGE, basePath);

  if (sessionParams) {
    return (
      <PlayerJoinLobby
        roomId={sessionParams.roomId}
        sceneImageUrl={sceneImageUrl}
        onBackToLobby={() => onSelectRole('entry')}
        onEnterPlayerRoom={(roomId) => onSelectRole('player', '', '', roomId)}
      />
    );
  }

  return (
    <SessionLobby
      inviteContext={lobbyInviteContext(basePath)}
      sceneImageUrl={sceneImageUrl}
      onEnterGm={() => onSelectRole('gm')}
      onJoinRoom={(roomId) => onSelectRole('join', '', '', roomId)}
    />
  );
}

function lobbyInviteContext(basePath: string) {
  if (typeof window === 'undefined') {
    return { origin: 'http://localhost', basePath };
  }
  return {
    origin: window.location.origin,
    basePath
  };
}
