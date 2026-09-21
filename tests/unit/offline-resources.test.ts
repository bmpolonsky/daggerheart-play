import { createCharacter } from '../../src/domain/rules/factories';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { offlineAssetIds, offlineResourceUrls } from '../../src/domain/offline/offlineResources';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import { createMapAsset, createTableScene } from '../../src/domain/tabletop/factories';
import { emptyCustomContent } from '../../src/domain/game/gameDocument';

test('offline preparation selects current game media, not links or the whole world asset library', () => {
  const state = structuredClone(snapshotPersistedState());
  const scene = createTableScene();
  state.sceneTable.scenes = { [scene.id]: scene };
  scene.backgroundUrl = '/image/environment/test.jpg';
  scene.music.sourceUrl = 'https://media.example.test/theme.mp3';
  scene.notes = 'https://example.test/do-not-fetch';
  const used = createMapAsset({ name: 'Current map', mimeType: 'image/png', storage: 'remote', url: 'https://media.example.test/map.png' });
  const unused = createMapAsset({ name: 'Other map', mimeType: 'image/png', storage: 'remote', url: 'https://media.example.test/other-game.png' });
  scene.backgroundAssetId = used.id;
  state.sceneTable.assets = { [used.id]: used, [unused.id]: unused };
  const urls = offlineResourceUrls(state, '/daggerheart-play');
  assert.deepEqual(offlineAssetIds(state), [used.id]);
  assert.ok(urls.includes('http://localhost/daggerheart-play/image/environment/test.webp'));
  assert.ok(urls.includes('https://media.example.test/theme.mp3'));
  assert.ok(urls.includes(used.url!));
  assert.ok(!urls.includes(unused.url!));
  assert.ok(!urls.includes(scene.notes));
  assert.ok(!urls.some((url) => url.startsWith('data:')));
  assert.equal(urls.length, new Set(urls).size);
  scene.music.sourceUrl = '/music/theme.mp3';
  assert.ok(offlineResourceUrls(state, '/daggerheart-play').includes('http://localhost/music/theme.mp3'));
});

test('optional artwork includes media from custom compendium entries outside the current game', () => {
  const state = snapshotPersistedState();
  const customContent = emptyCustomContent();
  const imageUrl = 'https://media.example.test/custom-adversary.svg';
  customContent.adversaries = [{ name: 'Custom adversary', image_url: imageUrl, motives: 'https://example.test/not-media' }];
  customContent.domainCards = [{ name: 'Custom card', image_url: '/image/card.png', domain_image_url: imageUrl }];
  customContent.ancestries = [{ name: 'Embedded portrait', image_url: 'data:image/png;base64,example' }];
  customContent.cardDomains = [{ icon: 'https://media.example.test/domain.svg' }, { icon: 'data:image/svg+xml,example' }, { icon: null }];
  assert.ok(!offlineResourceUrls(state).includes(imageUrl));
  const urls = offlineResourceUrls(state, '/daggerheart-play', customContent);
  assert.ok(urls.includes(imageUrl));
  assert.ok(urls.includes('https://media.example.test/domain.svg'));
  assert.ok(urls.includes('http://localhost/daggerheart-play/image/card.webp'));
  assert.ok(!urls.includes('https://example.test/not-media'));
  assert.ok(!urls.some((url) => url.startsWith('data:')));
  assert.equal(urls.filter((url) => url === imageUrl).length, 1);
});


test('offline preparation includes stored portraits without treating asset references as HTTP URLs', () => {
  const state = structuredClone(snapshotPersistedState());
  const hero = createCharacter({ id: 'hero', portraitUrl: 'asset:portrait' });
  state.characters = { ...state.characters, entities: { hero }, order: ['hero'] };
  const custom = { ...emptyCustomContent(), adversaries: [{ image_url: 'asset:enemy' }] };
  assert.ok(offlineAssetIds(state, custom).includes('portrait'));
  assert.ok(offlineAssetIds(state, custom).includes('enemy'));
  assert.ok(!offlineResourceUrls(state, undefined, custom).some(url => url.includes('asset:')));
});
