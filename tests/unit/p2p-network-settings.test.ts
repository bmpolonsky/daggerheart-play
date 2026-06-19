import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  readP2PNetworkSettings,
  trysteroOptionsForNetworkSettings,
  writeP2PNetworkSettings
} from '../../src/domain/p2p/networkSettings';

test('P2P network settings use auto strategy by default and still allow Nostr debug mode', () => {
  writeP2PNetworkSettings({ strategy: 'auto' });
  assert.equal(readP2PNetworkSettings().strategy, 'auto');
  assert.deepEqual(trysteroOptionsForNetworkSettings(readP2PNetworkSettings()), { strategy: 'auto' });
  const settings = writeP2PNetworkSettings({ strategy: 'nostr' });
  assert.equal(readP2PNetworkSettings().strategy, 'nostr');
  assert.deepEqual(trysteroOptionsForNetworkSettings(settings), { strategy: 'nostr' });
});

test('P2P network settings resolve MQTT options', () => {
  const mqtt = writeP2PNetworkSettings({ strategy: 'mqtt' });
  assert.equal(readP2PNetworkSettings().strategy, 'mqtt');
  assert.deepEqual(trysteroOptionsForNetworkSettings(mqtt), { strategy: 'mqtt' });
});

test('P2P network settings resolve torrent options', () => {
  const torrent = writeP2PNetworkSettings({ strategy: 'torrent' });
  assert.equal(readP2PNetworkSettings().strategy, 'torrent');
  assert.deepEqual(trysteroOptionsForNetworkSettings(torrent), { strategy: 'torrent' });
});
