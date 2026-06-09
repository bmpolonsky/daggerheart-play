import { Store } from '../../core/store/Store';
import type { TrysteroP2PTransportOptions } from '../../services/TrysteroSyncTransport';

export type P2PNetworkStrategy = 'nostr' | 'torrent';

export interface P2PNetworkSettings {
  strategy: P2PNetworkStrategy;
}

export const P2P_NETWORK_STRATEGY_LABELS: Record<P2PNetworkStrategy, string> = {
  nostr: 'Nostr',
  torrent: 'Torrent'
};

const DEFAULT_P2P_NETWORK_SETTINGS: P2PNetworkSettings = {
  strategy: 'nostr'
};

const p2pNetworkSettingsStore = new Store<P2PNetworkSettings>(DEFAULT_P2P_NETWORK_SETTINGS);
export const p2pNetworkSettings$ = p2pNetworkSettingsStore.toStream();

export function readP2PNetworkSettings(): P2PNetworkSettings {
  return p2pNetworkSettingsStore.get();
}

export function writeP2PNetworkSettings(settings: Partial<P2PNetworkSettings>): P2PNetworkSettings {
  const next = normalizeP2PNetworkSettings(settings);
  p2pNetworkSettingsStore.set(next);
  return next;
}

export function trysteroOptionsForNetworkSettings(settings: P2PNetworkSettings): TrysteroP2PTransportOptions {
  return { strategy: settings.strategy };
}

function normalizeP2PNetworkSettings(settings?: Partial<P2PNetworkSettings> | null): P2PNetworkSettings {
  return {
    strategy: isP2PNetworkStrategy(settings?.strategy) ? settings.strategy : DEFAULT_P2P_NETWORK_SETTINGS.strategy
  };
}

function isP2PNetworkStrategy(value: unknown): value is P2PNetworkStrategy {
  return typeof value === 'string' && value in P2P_NETWORK_STRATEGY_LABELS;
}
