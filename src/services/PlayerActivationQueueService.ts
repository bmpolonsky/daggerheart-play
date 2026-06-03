import { Store } from '../core/store/Store';
import { nowIso } from '../core/utils/date';
import { hasStringFields, isRecord } from '../core/utils/guards';
import { createId } from '../core/utils/id';

export interface PlayerActivationQueueItem {
  id: string;
  requesterId: string;
  requesterName?: string;
  actorId: string;
  actorName: string;
  requestedAt: string;
}

export type PlayerActivationQueueMessage =
  | { type: 'raise'; request: PlayerActivationQueueItem }
  | { type: 'lower' | 'clear'; actorId: string; requesterId: string; updatedAt: string };

export interface PlayerActivationInput {
  requesterId: string;
  requesterName?: string;
  actorId: string;
  actorName: string;
}

export interface LocalActivationState {
  raised: boolean;
  actorId: string | null;
}

export class PlayerActivationQueueService {
  private queueStore = new Store<PlayerActivationQueueItem[]>([]);
  readonly queue$ = this.queueStore.toStream();
  private localStore = new Store<LocalActivationState>({ raised: false, actorId: null });
  readonly local$ = this.localStore.toStream();

  raise(input: PlayerActivationInput): PlayerActivationQueueMessage {
    const request: PlayerActivationQueueItem = {
      id: createId('activation_request'),
      requesterId: input.requesterId,
      requesterName: input.requesterName?.trim() || undefined,
      actorId: input.actorId,
      actorName: input.actorName.trim() || 'Персонаж',
      requestedAt: nowIso()
    };
    this.upsert(request);
    this.localStore.set({ raised: true, actorId: request.actorId });
    return { type: 'raise', request };
  }

  lower(input: Pick<PlayerActivationInput, 'requesterId' | 'actorId'>): PlayerActivationQueueMessage {
    this.remove(input.actorId, input.requesterId);
    this.clearLocalIfMatches(input.actorId);
    return {
      type: 'lower',
      actorId: input.actorId,
      requesterId: input.requesterId,
      updatedAt: nowIso()
    };
  }

  clear(item: Pick<PlayerActivationQueueItem, 'requesterId' | 'actorId'>): PlayerActivationQueueMessage {
    this.remove(item.actorId, item.requesterId);
    this.clearLocalIfMatches(item.actorId);
    return {
      type: 'clear',
      actorId: item.actorId,
      requesterId: item.requesterId,
      updatedAt: nowIso()
    };
  }

  receiveRemote(message: PlayerActivationQueueMessage): PlayerActivationQueueItem | null {
    if (!isPlayerActivationQueueMessage(message)) {
      return null;
    }
    if (message.type === 'raise') {
      return this.upsert(message.request);
    }
    this.remove(message.actorId, message.requesterId);
    this.clearLocalIfMatches(message.actorId);
    return null;
  }

  clearAll(): void {
    this.queueStore.set([]);
    this.localStore.set({ raised: false, actorId: null });
  }

  private upsert(request: PlayerActivationQueueItem): PlayerActivationQueueItem {
    this.queueStore.update((queue) => {
      const existingIndex = queue.findIndex((item) => activationKey(item.actorId, item.requesterId) === activationKey(request.actorId, request.requesterId));
      if (existingIndex < 0) {
        return [...queue, request];
      }
      return queue.map((item, index) => (index === existingIndex ? { ...item, ...request, id: item.id, requestedAt: item.requestedAt } : item));
    });
    return request;
  }

  private remove(actorId: string, requesterId: string): void {
    const key = activationKey(actorId, requesterId);
    this.queueStore.update((queue) => queue.filter((item) => activationKey(item.actorId, item.requesterId) !== key));
  }

  private clearLocalIfMatches(actorId: string): void {
    const local = this.localStore.get();
    if (local.actorId === actorId) {
      this.localStore.set({ raised: false, actorId: null });
    }
  }
}

function activationKey(actorId: string, requesterId: string): string {
  return actorId ? `actor:${actorId}` : `requester:${requesterId}`;
}

export function isPlayerActivationQueueMessage(value: unknown): value is PlayerActivationQueueMessage {
  if (!isRecord(value)) return false;
  if (value.type === 'raise') {
    return isRecord(value.request) &&
      hasStringFields(value.request, ['id', 'requesterId', 'actorId', 'actorName', 'requestedAt']);
  }
  return (
    (value.type === 'lower' || value.type === 'clear') &&
    hasStringFields(value, ['actorId', 'requesterId', 'updatedAt'])
  );
}
