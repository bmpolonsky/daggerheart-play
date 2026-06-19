import { Store } from '../core/store/Store';
import { createId } from '../core/utils/id';
import { nowIso } from '../core/utils/date';
import { hasBooleanFields, hasStringFields, isRecord } from '../core/utils/guards';
import type { SyncTransport } from '../domain/tabletop/types';
import type { SyncService } from './SyncService';

export type CallParticipantRole = 'gm' | 'player' | 'guest';
export type CallStatus = 'idle' | 'connecting' | 'connected' | 'permission-denied' | 'unsupported' | 'error';

export interface CallPresenceMessage {
  type: 'callPresence';
  participantId: string;
  displayName: string;
  role: CallParticipantRole;
  connected: boolean;
  micMuted: boolean;
  cameraOff: boolean;
  handRaised: boolean;
  updatedAt: string;
}

export interface CallParticipant extends CallPresenceMessage {
  peerId?: string;
  stream: MediaStream | null;
}

export interface MediaCallState {
  roomId: string;
  localParticipantId: string;
  displayName: string;
  role: CallParticipantRole;
  active: boolean;
  status: CallStatus;
  message: string;
  micMuted: boolean;
  cameraOff: boolean;
  handRaised: boolean;
  localStream: MediaStream | null;
  remoteParticipants: Record<string, CallParticipant>;
}

interface CallMediaMetadata {
  kind: 'call';
  participantId: string;
  displayName: string;
}

interface CallMediaTransport {
  publishMediaStream(stream: MediaStream, metadata?: CallMediaMetadata): Promise<void>;
  removeMediaStream(stream: MediaStream): void;
  subscribeMediaStreams(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void): () => void;
}

const initialState: MediaCallState = {
  roomId: '',
  localParticipantId: createId('call_participant'),
  displayName: '',
  role: 'guest',
  active: false,
  status: 'idle',
  message: 'Звонок не подключен.',
  micMuted: true,
  cameraOff: true,
  handRaised: false,
  localStream: null,
  remoteParticipants: {}
};

export class MediaCallService {
  private callStore = new Store<MediaCallState>(initialState);
  readonly call$ = this.callStore.toStream();
  private mediaTransport: CallMediaTransport | null = null;
  private unsubscribeStreams: (() => void) | null = null;

  constructor(private syncService: SyncService) {}

  setRoom(input: { roomId: string; participantId?: string; displayName?: string; role?: CallParticipantRole; active?: boolean }): void {
    this.callStore.update((state) => ({
      ...state,
      roomId: input.roomId,
      localParticipantId: input.participantId?.trim() || state.localParticipantId,
      displayName: input.displayName?.trim() || state.displayName || (input.role === 'gm' ? 'Мастер' : ''),
      role: input.role ?? state.role,
      active: input.active ? true : input.roomId === state.roomId ? state.active : false,
      status: input.roomId ? 'connected' : state.status,
      message: input.roomId ? 'Звонок подключен.' : state.message
    }));
    void this.publishPresence();
  }

  activateCall(): void {
    this.callStore.update((state) => ({
      ...state,
      active: true
    }));
    void this.publishPresence();
  }

  setDisplayName(displayName: string): void {
    this.callStore.update((state) => ({
      ...state,
      displayName: displayName.trim()
    }));
    void this.publishPresence();
  }

  setMediaTransport(transport: SyncTransport | null): void {
    const previousTransport = this.mediaTransport;
    const nextTransport = isCallMediaTransport(transport) ? transport : null;
    this.unsubscribeStreams?.();
    this.unsubscribeStreams = null;
    if (previousTransport && previousTransport !== nextTransport && this.call$.get().localStream) {
      previousTransport.removeMediaStream(this.call$.get().localStream as MediaStream);
    }
    this.mediaTransport = nextTransport;
    if (!transport) {
      this.stopLocalMedia();
      this.callStore.update((state) => ({
        ...state,
        status: 'idle',
        message: 'Звонок отключен.',
        active: false,
        remoteParticipants: {}
      }));
      return;
    }
    if (!this.mediaTransport) {
      this.callStore.update((state) => ({
        ...state,
        status: 'unsupported',
        message: 'P2P transport не поддерживает видео.'
      }));
      return;
    }
    this.unsubscribeStreams = this.mediaTransport.subscribeMediaStreams((stream, peerId, metadata) => {
      if (!isCallMediaMetadata(metadata)) return;
      this.attachRemoteStream(peerId, stream, metadata);
    });
    const localStream = this.call$.get().localStream;
    if (localStream) {
      void this.publishLocalStream(localStream);
    }
  }

