/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { Download, FolderOpen, Plus, Trash2, Upload } from 'lucide-react';
import { useStream } from '../../../core/hooks/useStream';
import { formatDateTime } from '../../../core/utils/date';
import type { StoredGameSummary } from '../../../core/persistence/gameDocumentStore';
import {
  importExportService,
  persistenceService
} from '../../../services/serviceRegistry';

export function SharedToolsGamesTab() {
  const games = useStream(persistenceService.storedGames$);
  const [message, setMessage] = useState('');
  const [busyGameId, setBusyGameId] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void persistenceService.refreshStoredGames();
  }, []);

  const createGame = async () => {
    setBusyGameId('new');
    const id = await persistenceService.createStoredGame();
    setMessage(id ? 'Новая игра создана.' : 'Не удалось создать игру.');
    await persistenceService.refreshStoredGames();
    setBusyGameId(null);
  };

  const openGame = async (gameId: string) => {
    setBusyGameId(gameId);
    const ok = await persistenceService.switchStoredGame(gameId);
    setMessage(ok ? 'Игра открыта.' : 'Не удалось открыть игру.');
    await persistenceService.refreshStoredGames();
    setBusyGameId(null);
  };

  const removeGame = async (storedGame: StoredGameSummary) => {
    const name = storedGame.name || 'Без названия';
    if (!window.confirm(`Удалить игру "${name}" из локального хранилища?`)) return;
    setBusyGameId(storedGame.id);
    const ok = await persistenceService.removeStoredGame(storedGame.id);
    setMessage(ok ? 'Игра удалена.' : 'Не удалось удалить игру.');
    await persistenceService.refreshStoredGames();
    setBusyGameId(null);
  };

  const importGameFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await importExportService.importFile(file);
      setMessage(result.ok ? `Игра импортирована: ${file.name}` : result.message);
      await persistenceService.refreshStoredGames();
    } catch {
      setMessage('Не удалось прочитать файл импорта.');
    } finally {
      input.value = '';
    }
  };

  return (
    <section className="player-tools-games-section">
      <header>
        <strong>Игры проекта</strong>
        <div className="player-tools-actions">
          <button className="dh-button" type="button" disabled={busyGameId === 'new'} onClick={() => void createGame()}>
            <Plus size={15} />
            Новая
          </button>
          <button className="dh-button" type="button" onClick={() => importFileRef.current?.click()}>
            <Upload size={15} />
            Импорт
          </button>
          <button className="dh-button dh-variant-primary" type="button" onClick={() => void importExportService.downloadArchive()}>
            <Download size={15} />
            Экспорт
          </button>
        </div>
      </header>

      <div className="player-tools-game-list">
        {games.map((storedGame) => (
          <article className={storedGame.active ? 'player-tools-game-row dh-is-active' : 'player-tools-game-row'} key={storedGame.id}>
            <div>
              <strong>{storedGame.name || 'Без названия'}</strong>
              <span>{storedGame.updatedAt ? formatDateTime(storedGame.updatedAt) : 'Без сохранения'}</span>
            </div>
            <div className="player-tools-game-row__actions">
              <button type="button" disabled={storedGame.active || busyGameId === storedGame.id} onClick={() => void openGame(storedGame.id)}>
                <FolderOpen size={15} />
                {storedGame.active ? 'Открыта' : 'Открыть'}
              </button>
              <button type="button" title="Удалить игру" disabled={busyGameId === storedGame.id} onClick={() => void removeGame(storedGame)}>
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
        {games.length === 0 && <p className="player-tools-empty">Сохраненные игры появятся здесь после первого изменения.</p>}
      </div>

      <input
        ref={importFileRef}
        className="visually-hidden"
        type="file"
        accept="application/json,application/zip,.json,.zip,.dhgame"
        onChange={importGameFile}
      />
      {message && <p className="player-tools-status">{message}</p>}
    </section>
  );
}
