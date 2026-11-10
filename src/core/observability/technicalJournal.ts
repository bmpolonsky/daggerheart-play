import type { ConnectionStageDiagnostic } from '../../domain/p2p/connectionDiagnostics';

const OPERATIONS = {
  network: ['auth-session', 'auth-sign-in', 'auth-bind', 'room-open', 'room-join', 'realtime', 'state', 'events', 'roster', 'handshake', 'p2p-supabase', 'p2p-nostr', 'p2p-torrent'],
  startup: ['initialize'],
  persistence: ['read', 'write'],
  import: ['validate', 'apply'],
  media: ['acquire', 'publish']
} as const;
const PHASES = ['pending', 'running', 'succeeded', 'failed', 'timed-out', 'cancelled'] as const;
const CODES = ['timeout', 'cancelled', 'network_error', 'auth_required', 'auth_failed', 'room_not_found', 'master_offline', 'room_in_use', 'participant_in_use', 'rate_limited', 'realtime_closed', 'realtime_error', 'server_error', 'operation_failed', 'storage_unavailable', 'quota_exceeded', 'invalid_data', 'media_denied', 'media_unavailable'] as const;
type JournalArea = keyof typeof OPERATIONS;
export type JournalInput = { [A in JournalArea]: { area: A; operation: (typeof OPERATIONS)[A][number]; phase: (typeof PHASES)[number]; attempt?: number; httpStatus?: number; durationMs?: number; errorCode?: (typeof CODES)[number] } }[JournalArea];
export type TechnicalJournalEntry = JournalInput & { at: number; level: 'info' | 'warn' | 'error' };

/** Runtime allowlist, even when an untyped caller or a future integration passes extra fields. */
export function sanitizeTechnicalJournalEntry(value: unknown): TechnicalJournalEntry | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (typeof source.area !== 'string' || !Object.hasOwn(OPERATIONS, source.area)) return null;
  const operations: readonly string[] = OPERATIONS[source.area as JournalArea];
  if (typeof source.operation !== 'string' || !operations.includes(source.operation)) return null;
  if (typeof source.phase !== 'string' || !(PHASES as readonly string[]).includes(source.phase)) return null;
  if (typeof source.at !== 'number' || !Number.isFinite(source.at) || source.at < 0 || source.at > 8.64e15) return null;
  const safe = { at: source.at, area: source.area, operation: source.operation, phase: source.phase, level: source.phase === 'failed' ? 'error' : source.phase === 'timed-out' || source.phase === 'cancelled' ? 'warn' : 'info' } as TechnicalJournalEntry;
  if (Number.isSafeInteger(source.attempt) && (source.attempt as number) > 0) safe.attempt = source.attempt as number;
  if (Number.isInteger(source.httpStatus) && (source.httpStatus as number) >= 100 && (source.httpStatus as number) <= 599) safe.httpStatus = source.httpStatus as number;
  if (typeof source.durationMs === 'number' && Number.isFinite(source.durationMs) && source.durationMs >= 0) safe.durationMs = source.durationMs;
  if (typeof source.errorCode === 'string' && (CODES as readonly string[]).includes(source.errorCode)) safe.errorCode = source.errorCode as (typeof CODES)[number];
  return safe;
}

