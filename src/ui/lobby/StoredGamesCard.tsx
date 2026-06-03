/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';
import { Download, Trash2, Upload } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { formatDateTime } from '../../core/utils/date';
import { importExportService, persistenceService } from '../../services/serviceRegistry';
import { Button } from '../components/common/Button';
import { IconButton } from '../components/common/IconButton';
import { Surface } from '../components/common/Surface';
import type { StoredGameSummary } from '../../core/persistence/gameDocumentStore';

export function StoredGamesCard() {
  const storedGames = useStream(persistenceService.storedGames$);
  const importFileRef = useRef<HTMLInputElement | null>(null);
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
    const name = game.name || 'Без названия';
    const confirmed = window.confirm(`Удалить игру "${name}" из локального хранилища?`);
    if (!confirmed) return;
    const ok = await persistenceService.removeStoredGame(game.id);
    if (!ok) return;
    await persistenceService.refreshStoredGames();
  };

  return (
    <>
      <Surface className="role-entry__card role-entry__games-card" aria-label="Управление сохранениями">
        <header>
          <Download size={20} />
          <div>
            <strong>Сохранения</strong>
          </div>
          <div className="role-entry__storage-tools">
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
          </div>
        </header>
        <div className="role-entry__game-list">
          {storedGames.map((game) => (
            <article className={game.active ? 'dh-is-active' : ''} key={game.id}>
              <div>
                <strong>{game.name || 'Без названия'}</strong>
                <span>{game.updatedAt ? formatDateTime(game.updatedAt) : 'Без сохранения'}</span>
              </div>
              <div className="role-entry__game-actions">
                {!game.active && (
                  <Button size="sm" type="button" onClick={() => void switchStoredGame(game.id)}>
                    Открыть
                  </Button>
                )}
                <IconButton className="role-entry__icon-action" variant="ghost" size="sm" type="button" title="Удалить игру" aria-label={`Удалить игру ${game.name || 'Без названия'}`} onClick={() => void removeStoredGame(game)}>
                  <Trash2 size={14} aria-hidden="true" />
                </IconButton>
              </div>
            </article>
          ))}
          {storedGames.length === 0 && <p>Сохранения появятся здесь после первого изменения игры.</p>}
        </div>
        <input
          ref={importFileRef}
          className="visually-hidden"
          type="file"
          accept="application/json,application/zip,.json,.zip,.dhgame"
          onChange={importGameFile}
        />
      </Surface>
    </>
  );
}
