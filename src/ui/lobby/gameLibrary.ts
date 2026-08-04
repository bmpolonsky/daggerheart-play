import type { StoredGameSummary } from '../../core/persistence/gameDocumentStore';

export interface CloudWorldSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export type GameBackupStatus = 'local' | 'cloud' | 'synced' | 'local-newer' | 'cloud-newer' | 'error';

export interface GameLibraryEntry {
  rowId: string;
  worldId: string;
  name: string;
  updatedAt: number;
  local: StoredGameSummary | null;
  cloud: CloudWorldSummary | null;
  backupStatus: GameBackupStatus;
}

export function mergeGameLibrary(
  localGames: readonly StoredGameSummary[],
  cloudWorlds: readonly CloudWorldSummary[],
  failedWorldIds: ReadonlySet<string> = new Set()
): GameLibraryEntry[] {
  const rows: GameLibraryEntry[] = localGames.map((local) => {
    const updatedAt = dateMs(local.updatedAt);
    return {
      rowId: `local:${local.id}`,
      worldId: local.worldId,
      name: local.name,
      updatedAt,
      local,
      cloud: null,
      backupStatus: failedWorldIds.has(local.worldId) ? 'error' : 'local'
    };
  });
  for (const cloud of cloudWorlds) {
    const current = rows
      .filter((row) => row.worldId === cloud.id && row.local)
      .sort((a, b) => Number(Boolean(b.local?.active)) - Number(Boolean(a.local?.active)) || b.updatedAt - a.updatedAt)[0];
    const backupStatus = failedWorldIds.has(cloud.id)
      ? 'error'
      : current?.local
        ? compareCopies(dateMs(current.local.updatedAt), cloud.updatedAt)
        : 'cloud';
    const merged: GameLibraryEntry = {
      rowId: current?.rowId ?? `cloud:${cloud.id}`,
      worldId: cloud.id,
      name: current?.local?.name || cloud.name,
      updatedAt: Math.max(current?.updatedAt ?? 0, cloud.updatedAt),
      local: current?.local ?? null,
      cloud,
      backupStatus
    };
    if (current) rows[rows.indexOf(current)] = merged;
    else rows.push(merged);
  }
  return rows.sort((a, b) => {
    const activeDifference = Number(Boolean(b.local?.active)) - Number(Boolean(a.local?.active));
    return activeDifference || b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, 'ru');
  });
}

function compareCopies(localUpdatedAt: number, cloudUpdatedAt: number): GameBackupStatus {
  if (localUpdatedAt > cloudUpdatedAt) return 'local-newer';
  if (cloudUpdatedAt > localUpdatedAt) return 'cloud-newer';
  return 'synced';
}

function dateMs(value: string | null): number {
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}
