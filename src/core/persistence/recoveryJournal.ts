import { canMigratePersistedState, migratePersistedState } from '../../domain/migrations/persistedState';
import type { PersistedState } from '../../domain/rules/types';
import { createId } from '../utils/id';
import { createGameDocument, isGameDocument, type GameCustomContent, type GameDocument } from '../../domain/game/gameDocument';

export const RECOVERY_PREFIX = 'daggerheart-play:recovery:v1:';
const LOCK_PREFIX = 'daggerheart-play:recovery-owner:';
export interface RecoveryDraft {
  kind: 'daggerheart-play:recovery';
  version: 1;
  id: string;
  revision: number;
  updatedAt: string;
  document: GameDocument;
}

/** Stable identity in the existing game-id field makes a committed recovery
 * recognizable even if the tab closes before the auxiliary journal is cleared. */
export function recoveryGameId(draft: Pick<RecoveryDraft, 'id' | 'revision'>): string {
  return `game_recovered_${draft.id}_${draft.revision}`;
}

/** A write-ahead recovery copy, never an authoritative game/world record.
 * Every runtime owns a separate key, so an old tab cannot erase another tab's
 * newer draft. Restoration always forks; no journal data overlays IndexedDB. */
export class RecoveryJournal {
  readonly id = createId('draft');
  private serialized = new Map<string, { value: unknown; text: string }>();
  private stopped = false;
  private releaseOwner: (() => void) | undefined;
  constructor(private readonly storage: Storage, private readonly locks?: LockManager) {}

  start(): void {
    this.stopped = false;
    if (this.locks) void this.locks.request(LOCK_PREFIX + this.id, async () => {
      if (this.stopped) return;
      await new Promise<void>(resolve => { this.releaseOwner = resolve; });
    }).catch(() => { /* Without a lease, recovery still forks rather than overwriting. */ });
  }
  stop(): void { this.stopped = true; this.releaseOwner?.(); }

  write(document: GameDocument, revision: number): void {
    const draft: RecoveryDraft = { kind: 'daggerheart-play:recovery', version: 1, id: this.id, revision, updatedAt: new Date().toISOString(), document };
    // This must complete in the same store-change stack, before debounce or
    // any await. Storage failure is reported by the caller, not hidden.
    this.storage.setItem(RECOVERY_PREFIX + this.id, JSON.stringify(draft));
  }
  writeSnapshot(state: PersistedState, customContent: GameCustomContent, revision: number, changed?: keyof PersistedState): void {
    // Store values are immutable, but the reported changed store is always
    // re-serialized (including explicit reset emissions). Unchanged large
    // collections reuse their JSON; no normalization/copy of the whole world
    // occurs on each drag/input event. Each complete record is still atomic.
    const encode = (key: string, value: unknown, force: boolean) => {
      const cached = this.serialized.get(key);
      if (!force && cached && cached.value === value) return cached.text;
      const text = JSON.stringify(value);
      this.serialized.set(key, { value, text });
      return text;
    };
    const stateText = '{' + Object.entries(state).map(([key, value]) => JSON.stringify(key) + ':' + encode(key, value, !changed || changed === key)).join(',') + '}';
    // Custom content may change under hydration suppression when worlds switch.
    // Its snapshot must never be borrowed from the previous world's cache.
    const customText = JSON.stringify(customContent);
    this.storage.setItem(RECOVERY_PREFIX + this.id,
      '{"kind":"daggerheart-play:recovery","version":1,"id":' + JSON.stringify(this.id)
      + ',"revision":' + revision + ',"updatedAt":' + JSON.stringify(new Date().toISOString())
      + ',"state":' + stateText + ',"customContent":' + customText + '}');
  }
  clearThrough(revision: number): void {
    const draft = this.read(this.id);
    if (draft && draft.revision <= revision) this.storage.removeItem(RECOVERY_PREFIX + this.id);
  }
  clearOwn(): void { this.storage.removeItem(RECOVERY_PREFIX + this.id); }

  async pending(): Promise<RecoveryDraft[]> {
    const held = new Set<string | undefined>();
    try { (await this.locks?.query())?.held?.forEach(lock => held.add(lock.name)); } catch { /* Fork-only fallback is safe. */ }
    const drafts: RecoveryDraft[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(RECOVERY_PREFIX)) continue;
      const id = key.slice(RECOVERY_PREFIX.length);
      if (id === this.id || held.has(LOCK_PREFIX + id)) continue;
      const draft = this.read(id);
      if (draft) drafts.push(draft);
    }
    return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async inactive(id: string): Promise<RecoveryDraft | null> {
    return (await this.pending()).find(draft => draft.id === id) ?? null;
  }
  removeUnchanged(draft: RecoveryDraft): void {
    const current = this.read(draft.id);
    if (current && JSON.stringify(current) === JSON.stringify(draft)) this.storage.removeItem(RECOVERY_PREFIX + draft.id);
  }
  private read(id: string): RecoveryDraft | null {
    const raw = this.storage.getItem(RECOVERY_PREFIX + id);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (value?.kind !== 'daggerheart-play:recovery' || value.version !== 1 || value.id !== id
        || !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.updatedAt !== 'string') return null;
      const document = isGameDocument(value.document) ? value.document
        : canMigratePersistedState(value.state) ? createGameDocument(migratePersistedState(value.state), value.customContent) : null;
      return document ? { kind: value.kind, version: 1, id, revision: value.revision, updatedAt: value.updatedAt, document } : null;
    } catch { return null; } // Retain malformed bytes; never delete someone else's data.
  }
}

export function browserRecoveryJournal(): RecoveryJournal | null {
  try {
    return typeof window === 'undefined' ? null : new RecoveryJournal(window.localStorage, typeof navigator === 'undefined' ? undefined : navigator.locks);
  } catch { return null; }
}
