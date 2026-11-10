import { beforeEach, expect, test, vi } from 'vitest';
import { recordTechnicalEvent } from '../../src/core/observability/technicalJournal';
import { ImportExportService } from '../../src/services/ImportExportService';
import { PersistenceService } from '../../src/services/PersistenceService';
import type { GameDocumentStore } from '../../src/core/persistence/gameDocumentStore';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import { resetAllStores } from '../../src/stores/gameStores';

vi.mock('../../src/core/observability/technicalJournal', () => ({ recordTechnicalEvent: vi.fn() }));
vi.mock('../../src/core/observability/sentry', () => ({ reportOperationalError: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); resetAllStores(); });

function importer() {
  const persistence = { importGameDocument: vi.fn(async () => {}), importGameAsWorldDocument: vi.fn(async () => {}), importWorldDocument: vi.fn(async () => {}), exportWorldDocument: vi.fn(async () => null) };
  return { service: new ImportExportService(undefined, persistence), persistence };
}
function phases(area: string, operation: string) {
  return vi.mocked(recordTechnicalEvent).mock.calls.map(([event]) => event).filter(event => event.area === area && event.operation === operation).map(event => event.phase);
}

test('JSON apply records success only after persistence resolves and never records the payload', async () => {
  const { service, persistence } = importer();
  let finish!: () => void;
  persistence.importGameDocument.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const json = service.exportJson().replace('Без названия', 'private-name@example.com');
  const operation = service.importJson(json);
  expect(phases('import', 'apply')).toEqual(['running']);
  finish();
  expect(await operation).toEqual({ ok: true });
  expect(phases('import', 'apply')).toEqual(['running', 'succeeded']);
  expect(JSON.stringify(vi.mocked(recordTechnicalEvent).mock.calls)).not.toContain('private-name');
});

test('invalid import result is failure, while preview validation does not apply data', async () => {
  const { service, persistence } = importer();
  expect((await service.importJson('{"private":"not a document"}')).ok).toBe(false);
  expect(phases('import', 'apply')).toEqual(['running', 'failed']);
  expect(service.previewImportJson('invalid private text').ok).toBe(false);
  expect(service.previewImportJson(service.exportJson()).ok).toBe(true);
  expect(phases('import', 'validate')).toEqual(['running', 'failed', 'running', 'succeeded']);
  expect(persistence.importGameDocument).not.toHaveBeenCalled();
});

test('apply preserves thrown failures without logging raw errors', async () => {
  const { service, persistence } = importer();
  const error = new Error('https://private.invalid/secret');
  persistence.importGameDocument.mockRejectedValue(error);
  await expect(service.importJson(service.exportJson())).rejects.toBe(error);
  expect(phases('import', 'apply')).toEqual(['running', 'failed']);
  expect(JSON.stringify(vi.mocked(recordTechnicalEvent).mock.calls)).not.toContain('private.invalid');
});

test('invalid file validation emits one failure despite internal archive probes', async () => {
  const { service } = importer();
  expect((await service.readGameDocumentFromFile(new Blob(['not an archive']))).ok).toBe(false);
  expect(phases('import', 'validate')).toEqual(['running', 'failed']);
});

test('hydration failure remains handled but is visible in the technical journal', async () => {
  const service = new PersistenceService({ load: async () => { throw new Error('private storage key'); } } as unknown as GameDocumentStore, undefined, null);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect(await (service as unknown as { hydrateFromIndexedDb(): Promise<boolean> }).hydrateFromIndexedDb()).toBe(false);
    expect(phases('persistence', 'read')).toEqual(['running', 'failed']);
    expect(JSON.stringify(vi.mocked(recordTechnicalEvent).mock.calls)).not.toContain('private storage key');
  } finally { warn.mockRestore(); }
});

test('missing persistence storage reports failed write without claiming success', async () => {
  const service = new PersistenceService(null, undefined, null);
  await (service as unknown as { persistGameDocument(state: ReturnType<typeof snapshotPersistedState>, revision: number): Promise<void> }).persistGameDocument(snapshotPersistedState(), 1);
  expect(phases('persistence', 'write')).toEqual(['running', 'failed']);
});

test('empty storage hydration is a successful read, not a failed import', async () => {
  const service = new PersistenceService({ load: async () => null } as unknown as GameDocumentStore, undefined, null);
  expect(await (service as unknown as { hydrateFromIndexedDb(): Promise<boolean> }).hydrateFromIndexedDb()).toBe(false);
  expect(phases('persistence', 'read')).toEqual(['running', 'succeeded']);
});

for (const fails of [false, true]) {
  test(`queued persistence records ${fails ? 'failed' : 'successful'} durable writes`, async () => {
    const save = vi.fn(async () => { if (fails) throw new Error('private database name'); });
    const store = { load: async () => null, save, list: async () => [], listWorlds: async () => [] } as unknown as GameDocumentStore;
    const service = new PersistenceService(store, undefined, null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await (service as unknown as { persistGameDocument(state: ReturnType<typeof snapshotPersistedState>, revision: number): Promise<void> }).persistGameDocument(snapshotPersistedState(), 1);
      expect(save).toHaveBeenCalledOnce();
      expect(phases('persistence', 'write')).toEqual(['running', fails ? 'failed' : 'succeeded']);
      expect(JSON.stringify(vi.mocked(recordTechnicalEvent).mock.calls)).not.toContain('private database name');
    } finally { warn.mockRestore(); }
  });
}

test('unavailable hydration storage emits a fixed diagnostic without a misleading read success', async () => {
  const service = new PersistenceService(null, undefined, null);
  expect(await (service as unknown as { hydrateFromIndexedDb(): Promise<boolean> }).hydrateFromIndexedDb()).toBe(false);
  expect(phases('persistence', 'read')).toEqual(['failed']);
  expect(vi.mocked(recordTechnicalEvent)).toHaveBeenCalledWith({ area: 'persistence', operation: 'read', phase: 'failed', errorCode: 'storage_unavailable' });
});
