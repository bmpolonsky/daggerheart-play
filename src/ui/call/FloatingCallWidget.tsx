/** @jsxImportSource preact */
import { useMemo, useState } from 'preact/hooks';
import { Expand, Hand, Mic, MicOff, Minus, Phone, Video, VideoOff } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { mediaCallService, p2pSessionService } from '../../services/serviceRegistry';
import type { CallParticipant } from '../../services/MediaCallService';
import { DraggableSurface, IconButton, Toolbar } from '../components/common';
import { MediaStreamVideo } from './MediaStreamVideo';
import './call-room.css';

export function FloatingCallWidget() {
  const call = useStream(mediaCallService.call$);
  const session = useStream(p2pSessionService.session$);
  const [collapsed, setCollapsed] = useState(false);
  const connectedToCall = call.active && session.connected && Boolean(session.roomId) && call.roomId === session.roomId;
  const remoteParticipants = useMemo(() => Object.values(call.remoteParticipants).filter((participant) => participant.connected), [call.remoteParticipants]);
  const featured = remoteParticipants.find((participant) => participant.stream && !participant.cameraOff) ?? remoteParticipants[0] ?? null;

  if (!connectedToCall) return null;

  const openCallRoom = () => {
    window.dispatchEvent(new CustomEvent('daggerheart-play:navigate-route', {
      detail: { route: 'call', roomId: session.roomId }
    }));
  };

  return (
    <DraggableSurface
      className={`floating-call ${collapsed ? 'dh-is-collapsed' : ''}`}
      aria-label="Видео звонок"
      title={(
        <>
          <Phone size={15} aria-hidden="true" />
          <strong>{remoteParticipants.length + 1}</strong>
        </>
      )}
      actions={(
        <Toolbar className="floating-call__window-actions">
          <IconButton type="button" size="xs" variant="ghost" title={collapsed ? 'Показать звонок' : 'Свернуть звонок'} aria-label={collapsed ? 'Показать звонок' : 'Свернуть звонок'} onClick={() => setCollapsed((value) => !value)}>
            <Minus size={13} aria-hidden="true" />
          </IconButton>
          <IconButton type="button" size="xs" variant="ghost" title="Открыть звонок" aria-label="Открыть звонок" onClick={openCallRoom}>
            <Expand size={13} aria-hidden="true" />
          </IconButton>
        </Toolbar>
      )}
      defaultPosition={floatingCallDefaultPosition}
      bounds={{ top: 12, right: 12, bottom: 78, left: 12 }}
    >
      {!collapsed && (
        <>
          <div className="floating-call__videos">
            <FloatingVideo participant={featured} fallbackName="Звонок" />
            <FloatingVideo participant={{
              type: 'callPresence',
              participantId: call.localParticipantId,
              displayName: call.displayName || 'Вы',
              role: call.role,
              connected: true,
              micMuted: call.micMuted,
              cameraOff: call.cameraOff,
              handRaised: call.handRaised,
              updatedAt: '',
              stream: call.localStream
            }} local fallbackName="Вы" />
          </div>
          <Toolbar className="floating-call__controls">
            <IconButton type="button" size="sm" tone={call.micMuted ? 'neutral' : 'green'} title={call.micMuted ? 'Включить микрофон' : 'Выключить микрофон'} aria-label={call.micMuted ? 'Включить микрофон' : 'Выключить микрофон'} onClick={() => void mediaCallService.toggleMicrophone()}>
              {call.micMuted ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
            </IconButton>
            <IconButton type="button" size="sm" tone={call.cameraOff ? 'neutral' : 'green'} title={call.cameraOff ? 'Включить камеру' : 'Выключить камеру'} aria-label={call.cameraOff ? 'Включить камеру' : 'Выключить камеру'} onClick={() => void mediaCallService.toggleCamera()}>
              {call.cameraOff ? <VideoOff size={15} aria-hidden="true" /> : <Video size={15} aria-hidden="true" />}
            </IconButton>
            <IconButton type="button" size="sm" tone={call.handRaised ? 'gold' : 'neutral'} title={call.handRaised ? 'Опустить руку' : 'Поднять руку'} aria-label={call.handRaised ? 'Опустить руку' : 'Поднять руку'} onClick={() => void mediaCallService.toggleHand()}>
              <Hand size={15} aria-hidden="true" />
            </IconButton>
          </Toolbar>
        </>
      )}
    </DraggableSurface>
  );
}

function floatingCallDefaultPosition() {
  if (typeof window === 'undefined') return { x: 980, y: 640 };
  const sidecarOffset = readVttSidecarOffset();
  return {
    x: Math.max(12, window.innerWidth - sidecarOffset - 338),
    y: Math.max(12, window.innerHeight - 316)
  };
}

function readVttSidecarOffset(): number {
  if (typeof document === 'undefined' || window.innerWidth < 960) return 0;
  const sidePanel = document.querySelector('[data-vtt-side-panel]');
  if (sidePanel) {
    const style = getComputedStyle(sidePanel);
    const rect = sidePanel.getBoundingClientRect();
    if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0) {
      return Math.max(0, window.innerWidth - rect.left + 18);
    }
  }
  const vttRoot = document.querySelector('[data-vtt-root]');
  if (!vttRoot) return 0;
  const sidecarWidth = Number.parseFloat(getComputedStyle(vttRoot).getPropertyValue('--dh-sidecar-width'));
  return Number.isFinite(sidecarWidth) ? sidecarWidth + 30 : 0;
}

function FloatingVideo({ fallbackName, local = false, participant }: { fallbackName: string; local?: boolean; participant: CallParticipant | null }) {
  const name = participant?.displayName || fallbackName;
  return (
    <article className={`floating-call__video ${local ? 'dh-is-local' : ''}`.trim()}>
      {participant?.stream && !participant.cameraOff ? (
        <MediaStreamVideo key={mediaStreamRenderKey(participant.stream)} muted={local} stream={participant.stream} />
      ) : (
        <span>{initials(name)}</span>
      )}
      <small>{name}</small>
    </article>
  );
}

function mediaStreamRenderKey(stream: MediaStream): string {
  return `${stream.id}:${stream.getVideoTracks().map((track) => track.id).join(',')}`;
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
