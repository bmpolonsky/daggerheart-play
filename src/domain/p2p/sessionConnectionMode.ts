import { localAppStorageStore } from '../../core/persistence/appBrowserStorage';
import { Store } from '../../core/store/Store';
import { serverSessionAvailable, type SessionConnectionMode } from './serverSession';

const storedMode = localAppStorageStore.getState().p2p?.connectionMode;
const initialMode: SessionConnectionMode = storedMode === 'p2p' || storedMode === 'server'
  ? storedMode
  : serverSessionAvailable() ? 'server' : 'p2p';
const connectionModeStore = new Store<SessionConnectionMode>(initialMode);

export const sessionConnectionMode$ = connectionModeStore.toStream();

export function readSessionConnectionMode(): SessionConnectionMode {
  const mode = connectionModeStore.get();
  return mode === 'server' && !serverSessionAvailable() ? 'p2p' : mode;
}

export function writeSessionConnectionMode(mode: SessionConnectionMode): SessionConnectionMode {
  const next = mode === 'server' && !serverSessionAvailable() ? 'p2p' : mode;
  connectionModeStore.set(next);
  localAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      connectionMode: next
    }
  }));
  return next;
}
