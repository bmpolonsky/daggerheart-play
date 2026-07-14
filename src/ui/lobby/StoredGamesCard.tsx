/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { Download, Trash2, Upload } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { formatDateTime } from '../../core/utils/date';
import { importExportService, persistenceService } from '../../services/serviceRegistry';
import { Button, ConfirmDialog, EmptyState, IconButton, ListItem, SectionHeader, Surface, Toolbar } from '../components/common';
import type { StoredGameSummary } from '../../core/persistence/gameDocumentStore';

export function StoredGamesCard() {
  const storedGames = useStream(persistenceService.storedGames$);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredGameSummary | null>(null);
  const activeStoredGame = storedGames.find((game) => game.active) ?? null;

  useEffect(() => {
    void persistenceService.refreshStoredGames();
  }, []);

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
          {storedGames.length === 0 && <EmptyState size="sm" title="Сохранений пока нет" body="Они появятся здесь после первого изменения игры." />}
        </div>
        <input
          ref={importFileRef}
          hidden
          type="file"
          accept="application/json,application/zip,.json,.zip,.dhgame"
          onChange={importGameFile}
        />
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
    </>
  );
}
