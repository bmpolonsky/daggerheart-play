import type { ConnectionStageDiagnostic } from '../../domain/p2p/connectionDiagnostics';

const OPERATIONS = {
  network: ['auth-session', 'auth-sign-in', 'auth-bind', 'room-open', 'room-join', 'realtime', 'state', 'events', 'roster', 'handshake', 'p2p-supabase', 'p2p-nostr', 'p2p-torrent'],
  startup: ['initialize'],
  persistence: ['read', 'write'],
  import: ['validate', 'apply'],
  media: ['acquire', 'publish']
} as const;
const PHASES = ['pending', 'running', 'succeeded', 'failed', 'timed-out', 'cancelled'] as const;
const CODES = ['timeout', 'cancelled', 'network_error', 'auth_required', 'auth_failed', 'room_not_found', 'master_offline', 'room_in_use', 'participant_in_use', 'rate_limited', 'realtime_closed', 'realtime_error', 'server_error'] as const;
type JournalArea = keyof typeof OPERATIONS;
type JournalInput = { [A in JournalArea]: { area: A; operation: (typeof OPERATIONS)[A][number]; phase: (typeof PHASES)[number]; attempt?: number; httpStatus?: number; durationMs?: number; errorCode?: (typeof CODES)[number] } }[JournalArea];
export type TechnicalJournalEntry = JournalInput & { at: number; level: 'info' | 'warn' | 'error' };

/** Runtime allowlist, even when an untyped caller or a future integration passes extra fields. */
export function sanitizeTechnicalJournalEntry(value: unknown): TechnicalJournalEntry | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (typeof source.area !== 'string' || !Object.hasOwn(OPERATIONS, source.area)) return null;
  const operations: readonly string[] = OPERATIONS[source.area as JournalArea];
  if (typeof source.operation !== 'string' || !operations.includes(source.operation)) return null;
  if (typeof source.phase !== 'string' || !(PHASES as readonly string[]).includes(source.phase)) return null;
  if (typeof source.at !== 'number' || !Number.isFinite(source.at) || source.at < 0) return null;
  const safe = { at: source.at, area: source.area, operation: source.operation, phase: source.phase, level: source.phase === 'failed' ? 'error' : source.phase === 'timed-out' || source.phase === 'cancelled' ? 'warn' : 'info' } as TechnicalJournalEntry;
  if (Number.isSafeInteger(source.attempt) && (source.attempt as number) > 0) safe.attempt = source.attempt as number;
  if (Number.isInteger(source.httpStatus) && (source.httpStatus as number) >= 100 && (source.httpStatus as number) <= 599) safe.httpStatus = source.httpStatus as number;
  if (typeof source.durationMs === 'number' && Number.isFinite(source.durationMs) && source.durationMs >= 0) safe.durationMs = source.durationMs;
  if (typeof source.errorCode === 'string' && (CODES as readonly string[]).includes(source.errorCode)) safe.errorCode = source.errorCode as (typeof CODES)[number];
  return safe;
}

/** Volatile, bounded journal. Never uses storage, fetch, telemetry or arbitrary text. */
export class TechnicalJournal {
  private entries: TechnicalJournalEntry[] = [];
  constructor(private options: { maxEvents?: number; maxBytes?: number; ttlMs?: number; now?: () => number } = {}) {}
  record(input: JournalInput): void {
    const now = this.now();
    this.prune(now);
    const entry = sanitizeTechnicalJournalEntry({ ...input, at: now });
    if (!entry) return;
    this.entries.push(entry);
    const maxEvents = this.options.maxEvents ?? 500;
    const maxBytes = this.options.maxBytes ?? 256 * 1024;
    while (this.entries.length > 0 && (this.entries.length > maxEvents || this.bytes() > maxBytes)) this.entries.shift();
  }
  read(): TechnicalJournalEntry[] {
    this.prune(this.now());
    return this.entries.map(entry => ({ ...entry }));
  }
  clear(): void { this.entries = []; }
  private now(): number { return (this.options.now ?? Date.now)(); }
  private bytes(): number { return new TextEncoder().encode(JSON.stringify(this.entries)).byteLength; }
  private prune(now: number): void {
    const oldest = now - (this.options.ttlMs ?? 24 * 60 * 60 * 1000);
    this.entries = this.entries.filter(entry => entry.at > oldest && entry.at <= now);
  }
}

const journal = new TechnicalJournal();
export function recordNetworkStage(stage: ConnectionStageDiagnostic): void {
  journal.record({
    area: 'network', operation: stage.id, phase: stage.status, attempt: stage.attempt,
    durationMs: stage.startedAt === null ? undefined : Math.max(0, (stage.finishedAt ?? Date.now()) - stage.startedAt),
    errorCode: stage.errorCode, httpStatus: stage.httpStatus
  });
}
export function getTechnicalJournal(): TechnicalJournalEntry[] { return journal.read(); }

/** Explicit typed entry point for future instrumented domains. No arbitrary messages accepted. */
export function recordTechnicalEvent(event: JournalInput): void { journal.record(event); }
