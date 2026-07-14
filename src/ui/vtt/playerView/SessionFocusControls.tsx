/** @jsxImportSource preact */
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { IconButton } from '../../components/common';
import type { P2PHealthSummary } from '../../p2p/P2PHealthIndicator';
import type { TableViewRole } from './types';

export function SessionFocusControls({
  activityOpen,
  connectionLabel,
  connectionTone,
  panelOpen,
  role,
  onActivityToggle,
  onPanelToggle
}: {
  activityOpen: boolean;
  connectionLabel: string;
  connectionTone: P2PHealthSummary['tone'];
  panelOpen: boolean;
  role: TableViewRole;
  onActivityToggle: () => void;
  onPanelToggle: () => void;
}) {
  const rightPanelLabel = role === 'gm' ? 'панель мастера' : 'лист персонажа';
  const chronicleCommand = activityOpen ? 'Скрыть хронику' : 'Открыть хронику';

  return (
    <div className="player-session-panel-toggles" aria-label="Боковые панели">
      <IconButton
        className={`player-session-panel-toggle player-session-panel-toggle--left ${activityOpen ? 'dh-is-open' : ''}`}
        variant="secondary"
        tone={activityOpen ? 'gold' : 'neutral'}
        size="sm"
        type="button"
        title={`${chronicleCommand} · ${connectionLabel}`}
        aria-label={`${chronicleCommand}. Соединение: ${connectionLabel}`}
        aria-pressed={activityOpen}
        onClick={onActivityToggle}
      >
        {activityOpen ? <PanelLeftClose size={17} aria-hidden="true" /> : <PanelLeftOpen size={17} aria-hidden="true" />}
        <span className={`player-connection-status-dot is-${connectionTone}`} aria-hidden="true" />
      </IconButton>
      <IconButton
        className={`player-session-panel-toggle player-session-panel-toggle--right ${panelOpen ? 'dh-is-open' : ''}`}
        variant="secondary"
        tone={panelOpen ? 'gold' : 'neutral'}
        size="sm"
        type="button"
        title={panelOpen ? `Скрыть ${rightPanelLabel}` : `Открыть ${rightPanelLabel}`}
        aria-label={panelOpen ? `Скрыть ${rightPanelLabel}` : `Открыть ${rightPanelLabel}`}
        aria-pressed={panelOpen}
        onClick={onPanelToggle}
      >
        {panelOpen ? <PanelRightClose size={17} aria-hidden="true" /> : <PanelRightOpen size={17} aria-hidden="true" />}
      </IconButton>
    </div>
  );
}
