import { ReactiveStore } from '../core/store/ReactiveStore';
import { nowIso } from '../core/utils/date';
import { createId } from '../core/utils/id';
import type { ActionRollRequest, DamageRollRequest, ManualDiceRollRequest } from './DiceService';
import type { DiceService } from './DiceService';

export type PlayerActionRequestKind = 'actionRoll' | 'manualRoll' | 'damageRoll' | 'card' | 'resourceChange';
export type PlayerActionRequestStatus = 'pending' | 'approved' | 'rejected';

export type PlayerActionRequestPayload = ActionRollRequest | ManualDiceRollRequest | DamageRollRequest | Record<string, unknown>;

export interface PlayerActionRequestApplyResult {
  rollLogEntryId?: string;
  note?: string;
}

export interface PlayerActionRequest {
  id: string;
  createdAt: string;
  requesterId: string;
  requesterName?: string;
  actorId?: string | null;
  actorName?: string;
  kind: PlayerActionRequestKind;
  title: string;
  payload: PlayerActionRequestPayload;
  status: PlayerActionRequestStatus;
  reviewedAt?: string;
  reviewerId?: string;
  rejectionReason?: string;
  applyResult?: PlayerActionRequestApplyResult;
}

export interface SubmitPlayerActionRequestInput {
  requesterId: string;
  requesterName?: string;
  actorId?: string | null;
  actorName?: string;
  kind: PlayerActionRequestKind;
  title: string;
  payload: PlayerActionRequestPayload;
}

type RequestDiceService = Pick<DiceService, 'rollAction' | 'rollManualDice' | 'rollDamage'>;

export class PlayerActionRequestService {
  readonly requestsStore = new ReactiveStore<PlayerActionRequest[]>([]);

  constructor(private readonly diceService: RequestDiceService | null = null) {}

  submit(input: SubmitPlayerActionRequestInput): PlayerActionRequest {
    const request: PlayerActionRequest = {
      id: createId('player_request'),
      createdAt: nowIso(),
      requesterId: input.requesterId,
      requesterName: input.requesterName?.trim() || undefined,
      actorId: input.actorId,
      actorName: input.actorName?.trim() || undefined,
      kind: input.kind,
      title: input.title.trim() || 'Заявка игрока',
      payload: input.payload,
      status: 'pending'
    };
    this.requestsStore.update((requests) => [request, ...requests]);
    return request;
  }

  receiveRemote(request: PlayerActionRequest): PlayerActionRequest | null {
    if (!isPlayerActionRequest(request)) {
      return null;
    }
    const exists = this.requestsStore.getSnapshot().some((item) => item.id === request.id);
    if (exists) {
      this.replaceRequest(request);
      return request;
    }
    this.requestsStore.update((requests) => [request, ...requests]);
    return request;
  }

  approve(id: string, reviewerId: string, options: { apply?: boolean } = {}): PlayerActionRequest | null {
    const current = this.requestsStore.getSnapshot().find((request) => request.id === id);
    if (!current || current.status !== 'pending') {
      return null;
    }
    const applyResult = options.apply === false ? undefined : this.applyApprovedRequest(current);
    const approved: PlayerActionRequest = {
      ...current,
      status: 'approved',
      reviewedAt: nowIso(),
      reviewerId,
      applyResult
    };
    this.replaceRequest(approved);
    return approved;
  }

  reject(id: string, reviewerId: string, reason?: string): PlayerActionRequest | null {
    const current = this.requestsStore.getSnapshot().find((request) => request.id === id);
    if (!current || current.status !== 'pending') {
      return null;
    }
    const rejected: PlayerActionRequest = {
      ...current,
      status: 'rejected',
      reviewedAt: nowIso(),
      reviewerId,
      rejectionReason: reason?.trim() || undefined
    };
    this.replaceRequest(rejected);
    return rejected;
  }

  clearReviewed(): void {
    this.requestsStore.update((requests) => requests.filter((request) => request.status === 'pending'));
  }

  clearAll(): void {
    this.requestsStore.set([]);
  }

  private replaceRequest(next: PlayerActionRequest): void {
    this.requestsStore.update((requests) => requests.map((request) => (request.id === next.id ? next : request)));
  }

  private applyApprovedRequest(request: PlayerActionRequest): PlayerActionRequestApplyResult | undefined {
    if (!this.diceService) {
      return { note: 'Заявка подтверждена без локального исполнителя.' };
    }

    if (request.kind === 'actionRoll') {
      const entry = this.diceService.rollAction(request.payload as ActionRollRequest);
      return { rollLogEntryId: entry.id };
    }

    if (request.kind === 'manualRoll') {
      const entry = this.diceService.rollManualDice(request.payload as ManualDiceRollRequest);
      return { rollLogEntryId: entry.id };
    }

    if (request.kind === 'damageRoll') {
      const entry = this.diceService.rollDamage(request.payload as DamageRollRequest);
      return { rollLogEntryId: entry.id };
    }

    if (request.kind === 'card') {
      return { note: 'Заявка на карту подтверждена; GM применяет эффект вручную.' };
    }

    if (request.kind === 'resourceChange') {
      return { note: 'Заявка на ресурс подтверждена; GM применяет изменение вручную.' };
    }

    return { note: 'Заявка подтверждена.' };
  }
}

function isPlayerActionRequest(value: unknown): value is PlayerActionRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PlayerActionRequest>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.requesterId === 'string' &&
    typeof candidate.title === 'string' &&
    (candidate.status === 'pending' || candidate.status === 'approved' || candidate.status === 'rejected') &&
    (
      candidate.kind === 'actionRoll' ||
      candidate.kind === 'manualRoll' ||
      candidate.kind === 'damageRoll' ||
      candidate.kind === 'card' ||
      candidate.kind === 'resourceChange'
    )
  );
}
