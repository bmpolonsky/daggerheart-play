/** @jsxImportSource preact */
import { Ellipsis, NotebookPen, Settings, Trash2 } from 'lucide-react';
import { useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import { feedService } from '../../../services/serviceRegistry';
import { P2PHealthIndicator } from '../../p2p/P2PHealthIndicator';
import { ActionMenu, ConfirmDialog, IconButton } from '../../components/common';
import { playerViewUi$, playerViewUiActions } from './playerViewUiState';
import type { SharedToolsTab, TableViewRole } from './types';

export function PlayerRailHeaderActions({ role, onOpenTool }: { role: TableViewRole; onOpenTool?: (tab: SharedToolsTab) => void }) {
  const [clearChronicleOpen, setClearChronicleOpen] = useState(false);
  const feed = useStream(feedService.feed$);
  const { ephemeralFeedItem } = useStream(playerViewUi$);
  const hasClearableActivity = feed.length > 0 || Boolean(ephemeralFeedItem);

  return (
    <>
      <div className="player-chronicle-header__actions">
        <P2PHealthIndicator placement="chronicle" role={role} roomControls />
        {role === 'gm' && (
          <ActionMenu
            ariaLabel="Ещё"
            items={[
              {
                id: 'notes',
                label: 'Заметки',
                icon: <NotebookPen size={15} />,
                onSelect: () => onOpenTool?.('notes')
              },
              {
                id: 'settings',
                label: 'Настройки',
                icon: <Settings size={15} />,
                onSelect: () => onOpenTool?.('settings')
              },
              {
                id: 'clear-chronicle',
                label: 'Очистить чат',
                icon: <Trash2 size={15} />,
                disabled: !hasClearableActivity,
                onSelect: () => setClearChronicleOpen(true)
              }
            ]}
            renderTrigger={(props) => (
              <IconButton {...props} variant="ghost" size="sm" title="Ещё" aria-label="Ещё">
                <Ellipsis size={15} aria-hidden="true" />
              </IconButton>
            )}
          />
        )}
      </div>
      {clearChronicleOpen && (
        <ConfirmDialog
          title="Очистить чат?"
          body="Все сообщения, опубликованные броски и события будут удалены. Это действие нельзя отменить."
          confirmLabel="Очистить"
          onCancel={() => setClearChronicleOpen(false)}
          onConfirm={() => {
            setClearChronicleOpen(false);
            feedService.clear();
            playerViewUiActions.setEphemeralFeedItem(null);
          }}
        />
      )}
    </>
  );
}
