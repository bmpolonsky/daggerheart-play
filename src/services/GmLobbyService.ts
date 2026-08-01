import type { P2PInviteContext, P2PSessionInvite } from './P2PSessionService';
import type { P2PSessionService } from './P2PSessionService';
import { Stream } from '../core/store/Stream';
import { toastService } from './ToastService';

export interface RoomCodeRefreshView {
  remainingSeconds: number;
}

export interface GmLobbyState {
  roomId: string;
  draftRoomId: string;
  inviteUrl: string;
  roomCodeRefreshBlockedUntil: number;
  hasConnectedPlayers: boolean;
}

export class GmLobbyService {
  readonly lobby$: Stream<GmLobbyState>;
  private restoreInFlight: Promise<void> | null = null;

  constructor(private p2pSessionService: P2PSessionService) {
    this.lobby$ = Stream.combine({
      invite: p2pSessionService.invite$,
      session: p2pSessionService.session$
    }).map(({
      invite: { inviteUrl, roomCodeRefreshBlockedUntil, roomId: draftRoomId },
      session: { peers, role, roomId: sessionRoomId }
    }) => {
      const activeRoomId = role === 'gm' && sessionRoomId ? sessionRoomId : '';
      return {
        roomId: activeRoomId || draftRoomId,
        draftRoomId,
        inviteUrl,
        roomCodeRefreshBlockedUntil,
        hasConnectedPlayers: role === 'gm' && peers.length > 0
      };
    });
  }

  async restoreSession(participantName: string): Promise<void> {
    if (!this.restoreInFlight) {
      const restore = this.p2pSessionService.restoreActiveSession('gm', participantName).then(() => undefined);
      this.restoreInFlight = restore;
      void restore.finally(() => {
        if (this.restoreInFlight === restore) this.restoreInFlight = null;
      }).catch(() => undefined);
    }
    await this.restoreInFlight;
  }

  getRoomId(state: Pick<GmLobbyState, 'roomId'>): string {
    return state.roomId;
  }

  previewInviteUrl(
    context: P2PInviteContext,
    _state: Pick<GmLobbyState, 'draftRoomId' | 'inviteUrl' | 'roomId'>
  ): string {
    return this.p2pSessionService.previewInviteUrl(context);
  }

  roomCodeRefreshView(state: Pick<GmLobbyState, 'roomCodeRefreshBlockedUntil'>, now = Date.now()): RoomCodeRefreshView {
    return {
      remainingSeconds: Math.max(0, Math.ceil((state.roomCodeRefreshBlockedUntil - now) / 1000))
    };
  }

  async createSession(input: P2PInviteContext & { participantName?: string }): Promise<P2PSessionInvite | null> {
    try {
      await this.restoreInFlight?.catch(() => undefined);
      return await this.p2pSessionService.createGmInviteFromDraft(input);
    } catch {
      return null;
    }
  }

  async copyInvite(inviteUrl: string, messages: { copied: string; manual: string }): Promise<void> {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard?.writeText(inviteUrl);
      toastService.show(messages.copied, 'success');
    } catch {
      toastService.show(messages.manual, 'warning');
    }
  }

  hasConnectedPlayers(): boolean {
    return this.lobby$.get().hasConnectedPlayers;
  }

  refreshRoomCode(): Promise<void> {
    return this.p2pSessionService.refreshGmRoomCode();
  }
}
