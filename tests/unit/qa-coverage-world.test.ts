import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ImportExportService } from '../../src/services/ImportExportService';
import { createQaCoverageWorld } from '../fixtures/qaCoverageWorld';
import { BrowserGameDocumentStore, isWorldArchiveDocument } from '../../src/core/persistence/gameDocumentStore';
import { gameDocumentToPersistedState } from '../../src/domain/game/gameDocument';

test('synthetic catalog world uses valid builder choices and roundtrips through production import/export', async () => {
  const result = await createQaCoverageWorld(resolve('public/data'));
  assert.ok(isWorldArchiveDocument(result.archive));
  assert.ok(result.coverage.length >= 18);
  assert.equal(new Set(result.coverage.map(row => row.subclassId)).size, result.inventory.rawSubclassCount);
  assert.equal(new Set(result.inventory.adversaryRoleTiers.map(row => row.role)).size, 10);
  let saved: unknown = null;
  const adapter = { get: async <T>() => saved as T | null, put: async (_key: string, value: unknown) => { saved = value; }, delete: async () => { saved = null; }, subscribe: () => () => undefined };
  const store = new BrowserGameDocumentStore(adapter, undefined);
  await store.importWorld(result.archive);
  const first = gameDocumentToPersistedState((await store.load())!);
  assert.equal(first.characters.order.length, result.inventory.characters);
  assert.equal(first.encounter.order.length, result.inventory.adversaries);
  const reopened = new BrowserGameDocumentStore(adapter, undefined);
  assert.deepEqual(gameDocumentToPersistedState((await reopened.load())!).characters, first.characters);
  await reopened.importWorld(result.archive);
  assert.equal(gameDocumentToPersistedState((await reopened.load())!).characters.order.length, result.inventory.characters);
  assert.equal((await reopened.listWorlds()).length, 2);
  const transfer = new ImportExportService(undefined, { exportWorldDocument: async () => result.archive, importWorldDocument: async document => { await reopened.importWorld(document); }, importGameDocument: async () => undefined, importGameAsWorldDocument: async () => undefined });
  const bundle = await transfer.exportWorldBundle();
  assert.deepEqual(await transfer.importFile(bundle, { expectedKind: 'world' }), { ok: true });
  if (process.env.QA_WORLD_OUTPUT_DIRECTORY) {
    mkdirSync(process.env.QA_WORLD_OUTPUT_DIRECTORY, { recursive: true });
    for (const [name, data] of [['world-document.json', result.archive], ['coverage.json', { inventory: result.inventory, characters: result.coverage }]] as const) writeFileSync(resolve(process.env.QA_WORLD_OUTPUT_DIRECTORY, name), JSON.stringify(data, null, 2));
    writeFileSync(resolve(process.env.QA_WORLD_OUTPUT_DIRECTORY, 'synthetic-coverage-world.dhworld'), Buffer.from(await bundle.arrayBuffer()));
  }
});
