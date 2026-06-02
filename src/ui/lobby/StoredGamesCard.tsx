/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';
import { Download, Trash2, Upload } from 'lucide-react';
import { useStore } from '../../core/hooks/useStore';
import { formatDateTime } from '../../core/utils/date';
import { importExportService, persistenceService } from '../../services/serviceRegistry';
import type { StoredGameSummary } from '../../core/persistence/gameDocumentStore';

export function StoredGamesCard() {
  const storedGames = useStore(persistenceService.storedGamesStore);
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
      <section className="role-entry__card role-entry__games-card" aria-label="Управление сохранениями">
        <header>
          <Download size={20} />
          <div>
            <strong>Сохранения</strong>
          </div>
          <div className="role-entry__storage-tools">
            <button className="dh-button" type="button" onClick={() => void createStoredGame()}>
              Новая
            </button>
            <button className="dh-button" type="button" title={activeStoredGame ? 'Импорт заменит текущую открытую игру' : 'Импортировать игру'} onClick={() => importFileRef.current?.click()}>
              <Upload size={15} />
              Импорт
            </button>
            {activeStoredGame && (
              <button className="dh-button" type="button" onClick={() => void importExportService.downloadArchive()}>
                <Download size={15} />
                Экспорт
              </button>
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
                  <button type="button" onClick={() => void switchStoredGame(game.id)}>
                    Открыть
                  </button>
                )}
                <button className="role-entry__icon-action" type="button" title="Удалить игру" aria-label={`Удалить игру ${game.name || 'Без названия'}`} onClick={() => void removeStoredGame(game)}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
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
      </section>
    </>
  );
}
