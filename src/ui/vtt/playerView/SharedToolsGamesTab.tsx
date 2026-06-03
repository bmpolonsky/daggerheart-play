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
import { Button } from '../../components/common/Button';
import { IconButton } from '../../components/common/IconButton';
import { Surface } from '../../components/common/Surface';

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
          <Button size="sm" type="button" disabled={busyGameId === 'new'} iconBefore={<Plus size={15} aria-hidden="true" />} onClick={() => void createGame()}>
            Новая
          </Button>
          <Button size="sm" type="button" iconBefore={<Upload size={15} aria-hidden="true" />} onClick={() => importFileRef.current?.click()}>
            Импорт
          </Button>
          <Button variant="primary" size="sm" type="button" iconBefore={<Download size={15} aria-hidden="true" />} onClick={() => void importExportService.downloadArchive()}>
            Экспорт
          </Button>
        </div>
      </header>

      <div className="player-tools-game-list">
        {games.map((storedGame) => (
          <Surface as="article" tone="subtle" className={storedGame.active ? 'player-tools-game-row dh-is-active' : 'player-tools-game-row'} key={storedGame.id}>
            <div>
              <strong>{storedGame.name || 'Без названия'}</strong>
              <span>{storedGame.updatedAt ? formatDateTime(storedGame.updatedAt) : 'Без сохранения'}</span>
            </div>
            <div className="player-tools-game-row__actions">
              <Button size="sm" type="button" disabled={storedGame.active || busyGameId === storedGame.id} iconBefore={<FolderOpen size={15} aria-hidden="true" />} onClick={() => void openGame(storedGame.id)}>
                {storedGame.active ? 'Открыта' : 'Открыть'}
              </Button>
              <IconButton variant="ghost" size="sm" type="button" title="Удалить игру" aria-label={`Удалить игру ${storedGame.name || 'Без названия'}`} disabled={busyGameId === storedGame.id} onClick={() => void removeGame(storedGame)}>
                <Trash2 size={15} aria-hidden="true" />
              </IconButton>
            </div>
          </Surface>
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
