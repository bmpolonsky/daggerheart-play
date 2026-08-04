/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Cloud, Download, Ellipsis, HardDrive, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { formatDateTime } from '../../core/utils/date';
import { cloudBackupService, gameService, importExportService, p2pSessionService, persistenceService } from '../../services/serviceRegistry';
import { ActionMenu, Badge, Button, ConfirmDialog, EmptyState, IconButton, ListItem, Notice, SectionHeader, Surface, Toolbar } from '../components/common';
import type { MasterAccountState } from './SessionLobby';
import { mergeGameLibrary, type CloudWorldSummary, type GameLibraryEntry } from './gameLibrary';

interface StoredGamesCardProps {
  account: MasterAccountState;
  onClose: () => void;
}

type PendingDelete = { kind: 'local' | 'cloud'; row: GameLibraryEntry };

export function StoredGamesCard({ account, onClose }: StoredGamesCardProps) {
  const storedGames = useStream(persistenceService.storedGames$);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingRestore, setPendingRestore] = useState<GameLibraryEntry | null>(null);
  const [cloudWorlds, setCloudWorlds] = useState<CloudWorldSummary[]>([]);
  const [failedWorldIds, setFailedWorldIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ tone: 'error' | 'warning'; text: string } | null>(null);
  const cloudEnabled = account.status === 'authenticated';
  const games = useMemo(() => mergeGameLibrary(storedGames, cloudWorlds, failedWorldIds), [storedGames, cloudWorlds, failedWorldIds]);

  useEffect(() => {
    void persistenceService.refreshStoredGames();
  }, []);

  useEffect(() => {
    if (!cloudEnabled) {
      setCloudWorlds([]);
      return;
    }
    let active = true;
    void loadCloudWorlds().then((worlds) => {
      if (active) setCloudWorlds(worlds);
    }).catch(() => {
      if (active) setMessage({ tone: 'error', text: 'Не удалось загрузить облачные копии. Локальные игры доступны как обычно.' });
    });
    return () => { active = false; };
  }, [cloudEnabled]);

  const importGameFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await importExportService.importFile(file, { asNewGame: true, regenerateGameId: true });
      if (result.ok) {
        await persistenceService.refreshStoredGames();
        onClose();
      }
      else setMessage({ tone: 'error', text: result.message });
    } catch {
      setMessage({ tone: 'error', text: 'Не удалось импортировать игру.' });
    } finally {
      input.value = '';
    }
  };

  const createStoredGame = async () => {
    if (!await persistenceService.createStoredGame()) return;
    await persistenceService.refreshStoredGames();
    onClose();
  };

  const openLocal = async (row: GameLibraryEntry, closeDialog = true) => {
    if (!row.local || row.local.active) return;
    if (!await persistenceService.switchStoredGame(row.local.id)) return;
    await persistenceService.refreshStoredGames();
    if (closeDialog) onClose();
  };

  const restoreCloud = async (row: GameLibraryEntry) => {
    if (!row.cloud) return;
    setMessage(null);
    try {
      const restored = await cloudBackupService.restore(row.cloud.id, { fork: Boolean(row.local) });
      if (!restored) {
        setMessage({ tone: 'warning', text: 'Архив этой копии ещё не создан. Откройте игру на исходном устройстве и повторите попытку.' });
        return;
      }
      await persistenceService.refreshStoredGames();
      onClose();
    } catch {
      markFailed(row.worldId, 'Не удалось восстановить облачную копию. Локальная игра не изменена.');
    }
  };

  const updateCloud = async (row: GameLibraryEntry) => {
    if (!row.local || !cloudEnabled) return;
    setMessage(null);
    try {
      await openLocal(row, false);
      await cloudBackupService.save(row.worldId);
      const localUpdatedAt = Date.parse(row.local.updatedAt ?? '');
      setCloudWorlds((worlds) => upsertCloudWorld(worlds, row, Number.isFinite(localUpdatedAt) ? localUpdatedAt : Date.now()));
      clearFailed(row.worldId);
    } catch {
      markFailed(row.worldId, 'Не удалось обновить облачную копию. Можно повторить попытку из меню игры.');
    }
  };

  const exportLocal = async (row: GameLibraryEntry) => {
    if (!row.local) return;
    await openLocal(row, false);
    await importExportService.downloadArchive();
  };

  const removeLocal = async (row: GameLibraryEntry) => {
    if (!row.local || !(await persistenceService.removeStoredGame(row.local.id))) return;
    await persistenceService.refreshStoredGames();
  };

  const removeCloud = async (row: GameLibraryEntry) => {
    if (!row.cloud) return;
    setMessage(null);
    try {
      const session = p2pSessionService.session$.get();
      if (session.role === 'gm' && gameService.game$.get().id === row.worldId) await p2pSessionService.stop();
      await cloudBackupService.remove(row.worldId);
      setCloudWorlds((worlds) => worlds.filter((world) => world.id !== row.worldId));
    } catch {
      markFailed(row.worldId, 'Не удалось удалить облачную копию. Локальная игра не изменена.');
    }
  };

  const markFailed = (worldId: string, text: string) => {
    setFailedWorldIds((ids) => new Set(ids).add(worldId));
    setMessage({ tone: 'error', text });
  };
  const clearFailed = (worldId: string) => setFailedWorldIds((ids) => {
    const next = new Set(ids);
    next.delete(worldId);
    return next;
  });

  return (
    <>
      <Surface className="role-entry__card role-entry__games-card" aria-label="Игры">
        <SectionHeader
          title="Игры"
          subtitle={cloudEnabled ? 'На устройстве и в облаке' : 'На этом устройстве'}
          actions={(
            <IconButton autoFocus size="sm" variant="ghost" title="Закрыть" aria-label="Закрыть игры" onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </IconButton>
          )}
        />
        <Toolbar className="role-entry__storage-tools">
          <Button grow size="sm" iconBefore={<Plus size={15} aria-hidden="true" />} onClick={() => void createStoredGame()}>Новая</Button>
          <Button grow size="sm" iconBefore={<Upload size={15} aria-hidden="true" />} onClick={() => importFileRef.current?.click()}>Импорт</Button>
        </Toolbar>
        <div className="role-entry__game-list">
          {games.map((row) => (
            <ListItem
              key={row.rowId}
              align="start"
              lines={2}
              title={row.name || 'Без названия'}
              subtitle={<GameStatuses row={row} />}
              detail={row.updatedAt ? formatDateTime(new Date(row.updatedAt).toISOString()) : 'Без сохранения'}
              tone={row.local?.active ? 'featured' : 'default'}
              leftAccessory={row.local ? <HardDrive size={17} aria-hidden="true" /> : <Cloud size={17} aria-hidden="true" />}
              rightAccessory={
                <Toolbar className="role-entry__game-actions">
                  <PrimaryGameAction row={row} cloudEnabled={cloudEnabled} onOpen={openLocal} onRestore={setPendingRestore} onUpdate={updateCloud} />
                  <ActionMenu
                    ariaLabel={`Действия с игрой ${row.name || 'Без названия'}`}
                    items={[
                      { id: 'export', label: 'Экспорт', icon: <Download size={14} />, disabled: !row.local, onSelect: () => void exportLocal(row) },
                      ...(cloudEnabled ? [
                        { id: 'backup', label: row.backupStatus === 'error' ? 'Повторить копирование' : 'Обновить копию', icon: <RefreshCw size={14} />, disabled: !row.local, onSelect: () => void updateCloud(row) },
                        { id: 'download-cloud', label: 'Скачать копию', icon: <Cloud size={14} />, disabled: !row.cloud, onSelect: () => downloadCloudWorld(row.worldId) }
                      ] : []),
                      { id: 'delete-local', label: 'Удалить с устройства', icon: <Trash2 size={14} />, disabled: !row.local, onSelect: () => setPendingDelete({ kind: 'local', row }) },
                      ...(cloudEnabled ? [
                        { id: 'delete-cloud', label: 'Удалить копию', icon: <Trash2 size={14} />, disabled: !row.cloud, onSelect: () => setPendingDelete({ kind: 'cloud', row }) }
                      ] : [])
                    ]}
                    renderTrigger={(props) => <IconButton {...props} variant="ghost" size="sm" title="Ещё" aria-label="Другие действия"><Ellipsis size={15} aria-hidden="true" /></IconButton>}
                  />
                </Toolbar>
              }
            />
          ))}
          {games.length === 0 && <EmptyState size="sm" title="Игр пока нет" body="Создайте новую игру или импортируйте архив." />}
        </div>
        <input ref={importFileRef} hidden type="file" accept="application/json,application/zip,.json,.zip,.dhgame" onChange={importGameFile} />
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </Surface>
      {pendingRestore && (
        <ConfirmDialog
          title={`Восстановить «${pendingRestore.name || 'Без названия'}»?`}
          body={pendingRestore.local
            ? 'Облачная версия новее. Она будет восстановлена отдельной игрой, локальная версия останется без изменений.'
            : 'Облачная копия будет добавлена на это устройство.'}
          confirmLabel="Восстановить"
          destructive={false}
          onCancel={() => setPendingRestore(null)}
          onConfirm={() => { const row = pendingRestore; setPendingRestore(null); void restoreCloud(row); }}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.kind === 'local' ? `Удалить «${pendingDelete.row.name}» с устройства?` : `Удалить облачную копию «${pendingDelete.row.name}»?`}
          body={pendingDelete.kind === 'local'
            ? 'Локальная версия будет удалена с этого устройства. Облачная копия, если она есть, останется.'
            : 'Облачная копия будет удалена. Локальная версия на этом устройстве останется.'}
          confirmLabel="Удалить"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { const value = pendingDelete; setPendingDelete(null); void (value.kind === 'local' ? removeLocal(value.row) : removeCloud(value.row)); }}
        />
      )}
    </>
  );
}

