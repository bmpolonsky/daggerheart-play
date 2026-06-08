import assert from "node:assert/strict";
import { test } from "vitest";
import { publicAssetUrl } from "../../src/domain/content/publicAssets";

test('public asset URLs respect GitHub Pages base paths', () => {
  assert.equal(
    publicAssetUrl('/image/environment/cliffside-tavern.png', '/daggerheart-play'),
    'http://localhost/daggerheart-play/image/environment/cliffside-tavern.webp'
  );
  assert.equal(
    publicAssetUrl('/daggerheart-play/image/environment/cliffside-tavern.png', '/daggerheart-play'),
    'http://localhost/daggerheart-play/image/environment/cliffside-tavern.webp'
  );
  assert.equal(
    publicAssetUrl('./image/domain/card/rune-ward.jpg', '/daggerheart-play'),
    'http://localhost/daggerheart-play/image/domain/card/rune-ward.webp'
  );
});

test('public asset URLs normalize same-origin legacy image extensions', () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: {
        origin: 'https://bmpolonsky.github.io',
        pathname: '/daggerheart-play/gm'
      }
    },
    configurable: true
  });
  try {
    assert.equal(
      publicAssetUrl('https://bmpolonsky.github.io/daggerheart-play/image/domain/card/unleash-chaos.jpg', '/daggerheart-play'),
      'https://bmpolonsky.github.io/daggerheart-play/image/domain/card/unleash-chaos.webp'
    );
    assert.equal(
      publicAssetUrl('https://example.test/image/domain/card/unleash-chaos.jpg', '/daggerheart-play'),
      'https://example.test/image/domain/card/unleash-chaos.jpg'
    );
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});
