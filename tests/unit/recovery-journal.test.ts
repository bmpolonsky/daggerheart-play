import { test } from 'vitest';
import assert from 'node:assert/strict';
import { RecoveryJournal, RECOVERY_PREFIX } from '../../src/core/persistence/recoveryJournal';
import { createGameDocument } from '../../src/domain/game/gameDocument';
import { resetAllStores } from '../../src/stores/gameStores';
import { snapshotPersistedState } from '../../src/stores/persistedState';
function storage() {
  const map = new Map<string, string>();
  return { get length() { return map.size; }, key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); }, clear: () => map.clear() };
}
function document(fear = 2) { resetAllStores(); const state = snapshotPersistedState(); return createGameDocument({ ...state, game: { ...state.game, fear } }); }
test('journal writes synchronously, survives a new runtime and an old commit cannot erase a newer revision', async () => {
  const local = storage(), first = new RecoveryJournal(local), next = new RecoveryJournal(local);
  first.write(document(2), 1); first.write(document(3), 2); first.clearThrough(1);
  assert.equal((await next.pending())[0].document.files['data/game.json'].fear, 3);
  first.clearThrough(2); assert.equal((await next.pending()).length, 0);
});
test('journal cleanup cannot delete another tab or a concurrently updated recovery record', async () => {
  const local = storage(), first = new RecoveryJournal(local), next = new RecoveryJournal(local);
  first.write(document(2), 1); const draft = (await next.pending())[0];
  first.write(document(7), 2); next.removeUnchanged(draft);
  assert.equal((await next.pending())[0].document.files['data/game.json'].fear, 7);
  next.clearOwn(); assert.equal((await next.pending()).length, 1);
});
test('live owner leases suppress offers from active tabs; malformed bytes remain untouched', async () => {
  const local = storage(), first = new RecoveryJournal(local);
  first.write(document(), 1); local.setItem(RECOVERY_PREFIX + 'bad', '{bad');
  const held = { query: async () => ({ held: [{ name: 'daggerheart-play:recovery-owner:' + first.id }], pending: [] }) } as unknown as LockManager;
  assert.deepEqual(await new RecoveryJournal(local, held).pending(), []);
  assert.equal(local.getItem(RECOVERY_PREFIX + 'bad'), '{bad');
});
test('storage quota errors propagate without modifying the previous recovery bytes', async () => {
  const local = storage(), first = new RecoveryJournal(local); first.write(document(2), 1);
  const blocked = { ...local, setItem() { throw new Error('QuotaExceededError'); } };
  assert.throws(() => new RecoveryJournal(blocked).write(document(7), 2), /Quota/);
  assert.equal((await new RecoveryJournal(local).pending())[0].document.files['data/game.json'].fear, 2);
});


test('snapshot cache refreshes the emitted store even when reset reuses an object reference', async () => {
  const local = storage(), owner = new RecoveryJournal(local), reader = new RecoveryJournal(local);
  resetAllStores(); const state = snapshotPersistedState();
  owner.writeSnapshot(state, { ancestries: [], communities: [], subclasses: [], domainCards: [], cardDomains: [], adversaries: [], environments: [], classes: [], equipment: [], beastforms: [] }, 1, 'game');
  state.game.fear = 7;
  owner.writeSnapshot(state, { ancestries: [], communities: [], subclasses: [], domainCards: [], cardDomains: [], adversaries: [], environments: [], classes: [], equipment: [], beastforms: [] }, 2, 'game');
  assert.equal((await reader.pending())[0].document.files['data/game.json'].fear, 7);
  owner.clearThrough(1); assert.ok(local.getItem(RECOVERY_PREFIX + owner.id));
  owner.clearThrough(2); assert.equal(local.getItem(RECOVERY_PREFIX + owner.id), null);
});

test('cached state serialization never reuses custom content from the previous world', async () => {
  const local = storage(), owner = new RecoveryJournal(local), reader = new RecoveryJournal(local);
  resetAllStores(); const a = snapshotPersistedState();
  const empty = { ancestries: [], communities: [], subclasses: [], domainCards: [], cardDomains: [], adversaries: [], environments: [], classes: [], equipment: [], beastforms: [] };
  owner.writeSnapshot(a, { ...empty, cardDomains: ['world-A'] }, 1, 'game');
  const b = { ...a, game: { ...a.game, name: 'World B' } };
  owner.writeSnapshot(b, { ...empty, cardDomains: ['world-B'] }, 2, 'game');
  assert.deepEqual((await reader.pending())[0].document.files['content/custom-card-domains.json'], ['world-B']);
});
