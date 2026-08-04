/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { Crown, HardDrive, LogIn, UserRound } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { serverSessionAvailable, setMasterServerAuthenticated } from '../../domain/p2p/serverSession';
import { persistenceService } from '../../services/serviceRegistry';
import { Badge, Button, Dialog, ListItem, Surface, Tabs, TabButton, Toolbar } from '../components/common';
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

export interface MasterAccountState {
  status: 'loading' | 'anonymous' | 'authenticated' | 'error' | 'not-required';
  email: string;
}

type LobbyRole = 'gm' | 'player';
const LOBBY_ROLE_KEY = 'daggerheart:lobby-role';

export function SessionLobby({ inviteContext, onEnterGm, onJoinRoom, sceneImageUrl }: SessionLobbyProps) {
  const serverAvailable = serverSessionAvailable();
  const [role, setRole] = useState<LobbyRole>(() => readLobbyRole());
  const [account, setAccount] = useState<MasterAccountState>(() => ({ status: serverAvailable ? 'loading' : 'not-required', email: '' }));
  const [gamesOpen, setGamesOpen] = useState(false);
  const storedGames = useStream(persistenceService.storedGames$);
  const activeGame = storedGames.find((game) => game.active) ?? storedGames[0] ?? null;

  useEffect(() => {
    localStorage.setItem(LOBBY_ROLE_KEY, role);
  }, [role]);

  useEffect(() => {
    void persistenceService.refreshStoredGames();
  }, []);

  useEffect(() => {
    if (!serverAvailable) {
      setMasterServerAuthenticated(false);
      return;
    }
    let active = true;
    void fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error('auth_unavailable');
        return response.json();
      })
      .then((result: { authenticated?: unknown; user?: { email?: unknown } }) => {
        if (!active) return;
        const authenticated = result.authenticated === true;
        setMasterServerAuthenticated(authenticated);
        setAccount(authenticated
          ? { status: 'authenticated', email: typeof result.user?.email === 'string' ? result.user.email : '' }
          : { status: 'anonymous', email: '' });
      })
      .catch(() => {
        if (!active) return;
        setMasterServerAuthenticated(false);
        setAccount({ status: 'error', email: '' });
      });
    return () => {
      active = false;
    };
  }, [serverAvailable]);

  const signIn = () => {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
  };

  return (
    <section className="role-entry" aria-label="Выбор роли">
      <div className="role-entry__scene" aria-hidden="true" style={{ '--role-entry-scene-image': `url("${sceneImageUrl}")` }} />
      <div className="role-entry__content">
        <header className="role-entry__topbar">
          <Tabs label="Роль" layout="equal">
            <TabButton active={role === 'gm'} onClick={() => setRole('gm')}><Crown size={15} aria-hidden="true" /> Мастер</TabButton>
            <TabButton active={role === 'player'} onClick={() => setRole('player')}><UserRound size={15} aria-hidden="true" /> Игрок</TabButton>
          </Tabs>
          {serverAvailable && (
            <Toolbar className="role-entry__account">
              {account.status === 'authenticated' ? (
                <Badge tone="success">{account.email || 'Облако включено'}</Badge>
              ) : account.status !== 'loading' ? (
                <>
                  <Badge>P2P</Badge>
                  <Button variant="ghost" size="xs" iconBefore={<LogIn size={13} aria-hidden="true" />} onClick={signIn}>Войти</Button>
                </>
              ) : <Badge>Проверяем аккаунт…</Badge>}
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
            <GmLobbyCard account={account} inviteContext={inviteContext} onEnterGm={onEnterGm} />
          </div>
        ) : <div className="role-entry__player-flow"><PlayerQuickJoinCard onJoinRoom={onJoinRoom} /></div>}
      </div>
      {gamesOpen && (
        <Dialog
          aria-label="Игры"
          className="role-entry__games-dialog"
          onClose={() => setGamesOpen(false)}
        >
          <StoredGamesCard account={account} onClose={() => setGamesOpen(false)} />
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
