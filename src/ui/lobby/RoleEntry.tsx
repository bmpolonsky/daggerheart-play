/** @jsxImportSource preact */
import { parsePlayerSessionLocation } from '../../domain/p2p/sessionLinks';
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

  if (sessionParams) {
    return (
      <PlayerJoinLobby
        roomId={sessionParams.roomId}
        password={sessionParams.password}
        onBackToLobby={() => onSelectRole('entry')}
        onEnterPlayerRoom={(roomId) => onSelectRole('player', '', '', roomId)}
      />
    );
  }

  return (
    <SessionLobby
      inviteContext={lobbyInviteContext(basePath)}
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
