import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Store } from '../../src/core/store/Store';
import { GmLobbyService } from '../../src/services/GmLobbyService';
import type { P2PInviteDraftState, P2PSessionInvite, P2PSessionService, P2PSessionState } from '../../src/services/P2PSessionService';

test('opening a GM room waits for background session restoration', async () => {
  let finishRestore!: () => void;
  const restore = new Promise<void>((resolve) => {
    finishRestore = resolve;
  });
  let createCalls = 0;
  const invite: P2PSessionInvite = { roomId: 'ABC123', inviteUrl: 'https://example.test/#/join/ABC123' };
  const fakeSessionService = {
    invite$: new Store<P2PInviteDraftState>({ roomId: 'ABC123', inviteUrl: '', roomCodeRefreshBlockedUntil: 0 }).toStream(),
    session$: new Store<P2PSessionState>({
      connected: false,
      status: 'disconnected',
      role: null,
      roomId: '',
      peerId: null,
      peers: [],
      lastSnapshotAt: null,
      latestRollAnimationId: null,
      lastRequestAt: null,
      message: '',
      routes: [],
      routePeers: []
    }).toStream(),
    restoreActiveSession: async () => {
      await restore;
      return true;
    },
    createGmInviteFromDraft: async () => {
      createCalls += 1;
      return invite;
    }
  } as unknown as P2PSessionService;
  const lobby = new GmLobbyService(fakeSessionService);

  const restoring = lobby.restoreSession('GM');
  const opening = lobby.createSession({ origin: 'https://example.test', participantName: 'GM' });
  await Promise.resolve();
  assert.equal(createCalls, 0);

  finishRestore();
  await restoring;
  assert.deepEqual(await opening, invite);
  assert.equal(createCalls, 1);
});
