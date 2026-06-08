import { BrowserStorageStore } from './browserStorageStore';
import {
  prepareLocalStorageState,
  prepareSessionStorageState
} from './migrations/appBrowserStorage';

export const APP_BROWSER_STORAGE_KEY = 'daggerheart-play';
export const APP_BROWSER_STORAGE_VERSION = 1;
export const STORED_P2P_SESSION_VERSION = 1;

export interface StoredP2PSession {
  version: typeof STORED_P2P_SESSION_VERSION;
  role: 'gm' | 'player';
  roomId: string;
  participantName: string;
  updatedAt: string;
}

export interface StoredP2PInviteDraft {
  roomId: string;
}

export interface AppLocalStorageState {
  version: typeof APP_BROWSER_STORAGE_VERSION;
  p2p?: {
    activeSession?: StoredP2PSession | null;
    inviteDraft?: StoredP2PInviteDraft | null;
    callNames?: Record<string, string>;
  };
  preferences?: {
    privateRolls?: boolean;
  };
}

export interface AppSessionStorageState {
  version: typeof APP_BROWSER_STORAGE_VERSION;
  p2p?: {
    roomCodeRefreshBlockedUntil?: number;
    seats?: Record<string, string>;
  };
}

export const localAppStorageStore = new BrowserStorageStore<AppLocalStorageState>({
  key: APP_BROWSER_STORAGE_KEY,
  storage: () => browserStorage('localStorage'),
  initialState: emptyLocalStorageState,
  prepareLoadedState: prepareLocalStorageState
});

export const sessionAppStorageStore = new BrowserStorageStore<AppSessionStorageState>({
  key: APP_BROWSER_STORAGE_KEY,
  storage: () => browserStorage('sessionStorage'),
  initialState: emptySessionStorageState,
  prepareLoadedState: prepareSessionStorageState
});

function emptyLocalStorageState(): AppLocalStorageState {
  return { version: APP_BROWSER_STORAGE_VERSION };
}

function emptySessionStorageState(): AppSessionStorageState {
  return { version: APP_BROWSER_STORAGE_VERSION };
}

function browserStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window[kind] ?? null;
  } catch {
    return null;
  }
}
