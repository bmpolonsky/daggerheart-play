/** @jsxImportSource preact */
import { Check, Copy, Ellipsis, Trash2 } from 'lucide-react';
import { useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import { feedService, p2pSessionService } from '../../../services/serviceRegistry';
import { P2PHealthIndicator } from '../../p2p/P2PHealthIndicator';
import { ActionMenu, ConfirmDialog, IconButton } from '../../components/common';
import { currentSettingsInviteContext } from './helpers';
import { playerViewUi$, playerViewUiActions } from './playerViewUiState';
import type { TableViewRole } from './types';

export function PlayerRailHeaderActions({ role }: { role: TableViewRole }) {
  const [inviteCopied, setInviteCopied] = useState(false);
  const [clearChronicleOpen, setClearChronicleOpen] = useState(false);
  const session = useStream(p2pSessionService.session$);
  const feed = useStream(feedService.feed$);
  const { ephemeralFeedItem } = useStream(playerViewUi$);
  const hasClearableActivity = feed.length > 0 || Boolean(ephemeralFeedItem);

  const copyInvite = async () => {
    const inviteUrl = p2pSessionService.previewInviteUrl(currentSettingsInviteContext());
    if (!inviteUrl) return;
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1600);
    try {
      await navigator.clipboard?.writeText(inviteUrl);
    } catch {
      // Keep the visible confirmation when Clipboard API is unavailable.
    }
  };

  return (
    <>
      <div className="player-chronicle-header__actions">
        {role === 'gm' && (
          <IconButton className={inviteCopied ? 'dh-is-copied' : ''} variant="ghost" size="sm" type="button" disabled={!session.roomId} title={inviteCopied ? 'Ссылка скопирована' : 'Копировать приглашение'} aria-label={inviteCopied ? 'Ссылка скопирована' : 'Копировать приглашение'} onClick={() => void copyInvite()}>
            {inviteCopied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          </IconButton>
        )}
        <P2PHealthIndicator placement="chronicle" role={role} />
        {role === 'gm' && (
          <ActionMenu
            ariaLabel="Другие действия хроники"
            items={[
              {
                id: 'clear-chronicle',
                label: 'Очистить хронику',
                icon: <Trash2 size={15} />,
                disabled: !hasClearableActivity,
                onSelect: () => setClearChronicleOpen(true)
              }
            ]}
            renderTrigger={(props) => (
              <IconButton {...props} variant="ghost" size="sm" title="Ещё" aria-label="Другие действия хроники">
                <Ellipsis size={15} aria-hidden="true" />
              </IconButton>
            )}
          />
        )}
      </div>
      {clearChronicleOpen && (
        <ConfirmDialog
          title="Очистить хронику?"
          body="Все сообщения, опубликованные броски и карточки хроники будут удалены. Это действие нельзя отменить."
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
