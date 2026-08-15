import { test } from 'vitest';
import assert from 'node:assert/strict';
import { APP_BROWSER_STORAGE_KEY, localAppStorageStore, sessionAppStorageStore } from '../../src/core/persistence/appBrowserStorage';
import {
  forgetActiveSession,
  initialInviteDraftState,
  persistActiveSession,
  persistInviteDraft,
  persistRoomCodeRefreshBlockedUntil,
  readActiveSession,
  shouldResumeActiveSession
} from '../../src/services/p2p/P2PSessionPersistence';
import { readStoredCallName, readStoredPlayerSeatId, writeStoredCallName, writeStoredPlayerSeatId } from '../../src/domain/p2p/sessionLinks';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test('local app storage migrates old P2P and preference keys into one key', () => {
  const originalWindow = globalThis.window;
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage, sessionStorage },
    configurable: true
  });

  try {
    localStorage.setItem('daggerheart-play:p2p-active-session', JSON.stringify({
      version: 1,
      role: 'gm',
      roomId: 'ROOM1',
      password: 'secret',
      participantName: 'GM',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }));
    localStorage.setItem('daggerheart-play:p2p-invite-draft', JSON.stringify({
      roomId: 'ROOM2',
      password: 'draft'
    }));
    localStorage.setItem('daggerheart-play:private-rolls', '1');

    localAppStorageStore.reload();

    assert.equal(localStorage.getItem('daggerheart-play:p2p-active-session'), null);
    assert.equal(localStorage.getItem('daggerheart-play:p2p-invite-draft'), null);
    assert.equal(localStorage.getItem('daggerheart-play:private-rolls'), null);

    const migrated = JSON.parse(localStorage.getItem(APP_BROWSER_STORAGE_KEY) ?? '{}');
    assert.equal(migrated.p2p.activeSession.roomId, 'ROOM1');
    assert.equal(migrated.p2p.inviteDraft.roomId, 'ROOM2');
    assert.equal('password' in migrated.p2p.activeSession, false);
    assert.equal('password' in migrated.p2p.inviteDraft, false);
    assert.equal(migrated.preferences.privateRolls, true);
    assert.equal(readActiveSession()?.participantName, 'GM');
    assert.equal(initialInviteDraftState().roomId, 'ROOM2');
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    localAppStorageStore.reload();
    sessionAppStorageStore.reload();
  }
});

test('session app storage migrates old cooldown and seat keys into one key', () => {
  const originalWindow = globalThis.window;
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage, sessionStorage },
    configurable: true
  });

  try {
    const blockedUntil = Date.now() + 60_000;
    sessionStorage.setItem('daggerheart-play:p2p-room-code-refresh-blocked-until', String(blockedUntil));
    sessionStorage.setItem('daggerheart-play:p2p-seat:ROOM1', 'seat-1');

    sessionAppStorageStore.reload();

    assert.equal(sessionStorage.getItem('daggerheart-play:p2p-room-code-refresh-blocked-until'), null);
    assert.equal(sessionStorage.getItem('daggerheart-play:p2p-seat:ROOM1'), null);

    const migrated = JSON.parse(sessionStorage.getItem(APP_BROWSER_STORAGE_KEY) ?? '{}');
    assert.equal(migrated.p2p.roomCodeRefreshBlockedUntil, blockedUntil);
    assert.equal(migrated.p2p.seats.ROOM1, 'seat-1');
    assert.equal(initialInviteDraftState().roomCodeRefreshBlockedUntil, blockedUntil);
    assert.equal(readStoredPlayerSeatId('ROOM1'), 'seat-1');
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    localAppStorageStore.reload();
    sessionAppStorageStore.reload();
  }
});

test('P2P helpers write only through the single app storage key', () => {
  const originalWindow = globalThis.window;
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage, sessionStorage },
    configurable: true
  });

  try {
    persistActiveSession({
      role: 'player',
      roomId: 'ROOM3',
      participantName: 'Player',
      participantId: 'seat-player',
      actorIds: ['hero-player']
    });
    persistInviteDraft({ roomId: 'ROOM4' });
    persistRoomCodeRefreshBlockedUntil(Date.now() + 60_000);
    writeStoredPlayerSeatId('ROOM3', 'seat-3');
    writeStoredCallName('ROOM3', 'Caller 3');

    assert.equal(localStorage.length, 1);
    assert.equal(sessionStorage.length, 1);
    assert.equal(localStorage.key(0), APP_BROWSER_STORAGE_KEY);
    assert.equal(sessionStorage.key(0), APP_BROWSER_STORAGE_KEY);

    assert.equal(readActiveSession()?.roomId, 'ROOM3');
    assert.equal(readActiveSession()?.participantId, 'seat-player');
    assert.deepEqual(readActiveSession()?.actorIds, ['hero-player']);
    assert.equal(shouldResumeActiveSession('player'), true);
    assert.equal(shouldResumeActiveSession('gm'), false);
    assert.equal(initialInviteDraftState().roomId, 'ROOM4');
    assert.equal(readStoredPlayerSeatId('ROOM3'), 'seat-3');
    assert.equal(readStoredCallName('ROOM3'), 'Caller 3');

    forgetActiveSession();
    assert.equal(readActiveSession(), null);
    assert.equal(shouldResumeActiveSession('player'), false);
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    localAppStorageStore.reload();
    sessionAppStorageStore.reload();
  }
});
