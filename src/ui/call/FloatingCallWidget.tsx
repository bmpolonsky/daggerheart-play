/** @jsxImportSource preact */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Expand, Hand, Mic, MicOff, Minus, Phone, PhoneOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { mediaCallService, p2pSessionService, playerActivationQueueService, sceneTableService } from '../../services/serviceRegistry';
import type { CallParticipant } from '../../services/MediaCallService';
import { DraggableSurface, IconButton, Toolbar } from '../components/common';
import { buildCallParticipants } from './callParticipants';
import { MediaStreamVideo } from './MediaStreamVideo';
import './call-room.css';

export function FloatingCallWidget() {
  const call = useStream(mediaCallService.call$);
  const session = useStream(p2pSessionService.session$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const activationQueue = useStream(playerActivationQueueService.queue$);
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 680px)').matches);
  const connectedToCall = call.active && session.connected && Boolean(session.roomId) && call.roomId === session.roomId;
  const participants = useMemo(() => buildCallParticipants({
    call,
    connectedToRoom: connectedToCall,
    sessionPeerId: session.peerId,
    tableParticipants: sceneTable.participants
  }).filter((participant) => participant.connected), [call, connectedToCall, sceneTable.participants, session.peerId]);
  const raisedIds = useMemo(() => new Set(activationQueue.flatMap((request) => [request.requesterId, request.actorId, request.requesterName ?? '', request.actorName])), [activationQueue]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 680px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

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
      title={<><Phone size={15} aria-hidden="true" /><strong>{participants.length}</strong></>}
      actions={(
        <Toolbar className="floating-call__window-actions">
          <IconButton size="xs" variant="ghost" title={collapsed ? 'Показать звонок' : 'Свернуть звонок'} aria-label={collapsed ? 'Показать звонок' : 'Свернуть звонок'} onClick={() => setCollapsed((value) => !value)}>
            <Minus size={13} aria-hidden="true" />
          </IconButton>
          <IconButton size="xs" variant="ghost" title="Развернуть звонок" aria-label="Развернуть звонок" onClick={openCallRoom}>
            <Expand size={13} aria-hidden="true" />
          </IconButton>
        </Toolbar>
      )}
      defaultPosition={floatingCallDefaultPosition}
      bounds={{ top: 12, right: 12, bottom: 78, left: 12 }}
      resizable={!mobile && !collapsed}
    >
      {!collapsed && (
        <>
          <div className="floating-call__videos">
            {participants.map((participant) => (
              <FloatingVideo
                key={participant.participantId}
                participant={participant}
                local={participant.participantId === call.localParticipantId || participant.peerId === session.peerId}
                handRaised={raisedIds.has(participant.participantId) || raisedIds.has(participant.displayName)}
              />
            ))}
          </div>
          <Toolbar className="floating-call__controls">
            <IconButton size="sm" tone={call.incomingAudioMuted || call.audioPlaybackBlocked ? 'gold' : 'neutral'} title={call.incomingAudioMuted || call.audioPlaybackBlocked ? 'Включить входящий звук' : 'Выключить входящий звук'} aria-label={call.incomingAudioMuted || call.audioPlaybackBlocked ? 'Включить входящий звук' : 'Выключить входящий звук'} onClick={() => void mediaCallService.toggleIncomingAudio()}>
              {call.incomingAudioMuted || call.audioPlaybackBlocked ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
            </IconButton>
            <IconButton size="sm" tone={call.micMuted ? 'neutral' : 'green'} title={call.micMuted ? 'Включить микрофон' : 'Выключить микрофон'} aria-label={call.micMuted ? 'Включить микрофон' : 'Выключить микрофон'} onClick={() => void mediaCallService.toggleMicrophone()}>
              {call.micMuted ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
            </IconButton>
            <IconButton size="sm" tone={call.cameraOff ? 'neutral' : 'green'} title={call.cameraOff ? 'Включить камеру' : 'Выключить камеру'} aria-label={call.cameraOff ? 'Включить камеру' : 'Выключить камеру'} onClick={() => void mediaCallService.toggleCamera()}>
              {call.cameraOff ? <VideoOff size={15} aria-hidden="true" /> : <Video size={15} aria-hidden="true" />}
            </IconButton>
            <IconButton size="sm" tone="danger" title="Выйти из звонка" aria-label="Выйти из звонка" onClick={() => void mediaCallService.leaveCall()}>
              <PhoneOff size={15} aria-hidden="true" />
            </IconButton>
          </Toolbar>
        </>
      )}
    </DraggableSurface>
  );
}

function floatingCallDefaultPosition() {
  if (typeof window === 'undefined') return { x: 980, y: 640 };
  return { x: Math.max(12, window.innerWidth - readVttSidecarOffset() - 438), y: Math.max(12, window.innerHeight - 366) };
}

function readVttSidecarOffset(): number {
  if (typeof document === 'undefined' || window.innerWidth < 960) return 0;
  const sidePanel = document.querySelector('[data-vtt-side-panel]');
  if (sidePanel) {
    const style = getComputedStyle(sidePanel);
    const rect = sidePanel.getBoundingClientRect();
    if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0) return Math.max(0, window.innerWidth - rect.left + 18);
  }
  const vttRoot = document.querySelector('[data-vtt-root]');
  if (!vttRoot) return 0;
  const sidecarWidth = Number.parseFloat(getComputedStyle(vttRoot).getPropertyValue('--dh-sidecar-width'));
  return Number.isFinite(sidecarWidth) ? sidecarWidth + 30 : 0;
}

function FloatingVideo({ handRaised, local = false, participant }: { handRaised: boolean; local?: boolean; participant: CallParticipant }) {
  const name = participant.displayName || (local ? 'Вы' : 'Участник');
  return (
    <article className={`floating-call__video ${local ? 'dh-is-local' : ''}`.trim()}>
      {participant.stream && !participant.cameraOff ? <MediaStreamVideo key={mediaStreamRenderKey(participant.stream)} muted stream={participant.stream} /> : <span>{initials(name)}</span>}
      <small>{name}{local ? ' · вы' : ''}</small>
      <div className="floating-call__video-status">
        {handRaised && <Hand size={13} aria-label="Игровая рука поднята" />}
        {participant.micMuted && <MicOff size={13} aria-label="Микрофон выключен" />}
      </div>
    </article>
  );
}

function mediaStreamRenderKey(stream: MediaStream): string {
  return `${stream.id}:${stream.getVideoTracks().map((track) => track.id).join(',')}`;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}
