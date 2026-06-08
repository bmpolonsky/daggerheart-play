export interface MigrationStep<TContext> {
  id: string;
  run: (context: TContext) => TContext;
}

export interface VersionedMigration<TValue> extends MigrationStep<TValue> {
  id: string;
  from: number;
  to: number;
}

export interface RunVersionedMigrationsOptions<TValue> {
  from?: number;
  to?: number;
  getVersion?: (value: TValue) => number | undefined;
}

export function runMigrationSteps<TContext>(
  context: TContext,
  steps: readonly MigrationStep<TContext>[]
): TContext {
  assertStepOrder(steps);
  return steps.reduce((current, step) => step.run(current), context);
}

export function runVersionedMigrations<TValue>(
  value: TValue,
  migrations: readonly VersionedMigration<TValue>[],
  options: RunVersionedMigrationsOptions<TValue> = {}
): TValue {
  assertVersionedMigrationOrder(migrations);
  const fromVersion = options.from ?? options.getVersion?.(value);
  if (fromVersion === undefined) {
    throw new Error('Migration runner requires a source version.');
  }
  assertVersion('Source version', fromVersion);
  const toVersion = options.to ?? migrations.at(-1)?.to ?? fromVersion;
  assertVersion('Target version', toVersion);
  if (toVersion < fromVersion) {
    throw new Error(`Migration target version ${toVersion} is older than source version ${fromVersion}.`);
  }
  let currentValue = value;
  let version = fromVersion;

  for (const migration of migrations) {
    if (migration.from < version) {
      continue;
    }
    if (migration.from > version) {
      if (migration.from <= toVersion) throw new Error(`Missing migration from version ${version} to ${migration.from}.`);
      break;
    }
    if (migration.to > toVersion) break;

    currentValue = migration.run(currentValue);
    version = migration.to;
  }

  if (version !== toVersion) {
    throw new Error(`Missing migration from version ${version} to ${toVersion}.`);
  }
  return currentValue;
}

function assertStepOrder<TContext>(steps: readonly MigrationStep<TContext>[]): void {
  const ids = new Set<string>();
  for (const step of steps) {
    if (!step.id) {
      throw new Error('Migration step id is required.');
    }
    if (ids.has(step.id)) {
      throw new Error(`Duplicate migration step id: ${step.id}.`);
    }
    ids.add(step.id);
  }
}

function assertVersionedMigrationOrder<TValue>(migrations: readonly VersionedMigration<TValue>[]): void {
  assertStepOrder(migrations);
  let lastTo = -Infinity;
  for (const migration of migrations) {
    assertVersion(`Migration ${migration.id} source version`, migration.from);
    assertVersion(`Migration ${migration.id} target version`, migration.to);
    if (migration.to <= migration.from) {
      throw new Error(`Migration ${migration.id} target version must be newer than its source version.`);
    }
    if (migration.from < lastTo) {
      throw new Error(`Migration ${migration.id} is out of order.`);
    }
    lastTo = migration.to;
  }
}

function assertVersion(label: string, version: number): void {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}
