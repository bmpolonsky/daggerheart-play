import type { P2PSessionState } from '../P2PSessionService';
import type { P2PMediaConnectionDiagnostic } from './P2PTransportAdapter';

export interface P2PDiagnosticsReportInput {
  session: P2PSessionState;
  media: P2PMediaConnectionDiagnostic[];
  generatedAt?: string;
  userAgent?: string;
  url?: string;
}

export function buildP2PDiagnosticsReport(input: P2PDiagnosticsReportInput): string {
  const { session } = input;
  return JSON.stringify({
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    page: input.url ?? '',
    browser: input.userAgent ?? '',
    session: {
      roomId: session.roomId,
      role: session.role,
      status: session.status,
      connected: session.connected,
      message: session.message,
      peerId: session.peerId,
      peers: session.peers,
      lastSnapshotAt: session.lastSnapshotAt,
      lastRequestAt: session.lastRequestAt
    },
    routes: session.routes,
    peerRoutes: session.routePeers,
    media: input.media
  }, null, 2);
}
