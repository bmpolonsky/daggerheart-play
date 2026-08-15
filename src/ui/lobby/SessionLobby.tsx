/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { Crown, HardDrive, UserRound } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { persistenceService } from '../../services/serviceRegistry';
import { readSupabaseSessionConfig } from '../../domain/p2p/supabaseSession';
import { MasterAccountControl } from '../auth/MasterSignInDialog';
import { Button, Dialog, ListItem, Surface, Tabs, TabButton, Toolbar } from '../components/common';
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

type LobbyRole = 'gm' | 'player';
const LOBBY_ROLE_KEY = 'daggerheart:lobby-role';

export function SessionLobby({ inviteContext, onEnterGm, onJoinRoom, sceneImageUrl }: SessionLobbyProps) {
  const supabaseConfig = readSupabaseSessionConfig();
  const [role, setRole] = useState<LobbyRole>(() => readLobbyRole());
  const [gamesOpen, setGamesOpen] = useState(false);
  const storedGames = useStream(persistenceService.storedGames$);
  const activeGame = storedGames.find((game) => game.active) ?? storedGames[0] ?? null;

  const selectRole = (nextRole: LobbyRole) => {
    localStorage.setItem(LOBBY_ROLE_KEY, nextRole);
    setRole(nextRole);
  };

  useEffect(() => {
    void persistenceService.refreshStoredGames();
  }, []);

  return (
    <section className="role-entry" aria-label="Выбор роли">
      <div className="role-entry__scene" aria-hidden="true" style={{ '--role-entry-scene-image': `url("${sceneImageUrl}")` }} />
      <div className="role-entry__content">
        <header className="role-entry__topbar">
          <Tabs label="Роль" layout="equal">
            <TabButton active={role === 'gm'} onClick={() => selectRole('gm')}><Crown size={15} aria-hidden="true" /> Мастер</TabButton>
            <TabButton active={role === 'player'} onClick={() => selectRole('player')}><UserRound size={15} aria-hidden="true" /> Игрок</TabButton>
          </Tabs>
          {role === 'gm' && supabaseConfig && (
            <Toolbar className="role-entry__account">
              <MasterAccountControl config={supabaseConfig} />
            </Toolbar>
          )}
        </header>
        {role === 'gm' ? (
          <div className="role-entry__master-flow">
            <Surface className="role-entry__current-game" aria-label="Текущая игра">
              <ListItem
                density="compact"
                lines={2}
                leftAccessory={<HardDrive size={17} aria-hidden="true" />}
                title={activeGame?.name || 'Без названия'}
                subtitle={activeGame ? 'Текущая игра · на устройстве' : 'Выберите или создайте игру'}
                rightAccessory={<Button size="xs" variant="ghost" onClick={() => setGamesOpen(true)}>Сменить</Button>}
              />
            </Surface>
            <GmLobbyCard onEnterGm={onEnterGm} />
          </div>
        ) : <div className="role-entry__player-flow"><PlayerQuickJoinCard onJoinRoom={onJoinRoom} /></div>}
      </div>
      {gamesOpen && (
        <Dialog
          aria-label="Игры"
          className="role-entry__games-dialog"
          onClose={() => setGamesOpen(false)}
        >
          <StoredGamesCard onClose={() => setGamesOpen(false)} />
        </Dialog>
      )}
    </section>
  );
}

function readLobbyRole(): LobbyRole {
  try {
    return localStorage.getItem(LOBBY_ROLE_KEY) === 'player' ? 'player' : 'gm';
  } catch {
    return 'gm';
  }
}
