/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { CloudDownload, CloudUpload, Download, Ellipsis, FolderOpen, Globe2, Plus, Trash2, Upload } from 'lucide-react';
import type { StoredGameSummary, StoredWorldSummary } from '../../core/persistence/gameDocumentStore';
import { useStream } from '../../core/hooks/useStream';
import { formatDateTime } from '../../core/utils/date';
import { readSupabaseSessionConfig } from '../../domain/p2p/supabaseSession';
import { importExportService, persistenceService, worldBackupService } from '../../services/serviceRegistry';
import { initializeSupabaseMasterAuth, supabaseMasterAuth$ } from '../../services/supabaseClient';
import type { ServerWorldSummary } from '../../services/WorldBackupService';
import { ActionMenu, Badge, Button, ConfirmDialog, EmptyState, IconButton, ListItem, Notice, SectionHeader, Surface, Toolbar } from '../components/common';
import styles from './WorldLibraryPanel.module.css';

type PendingDelete =
  | { kind: 'world'; item: StoredWorldSummary }
  | { kind: 'game'; item: StoredGameSummary }
  | { kind: 'server'; item: ServerWorldSummary };

export function WorldLibraryPanel({ onOpen }: { onOpen?: () => void }) {
  const worlds = useStream(persistenceService.storedWorlds$);
  const auth = useStream(supabaseMasterAuth$);
  const config = readSupabaseSessionConfig();
  const worldImportRef = useRef<HTMLInputElement | null>(null);
  const gameImportRef = useRef<HTMLInputElement | null>(null);
  const [serverWorlds, setServerWorlds] = useState<ServerWorldSummary[]>([]);
  const [gameImportWorldId, setGameImportWorldId] = useState('');
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  useEffect(() => { void refreshLocal(); }, []);
  useEffect(() => {
    if (config) void initializeSupabaseMasterAuth(config);
  }, [config?.publishableKey, config?.url]);
  useEffect(() => {
    if (auth.status === 'signedIn') void refreshServer();
    else setServerWorlds([]);
  }, [auth.status]);

  const refreshLocal = async () => {
    await Promise.all([persistenceService.refreshStoredWorlds(), persistenceService.refreshStoredGames()]);
  };
  const refreshServer = async () => {
    if (!worldBackupService) return;
    try {
      setServerWorlds(await worldBackupService.list());
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(error) });
    }
  };
  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusyId('');
    }
  };
  const createWorld = () => run('new-world', async () => {
    if (!await persistenceService.createStoredWorld()) throw new Error('Не удалось создать мир.');
    await refreshLocal();
    setMessage({ tone: 'success', text: 'Новый мир создан.' });
  });
  const createGame = (world: StoredWorldSummary) => run(`new-game:${world.id}`, async () => {
    if (!world.active && !await persistenceService.switchStoredWorld(world.id)) throw new Error('Не удалось открыть мир.');
    if (!await persistenceService.createStoredGame()) throw new Error('Не удалось создать игру.');
    await refreshLocal();
    setMessage({ tone: 'success', text: 'Новая игра создана.' });
  });
  const openWorld = (world: StoredWorldSummary) => run(world.id, async () => {
    if (!world.active && !await persistenceService.switchStoredWorld(world.id)) throw new Error('Не удалось открыть мир.');
    await refreshLocal();
    setMessage({ tone: 'success', text: 'Мир открыт.' });
    onOpen?.();
  });
  const openGame = (world: StoredWorldSummary, game: StoredGameSummary) => run(game.id, async () => {
    if (!world.active && !await persistenceService.switchStoredWorld(world.id)) throw new Error('Не удалось открыть мир.');
    if (!await persistenceService.switchStoredGame(game.id)) throw new Error('Не удалось открыть игру.');
    await refreshLocal();
    setMessage({ tone: 'success', text: 'Игра открыта.' });
    onOpen?.();
  });
  const renameWorld = async (world: StoredWorldSummary) => {
    const name = window.prompt('Название мира', world.name);
    if (!name) return;
    await run(`rename:${world.id}`, async () => {
      if (!await persistenceService.renameStoredWorld(world.id, name)) throw new Error('Не удалось переименовать мир.');
      await refreshLocal();
    });
  };
  const saveToServer = (world: StoredWorldSummary) => run(`backup:${world.id}`, async () => {
    if (!worldBackupService) throw new Error('Серверные копии недоступны.');
    await worldBackupService.save(world);
    await refreshServer();
    setMessage({ tone: 'success', text: `Мир «${world.name}» сохранён на сервере.` });
  });
  const restoreFromServer = (world: ServerWorldSummary) => run(`restore:${world.id}`, async () => {
    if (!worldBackupService) throw new Error('Серверные копии недоступны.');
    await worldBackupService.restore(world.id);
    await refreshLocal();
    setMessage({ tone: 'success', text: `Мир «${world.name}» скачан на устройство.` });
  });
  const importFile = async (event: Event, kind: 'world' | 'game') => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await run(`import-${kind}`, async () => {
      if (kind === 'game') {
        const world = worlds.find((item) => item.id === gameImportWorldId);
        if (!world) throw new Error('Мир для импорта не найден.');
        if (!world.active && !await persistenceService.switchStoredWorld(world.id)) throw new Error('Не удалось открыть мир.');
      }
      const result = await importExportService.importFile(file, kind === 'game'
        ? { asNewGame: true, regenerateGameId: true, expectedKind: 'game' }
        : { expectedKind: 'world', gameAsNewWorld: true });
      if (!result.ok) throw new Error(result.message);
      await refreshLocal();
      setMessage({ tone: 'success', text: kind === 'game' ? `Игра импортирована: ${file.name}` : `Мир импортирован: ${file.name}` });
    });
    input.value = '';
    setGameImportWorldId('');
  };
  const removePending = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    await run(`delete:${target.item.id}`, async () => {
      if (target.kind === 'server') {
        if (!worldBackupService) throw new Error('Серверные копии недоступны.');
        await worldBackupService.remove(target.item.id);
        await refreshServer();
        setMessage({ tone: 'success', text: 'Серверная копия удалена.' });
      } else if (target.kind === 'world') {
        if (!await persistenceService.removeStoredWorld(target.item.id)) throw new Error('Не удалось удалить мир.');
        await refreshLocal();
        setMessage({ tone: 'success', text: 'Мир удалён.' });
      } else {
        if (!await persistenceService.removeStoredGame(target.item.id)) throw new Error('Не удалось удалить игру.');
        await refreshLocal();
        setMessage({ tone: 'success', text: 'Игра удалена.' });
      }
    });
  };
  const serverEnabled = auth.status === 'signedIn' && Boolean(worldBackupService);

  return (
    <section className={styles.root} aria-label="Миры">
      <section className={styles.section} aria-labelledby="local-worlds-title">
        <SectionHeader
          title={<span id="local-worlds-title">Миры на устройстве</span>}
          subtitle="Игры одного мира используют общие материалы и файлы"
          actions={(
            <Toolbar className={styles.actions} aria-label="Действия с мирами">
              <Button size="sm" disabled={busyId === 'new-world'} iconBefore={<Plus size={15} aria-hidden="true" />} onClick={() => void createWorld()}>Новый мир</Button>
              <Button size="sm" disabled={busyId === 'import-world'} iconBefore={<Upload size={15} aria-hidden="true" />} onClick={() => worldImportRef.current?.click()}>Импорт</Button>
            </Toolbar>
          )}
        />
        <div className={styles.worlds}>
          {worlds.map((world) => (
            <Surface className={styles.world} key={world.id} tone="subtle" padding="sm">
              <ListItem
                density="compact"
                lines={2}
                tone={world.active ? 'featured' : 'default'}
                title={<span className={`${styles.title} ${styles.worldTitle}`}>{world.name || 'Без названия'}{world.active && <Badge size="xs" tone="gold">Текущий</Badge>}</span>}
                subtitle={`${world.gameCount} ${world.gameCount === 1 ? 'игра' : 'игр'}${world.updatedAt ? ` · ${formatDateTime(world.updatedAt)}` : ''}`}
                leftAccessory={<Globe2 size={17} aria-hidden="true" />}
                rightAccessory={(
                  <Toolbar className={styles.rowActions}>
                    {serverEnabled && <Button size="xs" disabled={busyId === `backup:${world.id}`} iconBefore={<CloudUpload size={14} aria-hidden="true" />} onClick={() => void saveToServer(world)}>На сервер</Button>}
                    {!world.active && <Button size="xs" disabled={busyId === world.id} onClick={() => void openWorld(world)}>Открыть</Button>}
                    <ActionMenu
                      ariaLabel={`Действия с миром ${world.name || 'Без названия'}`}
                      items={[
                        { id: 'new-game', label: 'Новая игра', icon: <Plus size={14} />, onSelect: () => void createGame(world) },
                        { id: 'import-game', label: 'Импорт игры', icon: <Upload size={14} />, onSelect: () => { setGameImportWorldId(world.id); gameImportRef.current?.click(); } },
                        { id: 'rename', label: 'Переименовать', onSelect: () => void renameWorld(world) },
                        { id: 'export', label: 'Экспортировать', icon: <Download size={14} />, onSelect: () => void importExportService.downloadWorldArchive(world.id) },
                        { id: 'delete', label: 'Удалить с устройства', icon: <Trash2 size={14} />, onSelect: () => setPendingDelete({ kind: 'world', item: world }) }
                      ]}
                      renderTrigger={(props) => <IconButton {...props} variant="ghost" size="sm" title="Ещё" aria-label={`Действия с миром ${world.name || 'Без названия'}`}><Ellipsis size={15} aria-hidden="true" /></IconButton>}
                    />
                  </Toolbar>
                )}
              />
              <div className={styles.games} aria-label={`Игры мира ${world.name || 'Без названия'}`}>
                {world.games.map((game) => (
                  <ListItem
                    className={styles.game}
                    density="compact"
                    key={game.id}
                    tone={game.active ? 'featured' : 'default'}
                    title={<span className={`${styles.title} ${styles.gameTitle}`}>{game.name || 'Без названия'}{game.active && <Badge size="xs" tone="gold">Текущая</Badge>}</span>}
                    subtitle={game.updatedAt ? formatDateTime(game.updatedAt) : 'Без сохранения'}
                    leftAccessory={<FolderOpen size={15} aria-hidden="true" />}
                    rightAccessory={(
                      <Toolbar className={styles.rowActions}>
                        {!game.active && <Button size="xs" disabled={busyId === game.id} onClick={() => void openGame(world, game)}>Открыть</Button>}
                        {world.active && (
                          <ActionMenu
                            ariaLabel={`Действия с игрой ${game.name || 'Без названия'}`}
                            items={[{ id: 'delete', label: 'Удалить', icon: <Trash2 size={14} />, onSelect: () => setPendingDelete({ kind: 'game', item: game }) }]}
                            renderTrigger={(props) => <IconButton {...props} variant="ghost" size="sm" title="Ещё" aria-label={`Действия с игрой ${game.name || 'Без названия'}`}><Ellipsis size={15} aria-hidden="true" /></IconButton>}
                          />
                        )}
                      </Toolbar>
                    )}
                  />
                ))}
              </div>
            </Surface>
          ))}
          {worlds.length === 0 && <EmptyState className={styles.empty} size="sm" title="Миров пока нет" body="Создайте новый мир или импортируйте архив." />}
        </div>
      </section>

      {serverEnabled && (
        <section className={styles.section} aria-labelledby="server-worlds-title">
          <SectionHeader title={<span id="server-worlds-title">Миры на сервере</span>} subtitle="Резервные копии без автоматической синхронизации" />
          <div className={styles.serverWorlds}>
            {serverWorlds.map((world) => (
              <ListItem
                density="compact"
                lines={2}
                key={world.id}
                title={world.name}
                subtitle={`${world.gameCount} ${world.gameCount === 1 ? 'игра' : 'игр'}${world.updatedAt ? ` · ${formatDateTime(world.updatedAt)}` : ''}${world.byteSize ? ` · ${formatBytes(world.byteSize)}` : ''}`}
                leftAccessory={<CloudDownload size={17} aria-hidden="true" />}
                rightAccessory={(
                  <Toolbar className={styles.rowActions}>
                    <Button size="xs" disabled={busyId === `restore:${world.id}`} iconBefore={<CloudDownload size={14} aria-hidden="true" />} onClick={() => void restoreFromServer(world)}>Скачать</Button>
                    <ActionMenu
                      ariaLabel={`Действия с серверной копией ${world.name}`}
                      items={[{ id: 'delete', label: 'Удалить с сервера', icon: <Trash2 size={14} />, onSelect: () => setPendingDelete({ kind: 'server', item: world }) }]}
                      renderTrigger={(props) => <IconButton {...props} variant="ghost" size="sm" title="Ещё" aria-label={`Действия с серверной копией ${world.name}`}><Ellipsis size={15} aria-hidden="true" /></IconButton>}
                    />
                  </Toolbar>
                )}
              />
            ))}
            {serverWorlds.length === 0 && <EmptyState className={styles.empty} size="sm" title="Копий пока нет" body="Сохраните локальный мир на сервере." />}
          </div>
        </section>
      )}

      <input ref={worldImportRef} hidden type="file" accept="application/json,application/zip,.json,.zip,.dhworld,.dhgame" onChange={(event) => void importFile(event, 'world')} />
      <input ref={gameImportRef} hidden type="file" accept="application/json,application/zip,.json,.zip,.dhgame" onChange={(event) => void importFile(event, 'game')} />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {pendingDelete && (
        <ConfirmDialog
          title={`Удалить ${pendingDelete.kind === 'game' ? 'игру' : pendingDelete.kind === 'server' ? 'серверную копию' : 'мир'} «${pendingDelete.item.name || 'Без названия'}»?`}
          body={pendingDelete.kind === 'server'
            ? 'Локальный мир останется на устройстве.'
            : pendingDelete.kind === 'world'
              ? 'Все игры и общие материалы мира будут удалены с этого устройства.'
              : 'Игра будет удалена с этого устройства.'}
          confirmLabel="Удалить"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void removePending()}
        />
      )}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Операция не выполнена.';
}
