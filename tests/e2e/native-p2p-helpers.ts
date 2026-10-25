import type { Browser, BrowserContext, Page, WebSocketRoute } from '@playwright/test';

export type NativeSignalingMode = 'public' | 'local-nostr';
export interface NativeRtcEvidence {
  created: number;
  connected: number;
  dataChannels: number;
  openDataChannels: number;
  gatheredCandidateTypes: Record<string, number>;
  selectedCandidateTypes: Record<string, number>;
}

/** Real native RTC/data channels; optional fixture replaces signaling only.
 * No application transport hook or application envelope relay is installed.
 * SDP, candidate addresses, credentials and signaling payloads are never logged.
 */
export async function createNativeP2PProfiles(browser: Browser, mode: NativeSignalingMode, count = 2) {
  const sockets = new Map<WebSocketRoute, Map<string, any>>();
  let signalingEvents = 0;
  let signalingSubscriptions = 0;
  let signalingDeliveries = 0;
  let blockedExternalHttp = 0;
  const contexts: BrowserContext[] = [];
  for (let index = 0; index < count; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    contexts.push(context);
    // The test artifact must be self-contained and production-free. Prevent
    // accidental external HTTP/Auth/Storage calls even if configured wrongly.
    // Public mode leaves the real signaling WebSockets completely untouched.
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (/^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        blockedExternalHttp++;
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    if (mode === 'local-nostr') {
      await context.routeWebSocket(/wss?:\/\//, socket => {
        const subscriptions = new Map<string, any>();
        sockets.set(socket, subscriptions);
        socket.onClose(() => sockets.delete(socket));
        socket.onMessage(raw => {
          let message: any;
          try { message = JSON.parse(String(raw)); } catch { return; }
          if (!Array.isArray(message)) return;
          if (message[0] === 'REQ' && typeof message[1] === 'string') {
            signalingSubscriptions++;
            subscriptions.set(message[1], message[2]);
          }
          if (message[0] === 'CLOSE') subscriptions.delete(message[1]);
          if (message[0] !== 'EVENT') return;
          const event = message[1];
          if (!event || !Array.isArray(event.tags)) return;
          signalingEvents++;
          for (const [recipient, filters] of sockets) {
            if (recipient.url() !== socket.url()) continue;
            for (const [id, filter] of filters) {
              if (filter?.kinds?.includes(event.kind) && event.tags.some((tag: unknown[]) => tag[0] === 'x' && filter['#x']?.includes(tag[1]))) {
                signalingDeliveries++;
                recipient.send(JSON.stringify(['EVENT', id, event]));
              }
            }
          }
        });
      });
    }
    await context.addInitScript(() => {
      const Native = window.RTCPeerConnection;
      const pcs: RTCPeerConnection[] = [];
      const channels = new Set<RTCDataChannel>();
      const gatheredCandidateTypes: Record<string, number> = {};
      const candidateType = (value: unknown) => typeof value === 'string' && ['host', 'srflx', 'prflx', 'relay'].includes(value) ? value : 'unknown';
      const trackChannel = (channel: RTCDataChannel) => { channels.add(channel); return channel; };
      // This delegates to the native constructor with its original config.
      window.RTCPeerConnection = class extends Native {
        constructor(config?: RTCConfiguration) {
          super(config);
          pcs.push(this);
          this.addEventListener('datachannel', event => trackChannel(event.channel));
          this.addEventListener('icecandidate', event => {
            if (!event.candidate) return;
            const type = candidateType(event.candidate.type);
            gatheredCandidateTypes[type] = (gatheredCandidateTypes[type] ?? 0) + 1;
          });
        }
        override createDataChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel {
          return trackChannel(super.createDataChannel(label, options));
        }
      };
      (window as typeof window & { __NATIVE_P2P_EVIDENCE__?: () => Promise<NativeRtcEvidence> }).__NATIVE_P2P_EVIDENCE__ = async () => {
        const selectedCandidateTypes: Record<string, number> = {};
        for (const pc of pcs) {
          if (pc.connectionState !== 'connected') continue;
          try {
            const stats = await pc.getStats();
            let pair: any;
            stats.forEach((entry: any) => {
              if (entry.type === 'transport' && entry.selectedCandidatePairId) pair = stats.get(entry.selectedCandidatePairId);
            });
            if (!pair) stats.forEach((entry: any) => { if (entry.type === 'candidate-pair' && entry.nominated && entry.state === 'succeeded') pair = entry; });
            if (!pair) continue;
            for (const id of [pair.localCandidateId, pair.remoteCandidateId]) {
              const type = candidateType(stats.get(id)?.candidateType);
              selectedCandidateTypes[type] = (selectedCandidateTypes[type] ?? 0) + 1;
            }
          } catch { /* Counts remain absent when this browser cannot expose them. */ }
        }
        return { created: pcs.length, connected: pcs.filter(pc => pc.connectionState === 'connected').length,
          dataChannels: channels.size, openDataChannels: [...channels].filter(channel => channel.readyState === 'open').length,
          gatheredCandidateTypes: { ...gatheredCandidateTypes }, selectedCandidateTypes };
      };
    });
  }
  return { contexts, get signalingEvents() { return signalingEvents; }, get signalingSubscriptions() { return signalingSubscriptions; },
    get signalingDeliveries() { return signalingDeliveries; }, get blockedExternalHttp() { return blockedExternalHttp; },
    close: () => Promise.all(contexts.map(context => context.close())) };
}

export async function nativeRtcEvidence(page: Page): Promise<NativeRtcEvidence | null> {
  return page.evaluate(async () => {
    const probe = (window as typeof window & { __NATIVE_P2P_EVIDENCE__?: () => Promise<NativeRtcEvidence> }).__NATIVE_P2P_EVIDENCE__;
    return probe ? probe() : null;
  }).catch(() => null);
}
