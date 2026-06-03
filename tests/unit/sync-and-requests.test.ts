import { test } from "vitest";
import assert from "node:assert/strict";
import { diceService } from "../../src/services/serviceRegistry";
import { LocalSyncTransport, SyncService } from "../../src/services/SyncService";
import { PlayerActionRequestService } from "../../src/services/PlayerActionRequestService";
import { PlayerActivationQueueService } from "../../src/services/PlayerActivationQueueService";

test('sync publishes player token move messages', async () => {
  const sync = new SyncService();
  sync.setTransport(new LocalSyncTransport());
  await sync.connectAuthority('room', {
    id: 'player-1',
    name: 'Игрок',
    role: 'player',
    actorIds: ['pc-1'],
    connected: true,
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
  let received: unknown = null;
  const unsubscribe = sync.subscribePlayerTokenMoves((move) => {
    received = move;
  });

  await sync.publishPlayerTokenMove({ sceneId: 'scene-1', tokenId: 'token-1', actorId: 'pc-1', x: 120, y: 240 });
  unsubscribe();

  assert.deepEqual(received, { sceneId: 'scene-1', tokenId: 'token-1', actorId: 'pc-1', x: 120, y: 240 });
});

test('sync publishes player decision messages for GM-applied card choices', async () => {
  const sync = new SyncService();
  sync.setTransport(new LocalSyncTransport());
  await sync.connectAuthority('room', {
    id: 'player-1',
    name: 'Игрок',
    role: 'player',
    actorIds: ['pc-1'],
    connected: true,
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
  let received: unknown = null;
  const unsubscribe = sync.subscribePlayerDecisions((message) => {
    received = message;
  });

  await sync.publishPlayerDecision({
    type: 'playerDecision',
    decisionId: 'decision-1',
    participantId: 'player-1',
    actorId: 'pc-1',
    actorName: 'Ари',
    createdAt: '2026-01-01T00:00:00.000Z',
    decision: { kind: 'deathMove', deathMoveEntryId: 'feed-1', choice: 'avoidDeath' }
  });
  unsubscribe();

  assert.deepEqual(received, {
    type: 'playerDecision',
    decisionId: 'decision-1',
    participantId: 'player-1',
    actorId: 'pc-1',
    actorName: 'Ари',
    createdAt: '2026-01-01T00:00:00.000Z',
    decision: { kind: 'deathMove', deathMoveEntryId: 'feed-1', choice: 'avoidDeath' }
  });
});

test('player action requests stay pending until GM approval or rejection', () => {
  let appliedActionDifficulty: number | null = null;
  const requestService = new PlayerActionRequestService({
    rollAction: (request) => {
      appliedActionDifficulty = request.difficulty;
      return { id: 'approved-roll' } as ReturnType<typeof diceService.rollAction>;
    },
    rollManualDice: () => ({ id: 'manual-roll' }) as ReturnType<typeof diceService.rollManualDice>,
    rollDamage: () => ({ id: 'damage-roll' }) as ReturnType<typeof diceService.rollDamage>
  });

  const request = requestService.submit({
    requesterId: 'player-1',
    requesterName: 'Игрок',
    actorId: 'hero-1',
    actorName: 'Ари',
    kind: 'actionRoll',
    title: 'Проверка ловкости',
    payload: { actorId: 'hero-1', actorName: 'Ари', trait: 'agility', difficulty: 14 }
  });

  assert.equal(request.status, 'pending');
  assert.equal(appliedActionDifficulty, null);
  assert.equal(requestService.receiveRemote(request), request);
  assert.equal(requestService.requests$.get().filter((item) => item.id === request.id).length, 1);

  const approved = requestService.approve(request.id, 'gm-1');
  assert.equal(approved?.status, 'approved');
  assert.equal(approved?.applyResult?.rollLogEntryId, 'approved-roll');
  assert.equal(appliedActionDifficulty, 14);
  const playerMirror = new PlayerActionRequestService();
  playerMirror.receiveRemote(request);
  playerMirror.receiveRemote(approved!);
  assert.equal(playerMirror.requests$.get()[0]?.status, 'approved');

  const rejectedRequest = requestService.submit({
    requesterId: 'player-1',
    kind: 'manualRoll',
    title: 'Скрытый бросок',
    payload: { formula: '1d20', label: 'Скрытый бросок', visibility: 'gm' }
  });
  const rejected = requestService.reject(rejectedRequest.id, 'gm-1', 'Сначала опиши действие.');
  assert.equal(rejected?.status, 'rejected');
  assert.equal(rejected?.rejectionReason, 'Сначала опиши действие.');
  assert.equal(requestService.approve(rejectedRequest.id, 'gm-1'), null);

  const resourceRequest = requestService.submit({
    requesterId: 'player-1',
    kind: 'resourceChange',
    title: 'Надежда +1',
    payload: { actorId: 'hero-1', resource: 'hope', delta: 1 }
  });
  assert.equal(requestService.approve(resourceRequest.id, 'gm-1')?.applyResult?.note, 'Заявка на ресурс подтверждена; GM применяет изменение вручную.');
});

test('player activation queue keeps raised hands in request order and syncs messages', async () => {
  const queue = new PlayerActivationQueueService();
  const first = queue.raise({
    requesterId: 'peer-1',
    requesterName: 'Игрок 1',
    actorId: 'hero-1',
    actorName: 'Ари'
  });
  const second = queue.raise({
    requesterId: 'peer-2',
    requesterName: 'Игрок 2',
    actorId: 'hero-2',
    actorName: 'Брин'
  });

  assert.equal(first.type, 'raise');
  assert.equal(second.type, 'raise');
  assert.deepEqual(queue.queue$.get().map((item) => item.actorId), ['hero-1', 'hero-2']);
  assert.deepEqual(queue.local$.get(), { raised: true, actorId: 'hero-2' });

  queue.receiveRemote({ type: 'clear', actorId: 'hero-1', requesterId: 'peer-1', updatedAt: '2026-01-01T00:00:00.000Z' });
  assert.deepEqual(queue.queue$.get().map((item) => item.actorId), ['hero-2']);

  const received: unknown[] = [];
  const sync = new SyncService();
  await sync.connectAuthority('local', {
    id: 'gm',
    name: 'Мастер',
    role: 'gm',
    actorIds: [],
    connected: true,
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
  const unsubscribe = sync.subscribePlayerActivations((message) => received.push(message));
  await sync.publishPlayerActivation(second);
  unsubscribe();

  assert.deepEqual(received, [second]);
});
