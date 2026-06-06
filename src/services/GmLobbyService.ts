import type { P2PInviteContext, P2PInviteDraftState, P2PSessionInvite } from './P2PSessionService';
import type { P2PSessionService } from './P2PSessionService';
import type { Stream } from '../core/store/Stream';

export interface RoomCodeRefreshView {
  remainingSeconds: number;
}

export class GmLobbyService {
  readonly invite$: Stream<P2PInviteDraftState>;

  constructor(private p2pSessionService: P2PSessionService) {
    this.invite$ = p2pSessionService.invite$;
  }

  async restoreSession(participantName: string): Promise<void> {
    await this.p2pSessionService.restoreActiveSession('gm', participantName);
  }

  getRoomId(): string {
    return this.p2pSessionService.getGmRoomId();
  }

  previewInviteUrl(context: P2PInviteContext): string {
    return this.p2pSessionService.previewInviteUrl(context);
  }

  roomCodeRefreshView(invite: Pick<P2PInviteDraftState, 'roomCodeRefreshBlockedUntil'>, now = Date.now()): RoomCodeRefreshView {
    return {
      remainingSeconds: Math.max(0, Math.ceil((invite.roomCodeRefreshBlockedUntil - now) / 1000))
    };
  }

  async createSession(input: P2PInviteContext & { participantName?: string }): Promise<P2PSessionInvite | null> {
    try {
      return await this.p2pSessionService.createGmInviteFromDraft(input);
    } catch {
      return null;
    }
  }

  async copyInvite(inviteUrl: string, messages: { copied: string; manual: string }): Promise<void> {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard?.writeText(inviteUrl);
      this.p2pSessionService.setInviteMessage(messages.copied);
    } catch {
      this.p2pSessionService.setInviteMessage(messages.manual);
    }
  }

  hasConnectedPlayers(): boolean {
    return this.p2pSessionService.hasConnectedPlayers();
  }

  refreshRoomCode(): Promise<void> {
    return this.p2pSessionService.refreshGmRoomCode();
  }
}
