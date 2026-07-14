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
import { Badge } from '../../components/common/Badge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { IconButton } from '../../components/common/IconButton';
import { ListItem } from '../../components/common/ListItem';
import { Toolbar } from '../../components/common/Toolbar';

export function SharedToolsGamesTab() {
  const games = useStream(persistenceService.storedGames$);
  const [message, setMessage] = useState('');
  const [busyGameId, setBusyGameId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StoredGameSummary | null>(null);
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
      <Toolbar className="player-tools-section-actions" aria-label="Действия с играми проекта">
          <Button size="sm" type="button" disabled={busyGameId === 'new'} iconBefore={<Plus size={15} aria-hidden="true" />} onClick={() => void createGame()}>
            Новая
          </Button>
          <Button size="sm" type="button" iconBefore={<Upload size={15} aria-hidden="true" />} onClick={() => importFileRef.current?.click()}>
            Импорт
          </Button>
          <Button variant="primary" size="sm" type="button" iconBefore={<Download size={15} aria-hidden="true" />} onClick={() => void importExportService.downloadArchive()}>
            Экспорт
          </Button>
      </Toolbar>

      <div className="player-tools-game-list">
        {games.map((storedGame) => (
          <ListItem
            className={storedGame.active ? 'player-tools-game-row dh-is-active' : 'player-tools-game-row'}
            key={storedGame.id}
            title={storedGame.name || 'Без названия'}
            subtitle={storedGame.updatedAt ? formatDateTime(storedGame.updatedAt) : 'Без сохранения'}
            leftAccessory={storedGame.active ? <Badge tone="gold">Текущая</Badge> : <FolderOpen size={16} aria-hidden="true" />}
            rightAccessory={<div className="player-tools-game-row__actions">
              <Button size="sm" type="button" disabled={storedGame.active || busyGameId === storedGame.id} iconBefore={<FolderOpen size={15} aria-hidden="true" />} onClick={() => void openGame(storedGame.id)}>
                {storedGame.active ? 'Открыта' : 'Открыть'}
              </Button>
              <IconButton variant="ghost" size="sm" type="button" title="Удалить игру" aria-label={`Удалить игру ${storedGame.name || 'Без названия'}`} disabled={busyGameId === storedGame.id} onClick={() => setPendingDelete(storedGame)}>
                <Trash2 size={15} aria-hidden="true" />
              </IconButton>
            </div>}
          />
        ))}
        {games.length === 0 && <EmptyState tone="transparent" title="Сохранённых игр пока нет" body="Они появятся после первого изменения кампании." />}
      </div>

      <input
        ref={importFileRef}
        hidden
        type="file"
        accept="application/json,application/zip,.json,.zip,.dhgame"
        onChange={importGameFile}
      />
      {message && <p className="player-tools-status">{message}</p>}
      {pendingDelete && (
        <ConfirmDialog
          title={`Удалить игру «${pendingDelete.name || 'Без названия'}»?`}
          body="Локальное сохранение и все данные кампании будут удалены с этого устройства. Это действие нельзя отменить."
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const storedGame = pendingDelete;
            setPendingDelete(null);
            void removeGame(storedGame);
          }}
        />
      )}
    </section>
  );
}
