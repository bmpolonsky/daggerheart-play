import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { RelayEnvelopeAssembler, splitRelayEnvelope } from '../../src/services/p2p/supabaseRelayChunks';
import type { P2PWireEnvelope } from '../../src/services/p2p/P2PTransportAdapter';

function message(peerId = 'player', text = 'Кириллица 🌒 \\"\n'.repeat(5000)): P2PWireEnvelope {
  return { version: 2, id: 'original', channel: 'data', sender: { peerId, role: 'player' },
    sentAt: new Date(0).toISOString(), payload: { kind: 'actor', value: { text } } };
}

test('small events remain unchanged; large Unicode messages arrive atomically despite reordered or repeated chunks', () => {
  const small = message('player', 'small');
  assert.equal(splitRelayEnvelope(small)[0], small);
  const original = message();
  const chunks = splitRelayEnvelope(original);
  assert.ok(chunks.length > 1);
  const receiver = new RelayEnvelopeAssembler();
  assert.equal(receiver.accept(chunks[0]), null);
  assert.equal(receiver.accept(chunks[0]), null);
  for (const chunk of chunks.slice(2).reverse()) assert.equal(receiver.accept(chunk), null);
  assert.deepEqual(receiver.accept(chunks[1]), original);
  for (const chunk of chunks) {
    assert.ok(JSON.stringify(chunk).length < 40_000, 'leave room for JSONB spacing and Realtime metadata');
    assert.equal((chunk.payload as { kind: string }).kind, 'actor');
  }
});

test('unfinished messages from different authors never mix and disconnect discards old parts', () => {
  const first = splitRelayEnvelope(message('one'));
  const second = splitRelayEnvelope(message('two'));
  const receiver = new RelayEnvelopeAssembler();
  assert.equal(receiver.accept(first[0]), null);
  for (const chunk of second.slice(1)) assert.equal(receiver.accept(chunk), null);
  assert.deepEqual(receiver.accept(second[0]), message('two'));
  receiver.clear();
  for (const chunk of first.slice(1)) assert.equal(receiver.accept(chunk), null);
  assert.deepEqual(receiver.accept(first[0]), message('one'));
});

test('assembled messages cannot change the sender role or the kind authorized by the server', () => {
  for (const spoof of ['role', 'kind']) {
    const receiver = new RelayEnvelopeAssembler();
    const chunks = splitRelayEnvelope(message()).map((part) => spoof === 'role'
      ? { ...part, sender: { ...part.sender, role: 'gm' as const } }
      : { ...part, payload: { ...(part.payload as object), kind: 'presence' } });
    for (const chunk of chunks.slice(0, -1)) assert.equal(receiver.accept(chunk), null);
    assert.throws(() => receiver.accept(chunks.at(-1)!), /Автор или тип/);
  }
});

test('concurrent updates from a large table do not evict each other', () => {
  const receiver = new RelayEnvelopeAssembler();
  const messages = Array.from({ length: 12 }, (_, index) => message(`player-${index}`));
  const chunks = messages.map(splitRelayEnvelope);
  for (let part = 0; part < chunks[0].length; part += 1) {
    chunks.forEach((parts, index) => assert.deepEqual(receiver.accept(parts[part]), part === parts.length - 1 ? messages[index] : null));
  }
});

test('rejects oversized messages and invalid chunk counts and expires stalled assemblies', () => {
  assert.throws(() => splitRelayEnvelope(message('player', 'x'.repeat(8 * 1024 * 1024))), /слишком велико/);
  const chunks = splitRelayEnvelope(message());
  const receiver = new RelayEnvelopeAssembler();
  const payload = chunks[0].payload as { relayChunk: object };
  assert.throws(() => receiver.accept({ ...chunks[0], payload: { ...payload, relayChunk: { ...payload.relayChunk, count: 1e9 } } }), /Некорректная/);
  vi.useFakeTimers();
  try {
    receiver.accept(chunks[0]);
    vi.advanceTimersByTime(60_001);
    for (const chunk of chunks.slice(1)) assert.equal(receiver.accept(chunk), null);
    assert.deepEqual(receiver.accept(chunks[0]), message());
  } finally { vi.useRealTimers(); }
});
