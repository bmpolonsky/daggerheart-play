import assert from "node:assert/strict";
import { test } from "vitest";
import { portablePublicAssetPath, publicAssetUrl } from "../../src/domain/content/publicAssets";

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
  assert.equal(
    publicAssetUrl('/image/domain/stress-cost.avif', '/daggerheart-play'),
    'http://localhost/daggerheart-play/image/domain/stress-cost.webp'
  );
});

test('public asset URLs normalize same-origin legacy image extensions', () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: {
        origin: 'https://bmpolonsky.github.io',
        pathname: '/daggerheart-play/game'
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

test('public asset URLs ignore path-only library routes', () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: {
        origin: 'http://localhost:5173',
        pathname: '/library/characters'
      }
    },
    configurable: true
  });
  try {
    assert.equal(
      publicAssetUrl('/image/subclass/troubadour.webp'),
      'http://localhost:5173/image/subclass/troubadour.webp'
    );
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('public asset URLs survive moving between GitHub Pages and localhost', () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    value: { location: { origin: 'http://localhost:5173', pathname: '/game' } },
    configurable: true
  });
  try {
    assert.equal(
      portablePublicAssetPath('https://bmpolonsky.github.io/daggerheart-play/image/domain/card/rain-of-blades.webp'),
      './image/domain/card/rain-of-blades.webp'
    );
    assert.equal(portablePublicAssetPath('image/domain/card/rain-of-blades.webp'), './image/domain/card/rain-of-blades.webp');
    assert.equal(
      publicAssetUrl('/daggerheart-play/image/adversary/jagge-knife-bandit.webp'),
      'http://localhost:5173/image/adversary/jagge-knife-bandit.webp'
    );
    assert.equal(
      publicAssetUrl('http://localhost:5173/daggerheart-play/image/domain/card/rain-of-blades.webp'),
      'http://localhost:5173/image/domain/card/rain-of-blades.webp'
    );
    assert.equal(
      publicAssetUrl('https://example.test/image/custom.webp'),
      'https://example.test/image/custom.webp'
    );
    assert.equal(
      publicAssetUrl('https://example.test/daggerheart-play/image/custom.webp'),
      'https://example.test/daggerheart-play/image/custom.webp'
    );
    assert.equal(
      publicAssetUrl('https://bmpolonsky.github.io/image/custom.webp'),
      'https://bmpolonsky.github.io/image/custom.webp'
    );
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});
