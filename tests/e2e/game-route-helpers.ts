import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export async function installDeterministicP2PTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stored = JSON.parse(window.localStorage.getItem('daggerheart-play') || '{"version":1}') as { p2p?: Record<string, unknown> };
    window.localStorage.setItem('daggerheart-play', JSON.stringify({
      ...stored,
      version: 1,
      p2p: { ...stored.p2p, connectionMode: 'p2p' }
    }));
    const noopSubscription = () => () => undefined;
    (window as typeof window & { __DAGGERHEART_E2E_P2P_TRANSPORT_FACTORY__?: () => unknown }).__DAGGERHEART_E2E_P2P_TRANSPORT_FACTORY__ = () => ({
      id: 'e2e-local',
      label: 'E2E local transport',
      peerId: 'e2e-browser-peer',
      connect: async (roomId: string) => window.sessionStorage.setItem('e2e-p2p-connected-room', roomId),
      disconnect: async () => undefined,
      send: async () => undefined,
      subscribe: noopSubscription,
      onPeerJoin: noopSubscription,
      onPeerLeave: noopSubscription,
      onError: noopSubscription,
      onDiagnosticsChange: noopSubscription,
      onRouteSwitch: noopSubscription,
      getRouteDiagnostics: () => [],
      getPeerDiagnostics: () => []
    });
  });
}

export type DeterministicRelayMessage =
  | { type: 'join' | 'leave'; roomId: string; peerId: string }
  | { type: 'envelope'; roomId: string; peerId: string; targetPeerId?: string; envelope: unknown }
  | { type: 'binary'; roomId: string; peerId: string; targetPeerId?: string; data: string; metadata: unknown };

export interface IsolatedDeterministicP2PClient {
  context: BrowserContext;
  page: Page;
  peerId: string;
}

export interface IsolatedDeterministicP2PRelay {
  clients: IsolatedDeterministicP2PClient[];
  messages: DeterministicRelayMessage[];
  close(): Promise<void>;
}

export interface IsolatedDeterministicP2PRelayOptions {
  viewport?: { width: number; height: number };
  binaryDelayMs?: number;
}

/**
 * Creates one browser profile per peer and relays wire messages in the
 * Playwright process. No client can observe another client's localStorage,
 * sessionStorage or IndexedDB, so snapshots and asset binaries must cross the
 * same adapter surface used by a real P2P room.
 */
export async function createIsolatedDeterministicP2PRelay(
  browser: Browser,
  peerIds: string[],
  options: IsolatedDeterministicP2PRelayOptions = {}
): Promise<IsolatedDeterministicP2PRelay> {
  const viewport = options.viewport ?? { width: 1440, height: 900 };
  const messages: DeterministicRelayMessage[] = [];
  const logicalPeerIds = new Map<string, string>();
  const clients = await Promise.all(peerIds.map(async (peerId) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    return { context, page, peerId };
  }));

  for (const client of clients) {
    await client.page.exposeBinding('__DAGGERHEART_E2E_RELAY_SEND__', async (_source, message: DeterministicRelayMessage) => {
      messages.push(message);
      if (message.type === 'envelope' && message.envelope && typeof message.envelope === 'object') {
        const sender = (message.envelope as { sender?: { peerId?: unknown } }).sender;
        if (typeof sender?.peerId === 'string') logicalPeerIds.set(client.peerId, sender.peerId);
      }
      if (message.type === 'binary' && options.binaryDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.binaryDelayMs));
      }
      const recipients = clients.filter((candidate) => (
        candidate.peerId !== client.peerId &&
        (!('targetPeerId' in message) || !message.targetPeerId || message.targetPeerId === candidate.peerId || message.targetPeerId === logicalPeerIds.get(candidate.peerId))
      ));
      await Promise.all(recipients.map(async (recipient) => {
        if (recipient.page.isClosed()) return;
        await recipient.page.evaluate((incoming) => {
          (window as typeof window & {
            __DAGGERHEART_E2E_RELAY_RECEIVE__?: (message: DeterministicRelayMessage) => void;
          }).__DAGGERHEART_E2E_RELAY_RECEIVE__?.(incoming);
        }, message).catch(() => undefined);
      }));
    });
    await installIsolatedDeterministicP2PTransport(client.page, client.peerId);
  }

  return {
    clients,
    messages,
    close: async () => {
      await Promise.all(clients.map(({ context }) => context.close()));
    }
  };
}

