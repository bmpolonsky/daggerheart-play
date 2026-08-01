/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { Cloud, Download, Trash2, Upload } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { formatDateTime } from '../../core/utils/date';
import { serverSessionEnabled } from '../../domain/p2p/serverSession';
import { importExportService, persistenceService } from '../../services/serviceRegistry';
import { Button, ConfirmDialog, EmptyState, IconButton, ListItem, Notice, SectionHeader, Surface, Toolbar } from '../components/common';
import type { StoredGameSummary } from '../../core/persistence/gameDocumentStore';

interface CloudWorldSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export function StoredGamesCard() {
  const usesServer = serverSessionEnabled();
  const storedGames = useStream(persistenceService.storedGames$);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredGameSummary | null>(null);
  const [pendingCloudWorld, setPendingCloudWorld] = useState<CloudWorldSummary | null>(null);
  const [cloudWorlds, setCloudWorlds] = useState<CloudWorldSummary[] | null>(null);
  const [cloudError, setCloudError] = useState('');
  const activeStoredGame = storedGames.find((game) => game.active) ?? null;

  useEffect(() => {
    void persistenceService.refreshStoredGames();
    if (!usesServer) return;
    void fetch('/api/worlds', { credentials: 'same-origin' })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error('cloud_worlds_unavailable');
        const result = await response.json() as { worlds?: CloudWorldSummary[] };
        return Array.isArray(result.worlds) ? result.worlds : [];
      })
      .then((worlds) => setCloudWorlds(worlds))
      .catch(() => setCloudError('Не удалось загрузить резервные копии. Локальные сохранения доступны как обычно.'));
  }, [usesServer]);

  const importGameFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await importExportService.importFile(file);
      if (result.ok) {
        await persistenceService.refreshStoredGames();
      }
    } catch {
    } finally {
      input.value = '';
    }
  };

  const createStoredGame = async () => {
    const id = await persistenceService.createStoredGame();
    if (!id) return;
    await persistenceService.refreshStoredGames();
  };

  const switchStoredGame = async (id: string) => {
    const ok = await persistenceService.switchStoredGame(id);
    if (!ok) return;
    await persistenceService.refreshStoredGames();
  };

  const removeStoredGame = async (game: StoredGameSummary) => {
    const ok = await persistenceService.removeStoredGame(game.id);
    if (!ok) return;
    await persistenceService.refreshStoredGames();
  };

  const restoreCloudWorld = async (world: CloudWorldSummary) => {
    setCloudError('');
    try {
      const response = await fetch(`/api/worlds/${encodeURIComponent(world.id)}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('cloud_world_unavailable');
      const result = await response.json() as { snapshot?: unknown };
      const imported = await importExportService.importJson(JSON.stringify(result.snapshot));
      if (!imported.ok) throw new Error(imported.message);
      await persistenceService.refreshStoredGames();
    } catch {
      setCloudError('Не удалось восстановить резервную копию. Текущее локальное сохранение не изменено.');
    }
  };

  const downloadCloudWorld = (world: CloudWorldSummary) => {
    const anchor = document.createElement('a');
    anchor.href = `/api/worlds/${encodeURIComponent(world.id)}/export`;
    anchor.click();
  };

  return (
    <>
      <Surface className="role-entry__card role-entry__games-card" aria-label="Управление сохранениями">
        <SectionHeader
          title="Сохранения"
          actions={
            <Toolbar className="role-entry__storage-tools">
            <Button size="sm" type="button" onClick={() => void createStoredGame()}>
              Новая
            </Button>
            <Button size="sm" type="button" title={activeStoredGame ? 'Импорт заменит текущую открытую игру' : 'Импортировать игру'} iconBefore={<Upload size={15} aria-hidden="true" />} onClick={() => importFileRef.current?.click()}>
              Импорт
            </Button>
            {activeStoredGame && (
              <Button size="sm" type="button" iconBefore={<Download size={15} aria-hidden="true" />} onClick={() => void importExportService.downloadArchive()}>
                Экспорт
              </Button>
            )}
            </Toolbar>
          }
        />
        <div className="role-entry__game-list">
          {storedGames.map((game) => (
            <ListItem
              key={game.id}
              title={game.name || 'Без названия'}
              subtitle={game.updatedAt ? formatDateTime(game.updatedAt) : 'Без сохранения'}
              tone={game.active ? 'featured' : 'default'}
              leftAccessory={<Download size={17} aria-hidden="true" />}
              rightAccessory={
                <Toolbar className="role-entry__game-actions">
                  {!game.active && (
                    <Button size="sm" type="button" onClick={() => void switchStoredGame(game.id)}>
                      Открыть
                    </Button>
                  )}
                <IconButton variant="ghost" size="sm" type="button" title="Удалить игру" aria-label={`Удалить игру ${game.name || 'Без названия'}`} onClick={() => setPendingDelete(game)}>
                  <Trash2 size={14} aria-hidden="true" />
                </IconButton>
                </Toolbar>
              }
            />
          ))}
          {storedGames.length === 0 && <EmptyState size="sm" title="Сохранений пока нет" />}
        </div>
        <input
          ref={importFileRef}
          hidden
          type="file"
          accept="application/json,application/zip,.json,.zip,.dhgame"
          onChange={importGameFile}
        />
        {usesServer && cloudError && <Notice tone="error">{cloudError}</Notice>}
        {cloudWorlds && (
          <>
            <SectionHeader title="Облачные резервные копии" actions={<Cloud size={18} aria-hidden="true" />} />
            <Notice>Резервная копия обновляется во время открытой серверной игры. Картинки и аудиофайлы пока остаются на исходном устройстве.</Notice>
            <div className="role-entry__game-list">
              {cloudWorlds.map((world) => (
                <ListItem
                  key={world.id}
                  title={world.name || 'Без названия'}
                  subtitle={world.updatedAt ? formatDateTime(new Date(world.updatedAt).toISOString()) : 'Без сохранения'}
                  leftAccessory={<Cloud size={17} aria-hidden="true" />}
                  rightAccessory={
                    <Toolbar className="role-entry__game-actions">
                      <Button size="sm" type="button" onClick={() => setPendingCloudWorld(world)}>
                        Восстановить
                      </Button>
                      <IconButton variant="ghost" size="sm" type="button" title="Скачать мир" aria-label={`Скачать мир ${world.name || 'Без названия'}`} onClick={() => downloadCloudWorld(world)}>
                        <Download size={14} aria-hidden="true" />
                      </IconButton>
                    </Toolbar>
                  }
                />
              ))}
              {cloudWorlds.length === 0 && <EmptyState size="sm" title="Резервных копий пока нет" body="Резервная копия появится после первого успешного запуска серверной игры." />}
            </div>
          </>
        )}
      </Surface>
      {pendingDelete && (
        <ConfirmDialog
          title={`Удалить игру «${pendingDelete.name || 'Без названия'}»?`}
          body="Локальное сохранение и все данные кампании будут удалены с этого устройства. Это действие нельзя отменить."
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const storedGame = pendingDelete;
            setPendingDelete(null);
            void removeStoredGame(storedGame);
          }}
        />
      )}
      {pendingCloudWorld && (
        <ConfirmDialog
          title={`Восстановить мир «${pendingCloudWorld.name || 'Без названия'}»?`}
          body="Резервная копия станет текущей игрой на этом устройстве. Текущее локальное сохранение останется в списке сохранений."
          confirmLabel="Восстановить"
          destructive={false}
          onCancel={() => setPendingCloudWorld(null)}
          onConfirm={() => {
            const world = pendingCloudWorld;
            setPendingCloudWorld(null);
            void restoreCloudWorld(world);
          }}
        />
      )}
    </>
  );
}