export const TECHNICAL_JOURNAL_STORAGE_KEY = 'daggerheart.technical-journal.v1';
type JournalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Bounded allowlisted journal. Optional tab storage never contains arbitrary text or identities. */
export class TechnicalJournal {
  private entries: TechnicalJournalEntry[] = [];
  private storageAvailable = false;
  private storageReadable = false;
  constructor(private options: { maxEvents?: number; maxBytes?: number; ttlMs?: number; now?: () => number; storage?: JournalStorage } = {}) {
    if (!options.storage) return;
    try {
      const raw = options.storage.getItem(TECHNICAL_JOURNAL_STORAGE_KEY);
      this.storageReadable = true;
      // Bound untrusted persisted input before parsing, then reapply the runtime allowlist.
      if (raw && raw.length <= this.maxBytes() && new TextEncoder().encode(raw).byteLength <= this.maxBytes()) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) this.entries = parsed.map(sanitizeTechnicalJournalEntry).filter((entry): entry is TechnicalJournalEntry => entry !== null);
      }
      this.prune(this.now());
      this.trim();
      this.persist();
    } catch {
      // Broken/blocked storage must not prevent the app from starting.
      this.entries = [];
      this.persist();
    }
  }
  survivesReload(): boolean { return this.storageAvailable; }
  record(input: JournalInput): void {
    const now = this.now();
    this.prune(now);
    const entry = sanitizeTechnicalJournalEntry({ ...input, at: now });
    if (!entry) return;
    this.entries.push(entry);
    this.trim();
    this.persist();
  }
  read(): TechnicalJournalEntry[] {
    if (this.prune(this.now())) this.persist();
    return this.entries.map(entry => ({ ...entry }));
  }
  clear(): void {
    this.entries = [];
    try { this.options.storage?.removeItem(TECHNICAL_JOURNAL_STORAGE_KEY); }
    catch { this.storageAvailable = false; }
  }
  private maxBytes(): number { return this.options.maxBytes ?? 256 * 1024; }
  private trim(): void {
    while (this.entries.length > 0 && (this.entries.length > (this.options.maxEvents ?? 500) || this.bytes() > this.maxBytes())) this.entries.shift();
  }
  private persist(): void {
    if (!this.options.storage || !this.storageReadable) return;
    try {
      this.options.storage.setItem(TECHNICAL_JOURNAL_STORAGE_KEY, JSON.stringify(this.entries));
      this.storageAvailable = true;
    } catch {
      this.storageAvailable = false;
      // Do not leave an older, misleading snapshot when a save fails.
      try { this.options.storage.removeItem(TECHNICAL_JOURNAL_STORAGE_KEY); } catch { /* Memory-only fallback. */ }
    }
  }
  private now(): number { return (this.options.now ?? Date.now)(); }
  private bytes(): number { return new TextEncoder().encode(JSON.stringify(this.entries)).byteLength; }
  private prune(now: number): boolean {
    const count = this.entries.length;
    const oldest = now - (this.options.ttlMs ?? 24 * 60 * 60 * 1000);
    this.entries = this.entries.filter(entry => entry.at > oldest && entry.at <= now);
    return count !== this.entries.length;
  }
}

function tabStorage(): JournalStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage; }
  catch { return undefined; }
}
const journal = new TechnicalJournal({ storage: tabStorage() });
export function recordNetworkStage(stage: ConnectionStageDiagnostic): void {
  journal.record({
    area: 'network', operation: stage.id, phase: stage.status, attempt: stage.attempt,
    durationMs: stage.startedAt === null ? undefined : Math.max(0, (stage.finishedAt ?? Date.now()) - stage.startedAt),
    errorCode: stage.errorCode, httpStatus: stage.httpStatus
  });
}
export function getTechnicalJournal(): TechnicalJournalEntry[] { return journal.read(); }

export function clearTechnicalJournal(): void { journal.clear(); }
export function technicalJournalSurvivesReload(): boolean { return journal.survivesReload(); }

/** Explicit typed entry point. No arbitrary messages accepted. */
export function recordTechnicalEvent(event: JournalInput): void { journal.record(event); }


type OperationContext = { [A in JournalArea]: { area: A; operation: (typeof OPERATIONS)[A][number] } }[JournalArea];

/** Preserve the original result/error; never capture its content in diagnostics. */
export async function observeTechnicalOperation<T>(context: OperationContext, action: () => T | PromiseLike<T>): Promise<T> {
  const startedAt = Date.now();
  recordTechnicalEvent({ ...context, phase: 'running' });
  try {
    const result = await action();
    recordTechnicalEvent({ ...context, phase: 'succeeded', durationMs: Math.max(0, Date.now() - startedAt) });
    return result;
  } catch (error) {
    const code = technicalErrorCode(error, context.area);
    recordTechnicalEvent({ ...context, phase: code === 'cancelled' ? 'cancelled' : 'failed', errorCode: code, durationMs: Math.max(0, Date.now() - startedAt) });
    throw error;
  }
}

function technicalErrorCode(error: unknown, area: JournalArea): NonNullable<JournalInput['errorCode']> {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'AbortError': return 'cancelled';
    case 'QuotaExceededError': return 'quota_exceeded';
    case 'NotAllowedError': case 'SecurityError': return area === 'media' ? 'media_denied' : 'storage_unavailable';
    case 'NotFoundError': case 'NotReadableError': return area === 'media' ? 'media_unavailable' : 'operation_failed';
    case 'SyntaxError': case 'DataError': return 'invalid_data';
    default: return 'operation_failed';
  }
}