  removeRemotePeer(peerId: string): void {
    this.callStore.update((state) => {
      const next = { ...state.remoteParticipants };
      for (const [participantId, participant] of Object.entries(next)) {
        if (participant.peerId === peerId) {
          next[participantId] = {
            ...participant,
            connected: false,
            stream: null,
            updatedAt: nowIso()
          };
        }
      }
      return {
        ...state,
        remoteParticipants: next
      };
    });
  }

  receiveRemotePresence(message: CallPresenceMessage, peerId?: string): void {
    const localParticipantId = this.call$.get().localParticipantId;
    if (message.participantId === localParticipantId) return;
    this.callStore.update((state) => {
      const existing = state.remoteParticipants[message.participantId];
      return {
        ...state,
        remoteParticipants: {
          ...state.remoteParticipants,
          [message.participantId]: {
            ...message,
            peerId: peerId ?? existing?.peerId,
            stream: existing?.stream ?? null
          }
        }
      };
    });
  }

  async toggleMicrophone(): Promise<void> {
    const state = this.call$.get();
    if (!state.active) {
      this.activateCall();
    }
    if (!state.micMuted) {
      this.setAudioTracksEnabled(false);
      this.callStore.update((current) => ({ ...current, micMuted: true }));
      await this.publishPresence();
      return;
    }
    if (!await this.ensureLocalMedia({ audio: true, video: !state.cameraOff })) {
      return;
    }
    this.setAudioTracksEnabled(true);
    this.callStore.update((current) => ({ ...current, micMuted: false }));
    await this.publishPresence();
  }

  async toggleCamera(): Promise<void> {
    const state = this.call$.get();
    if (!state.active) {
      this.activateCall();
    }
    if (!state.cameraOff) {
      this.setVideoTracksEnabled(false);
      this.callStore.update((current) => ({ ...current, cameraOff: true }));
      await this.publishPresence();
      return;
    }
    if (!await this.ensureLocalMedia({ audio: !state.micMuted, video: true })) {
      return;
    }
    this.setVideoTracksEnabled(true);
    this.callStore.update((current) => ({ ...current, cameraOff: false }));
    await this.publishPresence();
  }

  async toggleHand(): Promise<void> {
    this.callStore.update((state) => ({
      ...state,
      active: true,
      handRaised: !state.handRaised
    }));
    await this.publishPresence();
  }

  async publishPresence(): Promise<boolean> {
    const state = this.call$.get();
    if (!state.active || !state.roomId || !state.displayName.trim()) return false;
    try {
      await this.syncService.publishCallPresence(this.createLocalPresence(true));
      return true;
    } catch (error) {
      this.callStore.update((current) => ({
        ...current,
        status: 'error',
        message: error instanceof Error ? error.message : 'Не удалось отправить статус звонка.'
      }));
      return false;
    }
  }

  stopLocalMedia(): void {
    const stream = this.call$.get().localStream;
    if (stream) {
      this.mediaTransport?.removeMediaStream(stream);
      stream.getTracks().forEach((track) => track.stop());
    }
    this.callStore.update((state) => ({
      ...state,
      localStream: null,
      micMuted: true,
      cameraOff: true,
      message: state.roomId ? 'Камера и микрофон выключены.' : state.message
    }));
    void this.publishPresence();
  }