async function installIsolatedDeterministicP2PTransport(page: Page, peerId: string): Promise<void> {
  await page.addInitScript((localPeerId) => {
    type RelaySend = (message: DeterministicRelayMessage) => Promise<void>;
    type EnvelopeListener = (envelope: any, context?: { sourcePeerId?: string; verifiedSourcePeerId?: string }) => void;
    type BinaryListener = (data: ArrayBuffer, peerId: string, metadata?: unknown) => void;

    (window as typeof window & { __DAGGERHEART_E2E_P2P_TRANSPORT_FACTORY__?: () => unknown }).__DAGGERHEART_E2E_P2P_TRANSPORT_FACTORY__ = () => {
      const envelopeListeners = new Set<EnvelopeListener>();
      const binaryListeners = new Set<BinaryListener>();
      const peerJoinListeners = new Set<(peerId: string) => void>();
      const peerLeaveListeners = new Set<(peerId: string) => void>();
      const errorListeners = new Set<(message: string) => void>();
      let roomId = '';
      const receive = (message: DeterministicRelayMessage) => {
        if (!message || message.peerId === localPeerId || message.roomId !== roomId) return;
        if (message.type === 'join') {
          peerJoinListeners.forEach((listener) => listener(message.peerId));
          return;
        }
        if (message.type === 'leave') {
          peerLeaveListeners.forEach((listener) => listener(message.peerId));
          return;
        }
        if (message.type === 'envelope') {
          envelopeListeners.forEach((listener) => listener(message.envelope, { sourcePeerId: message.peerId, verifiedSourcePeerId: message.peerId }));
          return;
        }
        if (message.type === 'binary') {
          const bytes = Uint8Array.from(atob(message.data), (char) => char.charCodeAt(0));
          binaryListeners.forEach((listener) => listener(bytes.buffer, message.peerId, message.metadata));
        }
      };
      (window as typeof window & { __DAGGERHEART_E2E_RELAY_RECEIVE__?: typeof receive }).__DAGGERHEART_E2E_RELAY_RECEIVE__ = receive;
      const post = (message: DeterministicRelayMessage) => (
        (window as typeof window & { __DAGGERHEART_E2E_RELAY_SEND__: RelaySend }).__DAGGERHEART_E2E_RELAY_SEND__(message)
      );
      const subscriptions = <T>(listeners: Set<T>, listener: T) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      };

      return {
        id: 'e2e-shared',
        label: 'E2E shared deterministic transport',
        peerId: localPeerId,
        async connect(nextRoomId: string) {
          roomId = nextRoomId;
          await post({ type: 'join', roomId, peerId: localPeerId });
        },
        async disconnect() {
          if (roomId) await post({ type: 'leave', roomId, peerId: localPeerId });
          roomId = '';
        },
        async send(envelope: unknown, targetPeerId?: string) {
          await post({ type: 'envelope', roomId, peerId: localPeerId, targetPeerId, envelope });
        },
        subscribe(listener: EnvelopeListener) {
          return subscriptions(envelopeListeners, listener);
        },
        async sendBinary(data: Blob | ArrayBuffer | ArrayBufferView, targetPeerId?: string, metadata?: unknown, progress?: (percent: number, peerId: string, metadata?: unknown) => void) {
          const buffer = data instanceof Blob
            ? await data.arrayBuffer()
            : ArrayBuffer.isView(data)
              ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
              : data;
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          await post({ type: 'binary', roomId, peerId: localPeerId, targetPeerId, data: btoa(binary), metadata });
          progress?.(1, targetPeerId ?? '', metadata);
        },
        subscribeBinary(listener: BinaryListener) {
          return subscriptions(binaryListeners, listener);
        },
        async publishMediaStream() {},
        removeMediaStream() {},
        subscribeMediaStreams() {
          return () => undefined;
        },
        onPeerJoin(listener: (peerId: string) => void) {
          return subscriptions(peerJoinListeners, listener);
        },
        onPeerLeave(listener: (peerId: string) => void) {
          return subscriptions(peerLeaveListeners, listener);
        },
        onError(listener: (message: string) => void) {
          return subscriptions(errorListeners, listener);
        },
        getRouteDiagnostics: () => [],
        getPeerDiagnostics: () => []
      };
    };
  }, peerId);
}

export async function openSharedGmGame(page: Page, roomId = 'E2EROOM'): Promise<void> {
  await page.addInitScript((activeRoomId) => {
    if (window.sessionStorage.getItem('e2e-active-session-seeded')) return;
    window.sessionStorage.setItem('e2e-active-session-seeded', 'gm');
    window.localStorage.setItem('daggerheart-play', JSON.stringify({
      version: 1,
      p2p: {
        inviteDraft: { roomId: activeRoomId },
        activeSession: { version: 1, role: 'gm', roomId: activeRoomId, participantName: 'Мастер', updatedAt: new Date().toISOString() }
      }
    }));
  }, roomId);
  await page.goto('/#/game');
  await expect(page.locator('[data-vtt-root]')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Сетевая игра:/ }).click();
  const networkDialog = page.getByRole('dialog', { name: 'Сетевая игра' });
  const openRoom = networkDialog.getByRole('button', { name: 'Открыть комнату' });
  if (await openRoom.isVisible()) await openRoom.click();
  await expect(networkDialog.getByRole('textbox', { name: 'Ссылка приглашения' })).toBeVisible({ timeout: 15_000 });
  await networkDialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
}

export async function openSharedPlayerGame(page: Page, roomId = 'E2EROOM'): Promise<void> {
  await page.addInitScript((activeRoomId) => {
    if (window.sessionStorage.getItem('e2e-active-session-seeded')) return;
    window.sessionStorage.setItem('e2e-active-session-seeded', 'player');
    window.localStorage.setItem('daggerheart-play', JSON.stringify({
      version: 1,
      p2p: { activeSession: { version: 1, role: 'player', roomId: activeRoomId, participantName: 'Игрок', updatedAt: new Date().toISOString() } }
    }));
  }, roomId);
  await page.goto('/#/game');
  await expect(page.locator('[data-vtt-root]')).toBeVisible({ timeout: 15_000 });
}

export async function openGmGame(page: Page): Promise<void> {
  await installDeterministicP2PTransport(page);
  await page.goto('/#/game');
  await expect(page.locator('[data-vtt-root]')).toBeVisible({ timeout: 15_000 });
}

export async function openPlayerGame(page: Page, roomId = 'TEST-ROOM'): Promise<void> {
  await installDeterministicP2PTransport(page);
  await page.addInitScript((activeRoomId) => {
    window.localStorage.setItem('daggerheart-play', JSON.stringify({
      version: 1,
      p2p: {
        activeSession: {
          version: 1,
          role: 'player',
          roomId: activeRoomId,
          participantName: 'Игрок',
          updatedAt: new Date().toISOString()
        }
      }
    }));
  }, roomId);
  await page.goto('/#/game');
  await expect(page.locator('[data-vtt-root]')).toBeVisible({ timeout: 15_000 });
}
