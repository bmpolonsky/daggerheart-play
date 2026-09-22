import { createId } from '../../core/utils/id';
import { isP2PWireEnvelope, type P2PWireEnvelope } from './P2PTransportAdapter';

// Keep each row below both the RPC limit and Realtime's smaller payload limit.
const INLINE_LIMIT = 16_384;
const CHUNK_SIZE = 32_768;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CHUNKS = Math.ceil(Math.ceil(MAX_BYTES / 3) * 4 / CHUNK_SIZE);
const EXPIRES_MS = 60_000;

function kind(envelope: P2PWireEnvelope): unknown {
  return (envelope.payload as { kind?: unknown } | null)?.kind;
}

export function splitRelayEnvelope(envelope: P2PWireEnvelope): P2PWireEnvelope[] {
  const json = JSON.stringify(envelope);
  if (json.length <= INLINE_LIMIT) return [envelope];
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > MAX_BYTES || envelope.channel !== 'data' || typeof kind(envelope) !== 'string' || kind(envelope) === 'snapshot') {
    throw new Error('Сообщение игры слишком велико для передачи.');
  }
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  const encoded = btoa(binary);
  const count = Math.ceil(encoded.length / CHUNK_SIZE);
  return Array.from({ length: count }, (_, index) => ({
    ...envelope,
    id: createId('relay-chunk'),
    // Preserve the original kind so the server still enforces its allowlist.
    payload: { kind: kind(envelope), relayChunk: {
      id: envelope.id, index, count, data: encoded.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
    } }
  }));
}

export class RelayEnvelopeAssembler {
  private pending = new Map<string, {
    parts: Map<number, string>; count: number; kind: unknown; role: string; updatedAt: number;
  }>();

  clear(): void { this.pending.clear(); }

  accept(envelope: P2PWireEnvelope): P2PWireEnvelope | null {
    const payload = envelope.payload as { relayChunk?: unknown } | null;
    if (!payload || typeof payload !== 'object' || !('relayChunk' in payload)) return envelope;
    const chunk = payload.relayChunk as { id?: unknown; index?: unknown; count?: unknown; data?: unknown } | null;
    if (!chunk || envelope.channel !== 'data' || typeof kind(envelope) !== 'string' || kind(envelope) === 'snapshot'
      || typeof chunk.id !== 'string' || chunk.id.length > 160
      || typeof chunk.index !== 'number' || !Number.isInteger(chunk.index)
      || typeof chunk.count !== 'number' || !Number.isInteger(chunk.count) || chunk.count < 1 || chunk.count > MAX_CHUNKS
      || chunk.index < 0 || chunk.index >= chunk.count
      || typeof chunk.data !== 'string' || chunk.data.length > CHUNK_SIZE) {
      throw new Error('Некорректная часть сообщения игры.');
    }
    const now = Date.now();
    for (const [key, entry] of this.pending) if (now - entry.updatedAt > EXPIRES_MS) this.pending.delete(key);
    const key = JSON.stringify([envelope.sender.peerId, chunk.id]);
    let entry = this.pending.get(key);
    if (!entry) {
      // Bound memory even if a participant sends unfinished messages, without
      // evicting another player's document during concurrent table updates.
      if (this.pending.size >= 128) throw new Error('Слишком много незавершённых сообщений игры.');
      entry = { parts: new Map(), count: chunk.count, kind: kind(envelope), role: envelope.sender.role, updatedAt: now };
      this.pending.set(key, entry);
    }
    if (entry.count !== chunk.count || entry.kind !== kind(envelope) || entry.role !== envelope.sender.role) {
      this.pending.delete(key);
      throw new Error('Части сообщения игры не совпадают.');
    }
    entry.parts.set(chunk.index, chunk.data);
    entry.updatedAt = now;
    let buffered = 0;
    for (const pending of this.pending.values()) for (const part of pending.parts.values()) buffered += part.length;
    if (buffered > MAX_CHUNKS * CHUNK_SIZE * 2) {
      this.pending.delete(key);
      throw new Error('Превышен размер незавершённых сообщений игры.');
    }
    if (entry.parts.size !== entry.count) return null;
    this.pending.delete(key);
    const encoded = Array.from({ length: entry.count }, (_, index) => entry.parts.get(index)!).join('');
    const binary = atob(encoded);
    if (binary.length > MAX_BYTES) throw new Error('Сообщение игры слишком велико для передачи.');
    const restored: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
    if (!isP2PWireEnvelope(restored) || restored.id !== chunk.id || restored.channel !== envelope.channel
      || restored.sender.peerId !== envelope.sender.peerId || restored.sender.role !== envelope.sender.role
      || kind(restored) !== kind(envelope)) {
      throw new Error('Автор или тип сообщения игры не совпадает с его частями.');
    }
    return restored;
  }
}