  private async ensureLocalMedia(constraints: { audio: boolean; video: boolean }): Promise<boolean> {
    if (!this.mediaTransport) {
      this.callStore.update((state) => ({
        ...state,
        status: 'unsupported',
        message: 'Сначала подключитесь к комнате.'
      }));
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.callStore.update((state) => ({
        ...state,
        status: 'unsupported',
        message: 'Браузер не поддерживает камеру и микрофон.'
      }));
      return false;
    }
    const current = this.call$.get();
    const hasAudio = Boolean(current.localStream?.getAudioTracks().length);
    const hasVideo = Boolean(current.localStream?.getVideoTracks().length);
    if ((constraints.audio ? hasAudio : true) && (constraints.video ? hasVideo : true) && current.localStream) {
      return true;
    }
    this.callStore.update((state) => ({
      ...state,
      status: 'connecting',
      message: 'Запрашиваем доступ к устройствам...'
    }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: constraints.audio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          : false,
        video: constraints.video
          ? {
              width: { ideal: 854 },
              height: { ideal: 480 },
              frameRate: { ideal: 15, max: 24 }
            }
          : false
      });
      applyCallContentHints(stream);
      if (current.localStream) {
        this.mediaTransport.removeMediaStream(current.localStream);
        current.localStream.getTracks().forEach((track) => track.stop());
      }
      this.callStore.update((state) => ({
        ...state,
        localStream: stream,
        status: 'connected',
        message: 'Устройства подключены.'
      }));
      await this.publishLocalStream(stream);
      return true;
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      this.callStore.update((state) => ({
        ...state,
        status: denied ? 'permission-denied' : 'error',
        message: denied ? 'Доступ к камере или микрофону запрещен.' : error instanceof Error ? error.message : 'Не удалось включить устройства.'
      }));
      return false;
    }
  }

  private setAudioTracksEnabled(enabled: boolean): void {
    this.call$.get().localStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  private setVideoTracksEnabled(enabled: boolean): void {
    this.call$.get().localStream?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  private async publishLocalStream(stream: MediaStream): Promise<void> {
    const state = this.call$.get();
    if (!this.mediaTransport || !state.displayName.trim()) return;
    await this.mediaTransport.publishMediaStream(stream, {
      kind: 'call',
      participantId: state.localParticipantId,
      displayName: state.displayName.trim()
    });
  }

  private attachRemoteStream(peerId: string, stream: MediaStream, metadata: CallMediaMetadata): void {
    if (metadata.participantId === this.call$.get().localParticipantId) return;
    this.callStore.update((state) => {
      const existing = state.remoteParticipants[metadata.participantId];
      return {
        ...state,
        remoteParticipants: {
          ...state.remoteParticipants,
          [metadata.participantId]: {
            type: 'callPresence',
            participantId: metadata.participantId,
            displayName: existing?.displayName ?? metadata.displayName,
            role: existing?.role ?? 'guest',
            connected: true,
            micMuted: existing?.micMuted ?? false,
            cameraOff: existing?.cameraOff ?? false,
            handRaised: existing?.handRaised ?? false,
            updatedAt: nowIso(),
            peerId,
            stream
          }
        }
      };
    });
  }

  private createLocalPresence(connected: boolean): CallPresenceMessage {
    const state = this.call$.get();
    return {
      type: 'callPresence',
      participantId: state.localParticipantId,
      displayName: state.displayName.trim() || (state.role === 'gm' ? 'Мастер' : 'Гость'),
      role: state.role,
      connected,
      micMuted: state.micMuted,
      cameraOff: state.cameraOff,
      handRaised: state.handRaised,
      updatedAt: nowIso()
    };
  }
}

function isCallMediaTransport(transport: SyncTransport | null): transport is SyncTransport & CallMediaTransport {
  return Boolean(
    transport &&
    'publishMediaStream' in transport &&
    'removeMediaStream' in transport &&
    'subscribeMediaStreams' in transport
  );
}

function isCallMediaMetadata(value: unknown): value is CallMediaMetadata {
  return isRecord(value) &&
    value.kind === 'call' &&
    hasStringFields(value, ['participantId', 'displayName']);
}

export function isCallPresenceMessage(value: unknown): value is CallPresenceMessage {
  return isRecord(value) &&
    value.type === 'callPresence' &&
    hasStringFields(value, ['participantId', 'displayName', 'role', 'updatedAt']) &&
    (value.role === 'gm' || value.role === 'player' || value.role === 'guest') &&
    hasBooleanFields(value, ['connected', 'micMuted', 'cameraOff', 'handRaised']);
}

function applyCallContentHints(stream: MediaStream): void {
  stream.getAudioTracks().forEach((track) => {
    track.contentHint = 'speech';
  });
  stream.getVideoTracks().forEach((track) => {
    track.contentHint = 'motion';
  });
}
