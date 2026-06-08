import assert from "node:assert/strict";
import { test } from "vitest";
import {
  runMigrationSteps,
  runVersionedMigrations,
  type MigrationStep,
  type VersionedMigration
} from "../../src/domain/migrations/migration-runner";

interface VersionedValue {
  schemaVersion: number;
  steps: string[];
}

test('migration runner applies ordered migrations in range', () => {
  const migrations: Array<VersionedMigration<VersionedValue>> = [
    {
      id: 'v1-to-v2',
      from: 1,
      to: 2,
      run: (value) => ({ schemaVersion: 2, steps: [...value.steps, 'v1-to-v2'] })
    },
    {
      id: 'v2-to-v3',
      from: 2,
      to: 3,
      run: (value) => ({ schemaVersion: 3, steps: [...value.steps, 'v2-to-v3'] })
    }
  ];

  const result = runVersionedMigrations({ schemaVersion: 1, steps: [] }, migrations, { from: 1, to: 2 });

  assert.deepEqual(result, {
    schemaVersion: 2,
    steps: ['v1-to-v2']
  });
});

test('migration runner applies generic context steps', () => {
  const steps: Array<MigrationStep<VersionedValue>> = [
    { id: 'first', run: (value) => ({ ...value, steps: [...value.steps, 'first'] }) },
    { id: 'second', run: (value) => ({ ...value, steps: [...value.steps, 'second'] }) }
  ];

  assert.deepEqual(runMigrationSteps({ schemaVersion: 1, steps: [] }, steps), {
    schemaVersion: 1,
    steps: ['first', 'second']
  });
});

test('migration runner rejects gaps and out-of-order migrations', () => {
  assert.throws(
    () => runVersionedMigrations(
      { schemaVersion: 1, steps: [] },
      [{ id: 'v2-to-v3', from: 2, to: 3, run: (value: VersionedValue) => value }],
      { from: 1, to: 3 }
    ),
    /Missing migration/
  );

  assert.throws(
    () => runVersionedMigrations(
      { schemaVersion: 1, steps: [] },
      [
        { id: 'v2-to-v3', from: 2, to: 3, run: (value: VersionedValue) => value },
        { id: 'v1-to-v2', from: 1, to: 2, run: (value: VersionedValue) => value }
      ],
      { from: 1, to: 3 }
    ),
    /out of order/
  );
});
