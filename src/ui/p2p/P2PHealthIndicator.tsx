/** @jsxImportSource preact */
import { createPortal } from 'preact/compat';
import { useMemo, useRef, useState } from 'preact/hooks';
import { Activity, Globe, X } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { gameService, p2pSessionService } from '../../services/serviceRegistry';
import type { P2PSessionState } from '../../services/P2PSessionService';
import type { P2PTransportPeerDiagnostic } from '../../services/p2p/P2PTransportAdapter';
import { Button, Dialog, IconButton } from '../components/common';
import { SharedToolsConnectionSettingsPanel, SharedToolsDiagnosticsSettingsPanel } from '../vtt/playerView/SharedToolsSettingsPanels';
import type { TableViewRole } from '../vtt/playerView/types';
import '../vtt/playerView/player-tools.css';
import './p2p-health-indicator.css';

export function P2PHealthIndicator({
  placement = 'floating',
  role,
  roomControls = false
}: {
  placement?: 'chronicle' | 'floating';
  role: TableViewRole;
  roomControls?: boolean;
}) {
  const session = useStream(p2pSessionService.session$);
  const game = useStream(gameService.game$);
  const [open, setOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const summary = useMemo(() => buildP2PHealthSummary(session), [session]);
  const statusLabel = summary.detail ? `${summary.label}. ${summary.detail}` : summary.label;
  const buttonLabel = roomControls
    ? `Сетевая игра: ${statusLabel}`
    : `Открыть диагностику соединения: ${statusLabel}`;
  const openDialog = (event: { currentTarget: EventTarget | null }) => {
    openerRef.current = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    setOpen(true);
  };
  const closeDialog = () => {
    setOpen(false);
    setDiagnosticsOpen(false);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };
  const roomDialog = open && roomControls && (
    <Dialog
      aria-label="Сетевая игра"
      className="p2p-health-dialog"
      title={<strong>Сетевая игра</strong>}
      actions={(
        <IconButton variant="ghost" size="sm" type="button" title="Закрыть" aria-label="Закрыть" onClick={closeDialog}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      )}
      onClose={closeDialog}
    >
      <SharedToolsConnectionSettingsPanel game={game} role={role} />
      <Button
        size="sm"
        type="button"
        variant="ghost"
        iconBefore={<Activity size={14} aria-hidden="true" />}
        onClick={() => setDiagnosticsOpen((current) => !current)}
      >
        {diagnosticsOpen ? 'Скрыть диагностику' : 'Диагностика'}
      </Button>
      {diagnosticsOpen && <SharedToolsDiagnosticsSettingsPanel role={role} compact />}
    </Dialog>
  );
  const diagnosticsDialog = open && !roomControls && (
    <Dialog
      aria-label="Диагностика соединения"
      className="p2p-health-dialog"
      title={<strong>Диагностика соединения</strong>}
      actions={(
        <IconButton variant="ghost" size="sm" type="button" title="Закрыть" aria-label="Закрыть" onClick={closeDialog}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      )}
      onClose={closeDialog}
    >
      <SharedToolsDiagnosticsSettingsPanel role={role} compact />
    </Dialog>
  );
  const dialog = roomDialog || diagnosticsDialog;

  return (
    <>
      {placement === 'chronicle' ? (
        <IconButton
          className={`p2p-health-indicator p2p-health-indicator--chronicle is-${summary.tone}`}
          variant="ghost"
          size="sm"
          type="button"
          title={`${summary.label}${summary.detail ? ` — ${summary.detail}` : ''}`}
          aria-label={buttonLabel}
          onClick={openDialog}
        >
          {roomControls ? <Globe size={15} aria-hidden="true" /> : <Activity size={15} aria-hidden="true" />}
        </IconButton>
      ) : (
        <Button
          className={`p2p-health-indicator is-${summary.tone}`}
          noWrap
          size="xs"
          type="button"
          variant="ghost"
          title={roomControls ? 'Сетевая игра' : 'Открыть диагностику соединения'}
          aria-label={buttonLabel}
          iconBefore={roomControls ? <Globe size={13} aria-hidden="true" /> : <Activity size={13} aria-hidden="true" />}
          onClick={openDialog}
        >
          <span className="p2p-health-indicator__label">{summary.label}</span>
          {summary.detail && <span className="p2p-health-indicator__detail">{summary.detail}</span>}
        </Button>
      )}
      {dialog && (typeof document === 'undefined' ? dialog : createPortal(dialog, document.body))}
    </>
  );
}

export type P2PHealthSummary = {
  label: string;
  detail: string;
  tone: 'idle' | 'waiting' | 'connecting' | 'ok' | 'degraded' | 'error';
};

export function buildP2PHealthSummary(session: P2PSessionState): P2PHealthSummary {
  const connectionCount = session.peers.length;
  if (session.status === 'disconnected' || !session.role) {
    return {
      label: 'Не подключено',
      detail: '',
      tone: 'idle'
    };
  }
  if (session.status === 'connecting') {
    return {
      label: `Подключаемся (${connectionCount})`,
      detail: '',
      tone: 'connecting'
    };
  }
  if (session.status === 'error') {
    return {
      label: 'Ошибка соединения',
      detail: '',
      tone: 'error'
    };
  }

  const pingMs = activePingMs(session.routePeers, session.peers);
  const pingText = pingMs === null ? '' : `${Math.round(pingMs)} мс`;

  if (session.status === 'degraded') {
    return {
      label: `Нестабильно (${connectionCount})`,
      detail: pingText,
      tone: 'degraded'
    };
  }
  if (session.peers.length === 0) {
    return {
      label: 'Ждем подключений (0)',
      detail: pingText,
      tone: 'waiting'
    };
  }
  const directPeerCount = session.directPeers?.filter((peerId) => session.peers.includes(peerId)).length ?? connectionCount;
  if (session.transportMode === 'hybrid' && directPeerCount < connectionCount) {
    return {
      label: `Подключено (${connectionCount})`,
      detail: '',
      tone: 'degraded'
    };
  }
  return {
    label: `Подключено (${connectionCount})`,
    detail: pingText,
    tone: 'ok'
  };
}

function activePingMs(routePeers: P2PTransportPeerDiagnostic[], peers: string[]): number | null {
  const visiblePeers = peers.length > 0
    ? routePeers.filter((peer) => peers.includes(peer.peerId))
    : routePeers.filter((peer) => peer.activeStrategy);
  const activeRoutes = visiblePeers.flatMap((peer) => peer.routes.filter((route) => route.status === 'active'));
  const pingValues = activeRoutes
    .map((route) => route.rttMs)
    .filter((value): value is number => value !== null);
  return pingValues.length === 0 ? null : Math.min(...pingValues);
}
