import { runMigrationSteps } from '../../../../domain/migrations/migration-runner';
import type { AppLocalStorageState, AppSessionStorageState } from '../../appBrowserStorage';
import type { BrowserStorageLoadContext, BrowserStorageLoadResult } from '../../browserStorageStore';
import { v0ToV1CleanupLocalKeysMigration } from './local/v0-to-v1-cleanup-local-keys-migration';
import { v0ToV1ActiveSessionMigration } from './local/v0-to-v1-active-session-migration';
import { v0ToV1InviteDraftMigration } from './local/v0-to-v1-invite-draft-migration';
import { v0ToV1PrivateRollsMigration } from './local/v0-to-v1-private-rolls-migration';
import { v0ToV1CleanupSessionKeysMigration } from './session/v0-to-v1-cleanup-session-keys-migration';
import { v0ToV1PlayerSeatsMigration } from './session/v0-to-v1-player-seats-migration';
import { v0ToV1RoomCodeRefreshBlockMigration } from './session/v0-to-v1-room-code-refresh-block-migration';
import { isRecord, isStringRecord, toStoredP2PInviteDraft, toStoredP2PSession } from './shared';
import type { LocalStorageMigrationContext, SessionStorageMigrationContext } from './types';

const APP_BROWSER_STORAGE_VERSION = 1;

const localStorageMigrationSteps = [
  v0ToV1ActiveSessionMigration,
  v0ToV1InviteDraftMigration,
  v0ToV1PrivateRollsMigration,
  v0ToV1CleanupLocalKeysMigration
];

const sessionStorageMigrationSteps = [
  v0ToV1RoomCodeRefreshBlockMigration,
  v0ToV1PlayerSeatsMigration,
  v0ToV1CleanupSessionKeysMigration
];

export function prepareLocalStorageState(context: BrowserStorageLoadContext<AppLocalStorageState>): BrowserStorageLoadResult<AppLocalStorageState> {
  const state = parseLocalStorageState(context.value) ?? context.initialState;
  const migrated = migrateV0ToV1LocalStorage(context.storage, state);
  return { state: migrated.state, shouldPersist: migrated.migrated };
}

export function prepareSessionStorageState(context: BrowserStorageLoadContext<AppSessionStorageState>): BrowserStorageLoadResult<AppSessionStorageState> {
  const state = parseSessionStorageState(context.value) ?? context.initialState;
  const migrated = migrateV0ToV1SessionStorage(context.storage, state);
  return { state: migrated.state, shouldPersist: migrated.migrated };
}

function migrateV0ToV1LocalStorage(storage: Storage, state: AppLocalStorageState): { state: AppLocalStorageState; migrated: boolean } {
  const migrated = runMigrationSteps<LocalStorageMigrationContext>({ storage, state, migrated: false }, localStorageMigrationSteps);
  return { state: migrated.state, migrated: migrated.migrated };
}

function migrateV0ToV1SessionStorage(storage: Storage, state: AppSessionStorageState): { state: AppSessionStorageState; migrated: boolean } {
  const migrated = runMigrationSteps<SessionStorageMigrationContext>({ storage, state, migrated: false }, sessionStorageMigrationSteps);
  return { state: migrated.state, migrated: migrated.migrated };
}

function parseLocalStorageState(value: unknown): AppLocalStorageState | null {
  if (!isRecord(value) || value.version !== APP_BROWSER_STORAGE_VERSION) {
    return null;
  }
  const p2p = isRecord(value.p2p) ? value.p2p : undefined;
  const preferences = isRecord(value.preferences) ? value.preferences : undefined;
  return {
    version: APP_BROWSER_STORAGE_VERSION,
    p2p: p2p ? {
      activeSession: toStoredP2PSession(p2p.activeSession) ?? (p2p.activeSession === null ? null : undefined),
      inviteDraft: toStoredP2PInviteDraft(p2p.inviteDraft) ?? (p2p.inviteDraft === null ? null : undefined),
      callNames: isStringRecord(p2p.callNames) ? p2p.callNames : undefined,
      connectionMode: p2p.connectionMode === 'p2p' || p2p.connectionMode === 'server' ? p2p.connectionMode : undefined
    } : undefined,
    preferences: preferences ? {
      privateRolls: typeof preferences.privateRolls === 'boolean' ? preferences.privateRolls : undefined
    } : undefined
  };
}

function parseSessionStorageState(value: unknown): AppSessionStorageState | null {
  if (!isRecord(value) || value.version !== APP_BROWSER_STORAGE_VERSION) {
    return null;
  }
  const p2p = isRecord(value.p2p) ? value.p2p : undefined;
  return {
    version: APP_BROWSER_STORAGE_VERSION,
    p2p: p2p ? {
      resumeRoomId: typeof p2p.resumeRoomId === 'string' ? p2p.resumeRoomId : undefined,
      roomCodeRefreshBlockedUntil: typeof p2p.roomCodeRefreshBlockedUntil === 'number' ? p2p.roomCodeRefreshBlockedUntil : undefined,
      seats: isStringRecord(p2p.seats) ? p2p.seats : undefined
    } : undefined
  };
}
