import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  readP2PNetworkSettings,
  trysteroOptionsForNetworkSettings,
  writeP2PNetworkSettings
} from '../../src/domain/p2p/networkSettings';

test('P2P network settings use Trystero Nostr defaults without relayConfig by default', () => {
  const settings = writeP2PNetworkSettings({ strategy: 'nostr' });
  assert.equal(readP2PNetworkSettings().strategy, 'nostr');
  assert.deepEqual(trysteroOptionsForNetworkSettings(settings), { strategy: 'nostr' });
});

test('P2P network settings resolve torrent options', () => {
  const torrent = writeP2PNetworkSettings({ strategy: 'torrent' });
  assert.equal(readP2PNetworkSettings().strategy, 'torrent');
  assert.deepEqual(trysteroOptionsForNetworkSettings(torrent), { strategy: 'torrent' });
});
