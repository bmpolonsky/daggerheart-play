import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isOptimizableImageType, webpFileName } from '../../src/core/images/optimizeImage';

test('only raw JPEG and PNG uploads enter the WebP optimization pipeline', () => {
  assert.equal(isOptimizableImageType('image/png'), true);
  assert.equal(isOptimizableImageType('image/jpeg'), true);
  assert.equal(isOptimizableImageType('image/webp'), false);
  assert.equal(isOptimizableImageType('image/avif'), false);
  assert.equal(isOptimizableImageType('image/gif'), false);
  assert.equal(isOptimizableImageType('image/svg+xml'), false);
});

test('optimized image names become stable WebP names', () => {
  assert.equal(webpFileName('large.scene.PNG'), 'large.scene.webp');
  assert.equal(webpFileName('portrait'), 'portrait.webp');
});
