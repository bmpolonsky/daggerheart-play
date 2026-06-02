import { Store } from '../core/store/Store';
import { nowIso } from '../core/utils/date';
import { hasBooleanFields, hasOptionalStringField, hasStringFields, isRecord } from '../core/utils/guards';

export interface PlayerPresence {
  peerId: string;
  requesterId: string;
  actorId: string;
  actorName: string;
  playerName: string;
  connected: boolean;
  voiceMuted: boolean;
  voiceLive: boolean;
  updatedAt: string;
}

export interface PlayerVoiceControlMessage {
  type: 'forceMute';
  actorId: string;
  peerId?: string;
  requestedAt: string;
}

export class PlayerPresenceService {
  readonly presenceStore = new Store<Record<string, PlayerPresence>>({});

  upsert(presence: PlayerPresence): void {
    if (!isPlayerPresence(presence)) return;
    this.presenceStore.update((state) => ({
      ...state,
      [presence.actorId]: presence
    }));
  }

  markDisconnectedByPeer(peerId: string): void {
    this.presenceStore.update((state) => {
      let changed = false;
      const next = Object.fromEntries(Object.entries(state).map(([actorId, presence]) => {
        if (presence.peerId !== peerId) return [actorId, presence];
        changed = true;
        return [actorId, { ...presence, connected: false, updatedAt: nowIso() }];
      }));
      return changed ? next : state;
    });
  }

  createForceMute(input: { actorId: string; peerId?: string }): PlayerVoiceControlMessage {
    return {
      type: 'forceMute',
      actorId: input.actorId,
      peerId: input.peerId,
      requestedAt: nowIso()
    };
  }
}

export function isPlayerPresence(value: unknown): value is PlayerPresence {
  return isRecord(value) &&
    hasStringFields(value, ['peerId', 'requesterId', 'actorId', 'actorName', 'playerName', 'updatedAt']) &&
    hasBooleanFields(value, ['connected', 'voiceMuted', 'voiceLive']);
}

export function isPlayerVoiceControlMessage(value: unknown): value is PlayerVoiceControlMessage {
  return isRecord(value) &&
    value.type === 'forceMute' &&
    hasStringFields(value, ['actorId', 'requestedAt']) &&
    hasOptionalStringField(value, 'peerId');
}