function PrimaryGameAction({ row, cloudEnabled, onOpen, onRestore, onUpdate }: {
  row: GameLibraryEntry;
  cloudEnabled: boolean;
  onOpen: (row: GameLibraryEntry) => Promise<void>;
  onRestore: (row: GameLibraryEntry) => void;
  onUpdate: (row: GameLibraryEntry) => Promise<void>;
}) {
  if (!row.local) return <Button size="xs" onClick={() => onRestore(row)}>Восстановить</Button>;
  if (!row.local.active) return <Button size="xs" onClick={() => void onOpen(row)}>Открыть</Button>;
  if (cloudEnabled && (row.backupStatus === 'local-newer' || row.backupStatus === 'error')) {
    return <Button size="xs" onClick={() => void onUpdate(row)}>Обновить копию</Button>;
  }
  if (row.backupStatus === 'cloud-newer') return <Button size="xs" onClick={() => onRestore(row)}>Восстановить</Button>;
  return null;
}

function GameStatuses({ row }: { row: GameLibraryEntry }) {
  return (
    <span className="role-entry__game-statuses">
      {row.local && <Badge size="xs" tone="neutral">На устройстве</Badge>}
      {row.cloud && <Badge size="xs" tone="blue">В облаке</Badge>}
      {row.backupStatus === 'local-newer' && <Badge size="xs" tone="gold">Копия устарела</Badge>}
      {row.backupStatus === 'cloud-newer' && <Badge size="xs" tone="gold">В облаке новее</Badge>}
      {row.backupStatus === 'error' && <Badge size="xs" tone="danger">Ошибка</Badge>}
    </span>
  );
}

async function loadCloudWorlds(): Promise<CloudWorldSummary[]> {
  const response = await fetch('/api/worlds', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('cloud_worlds_unavailable');
  const result = await response.json() as { worlds?: CloudWorldSummary[] };
  return Array.isArray(result.worlds) ? result.worlds : [];
}

function upsertCloudWorld(worlds: CloudWorldSummary[], row: GameLibraryEntry, updatedAt: number): CloudWorldSummary[] {
  const next = worlds.filter((world) => world.id !== row.worldId);
  next.push({ id: row.worldId, name: row.name, updatedAt });
  return next;
}

function downloadCloudWorld(worldId: string): void {
  const anchor = document.createElement('a');
  anchor.href = `/api/worlds/${encodeURIComponent(worldId)}/backup`;
  anchor.click();
}
