import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';

type Internals = {
  sessionStore: { get(): P2PSessionState; set(value: P2PSessionState): void };
  activeRoomConnection: any;
  startPlayerProductRecoveryPolling(): void;
  startGmActivityGuard(): void;
  handlePlayerResume(): void;
  handleGmVisibilityChange(): void;
  republishPendingPlayerCharacterUpdates(): Promise<void>;
  recoverCanonicalCharacterConfirmation(): void;
  requestSessionCapabilities(): void;
  requestSnapshotFromGm(reason: string): Promise<void>;
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

function setup(role: 'player' | 'gm' = 'player') {
  const restoreWindow = installTimerWindow();
  const previousDocument = globalThis.document;
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  const fakeDocument = Object.assign(documentEvents, { visibilityState: 'visible' });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
  Object.assign(window, { addEventListener: windowEvents.addEventListener.bind(windowEvents), removeEventListener: windowEvents.removeEventListener.bind(windowEvents) });
  const session = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }));
  const internals = session as unknown as Internals;
  internals.sessionStore.set({ ...internals.sessionStore.get(), connected: true, status: 'connected', role, roomId: 'FOREGROUND', peerId: 'same-peer' });
  const calls: string[] = [];
  const refresh = deferred();
  const connection = { refresh: () => { calls.push('refresh'); return refresh.promise; }, gmPeerId: () => 'gm-peer' };
  internals.activeRoomConnection = connection;
  internals.republishPendingPlayerCharacterUpdates = async () => { calls.push('pending'); };
  internals.recoverCanonicalCharacterConfirmation = () => { calls.push('canonical'); };
  internals.requestSessionCapabilities = () => { calls.push('capabilities'); };
  internals.requestSnapshotFromGm = async () => { calls.push('snapshot-request'); };
  session.publishSnapshot = async () => { calls.push('snapshot-publish'); return true; };
  const cleanup = async () => { await session.stop({ forgetSession: false }); Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument }); restoreWindow(); };
  return { session, internals, calls, refresh, connection, fakeDocument, documentEvents, windowEvents, cleanup };
}

test('visible/online/pageshow resume coalesces one heartbeat refresh before requesting canonical state', async () => {
  const fixture = setup();
  try {
    fixture.internals.startPlayerProductRecoveryPolling();
    fixture.documentEvents.dispatchEvent(new Event('visibilitychange'));
    fixture.windowEvents.dispatchEvent(new Event('online'));
    fixture.windowEvents.dispatchEvent(new Event('pageshow'));
    assert.deepEqual(fixture.calls, ['refresh']);
    fixture.refresh.resolve(); await flush();
    assert.deepEqual(fixture.calls, ['refresh', 'pending', 'canonical', 'capabilities', 'snapshot-request']);
    assert.equal(fixture.internals.activeRoomConnection, fixture.connection);
  } finally { await fixture.cleanup(); }
});

test('hidden player does not refresh or publish', async () => {
  const fixture = setup();
  try {
    fixture.fakeDocument.visibilityState = 'hidden';
    fixture.internals.handlePlayerResume();
    assert.deepEqual(fixture.calls, []);
  } finally { await fixture.cleanup(); }
});

test('GM foreground refresh publishes latest game snapshot after the room controls recover', async () => {
  const fixture = setup('gm');
  try {
    fixture.internals.handleGmVisibilityChange();
    assert.deepEqual(fixture.calls, ['refresh']);
    fixture.refresh.resolve(); await flush();
    assert.deepEqual(fixture.calls, ['refresh', 'snapshot-publish']);
  } finally { await fixture.cleanup(); }
});

for (const change of ['room', 'peer', 'role', 'connection', 'disconnected'] as const) {
  test(`foreground completion never sends into a changed ${change}`, async () => {
    const fixture = setup();
    try {
      fixture.internals.handlePlayerResume();
      const state = fixture.internals.sessionStore.get();
      if (change === 'room') fixture.internals.sessionStore.set({ ...state, roomId: 'ANOTHER' });
      if (change === 'peer') fixture.internals.sessionStore.set({ ...state, peerId: 'new-peer' });
      if (change === 'role') fixture.internals.sessionStore.set({ ...state, role: 'gm' });
      if (change === 'connection') fixture.internals.activeRoomConnection = { ...fixture.connection };
      if (change === 'disconnected') fixture.internals.sessionStore.set({ ...state, connected: false });
      fixture.refresh.resolve(); await flush();
      assert.deepEqual(fixture.calls, ['refresh']);
    } finally { await fixture.cleanup(); }
  });
}

test('stop fences an old refresh even if a fixture restores identical room and connection values', async () => {
  const fixture = setup();
  try {
    const state = fixture.internals.sessionStore.get();
    fixture.internals.handlePlayerResume();
    await fixture.session.stop({ forgetSession: false });
    fixture.internals.sessionStore.set(state);
    fixture.internals.activeRoomConnection = fixture.connection;
    fixture.refresh.resolve(); await flush();
    assert.deepEqual(fixture.calls, ['refresh']);
  } finally { await fixture.cleanup(); }
});

test('control refresh failure still attempts normal canonical recovery without recreating transport', async () => {
  const fixture = setup();
  try {
    fixture.internals.handlePlayerResume();
    fixture.refresh.reject(new Error('control unavailable')); await flush();
    assert.deepEqual(fixture.calls, ['refresh', 'pending', 'canonical', 'capabilities', 'snapshot-request']);
    assert.equal(fixture.internals.activeRoomConnection, fixture.connection);
  } finally { await fixture.cleanup(); }
});
