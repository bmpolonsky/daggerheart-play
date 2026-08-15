/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { Download, Ellipsis, HardDrive, Plus, Trash2, Upload, X } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { formatDateTime } from '../../core/utils/date';
import type { StoredGameSummary } from '../../core/persistence/gameDocumentStore';
import { importExportService, persistenceService } from '../../services/serviceRegistry';
import { ActionMenu, Badge, Button, ConfirmDialog, EmptyState, IconButton, ListItem, Notice, SectionHeader, Surface, Toolbar } from '../components/common';

export function StoredGamesCard({ onClose }: { onClose: () => void }) {
  const games = useStream(persistenceService.storedGames$);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredGameSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { void persistenceService.refreshStoredGames(); }, []);

  const importGameFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await importExportService.importFile(file, { asNewGame: true, regenerateGameId: true });
      if (!result.ok) setMessage(result.message);
      else {
        await persistenceService.refreshStoredGames();
        onClose();
      }
    } catch {
      setMessage('Не удалось импортировать игру.');
    } finally {
      input.value = '';
    }
  };

  const createGame = async () => {
    if (await persistenceService.createStoredGame()) {
      await persistenceService.refreshStoredGames();
      onClose();
    }
  };
  const openGame = async (game: StoredGameSummary, close = true) => {
    if (!game.active && await persistenceService.switchStoredGame(game.id)) {
      await persistenceService.refreshStoredGames();
      if (close) onClose();
    }
  };
  const exportGame = async (game: StoredGameSummary) => {
    await openGame(game, false);
    await importExportService.downloadArchive();
  };
  const removeGame = async (game: StoredGameSummary) => {
    if (await persistenceService.removeStoredGame(game.id)) await persistenceService.refreshStoredGames();
  };

  return (
    <>
      <Surface className="role-entry__card role-entry__games-card" aria-label="Игры">
        <SectionHeader title="Игры" subtitle="На этом устройстве" actions={(
          <IconButton autoFocus size="sm" variant="ghost" title="Закрыть" aria-label="Закрыть игры" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        )} />
        <Toolbar className="role-entry__storage-tools">
          <Button grow size="sm" iconBefore={<Plus size={15} aria-hidden="true" />} onClick={() => void createGame()}>Новая</Button>
          <Button grow size="sm" iconBefore={<Upload size={15} aria-hidden="true" />} onClick={() => importFileRef.current?.click()}>Импорт</Button>
        </Toolbar>
        <div className="role-entry__game-list">
          {games.map((game) => (
            <ListItem
              key={game.id}
              align="start"
              lines={2}
              title={game.name || 'Без названия'}
              subtitle={<Badge size="xs" tone="neutral">На устройстве</Badge>}
              detail={game.updatedAt ? formatDateTime(game.updatedAt) : 'Без сохранения'}
              tone={game.active ? 'featured' : 'default'}
              leftAccessory={<HardDrive size={17} aria-hidden="true" />}
              rightAccessory={<Toolbar className="role-entry__game-actions">
                {!game.active && <Button size="xs" onClick={() => void openGame(game)}>Открыть</Button>}
                <ActionMenu
                  ariaLabel={`Действия с игрой ${game.name || 'Без названия'}`}
                  items={[
                    { id: 'export', label: 'Экспорт', icon: <Download size={14} />, onSelect: () => void exportGame(game) },
                    { id: 'delete', label: 'Удалить с устройства', icon: <Trash2 size={14} />, onSelect: () => setPendingDelete(game) }
                  ]}
                  renderTrigger={(props) => <IconButton {...props} variant="ghost" size="sm" title="Ещё" aria-label="Другие действия"><Ellipsis size={15} aria-hidden="true" /></IconButton>}
                />
              </Toolbar>}
            />
          ))}
          {games.length === 0 && <EmptyState size="sm" title="Игр пока нет" body="Создайте новую игру или импортируйте архив." />}
        </div>
        <input ref={importFileRef} hidden type="file" accept="application/json,application/zip,.json,.zip,.dhgame" onChange={importGameFile} />
        {message && <Notice tone="error">{message}</Notice>}
      </Surface>
      {pendingDelete && (
        <ConfirmDialog
          title={`Удалить «${pendingDelete.name}» с устройства?`}
          body="Локальная игра будет удалена с этого устройства."
          confirmLabel="Удалить"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { const game = pendingDelete; setPendingDelete(null); void removeGame(game); }}
        />
      )}
    </>
  );
}
