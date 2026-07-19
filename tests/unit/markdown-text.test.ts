import assert from 'node:assert/strict';
import { test } from 'vitest';
import { cleanMarkdownText } from '../../src/core/utils/markdownText';
import { rangeLabel } from '../../src/domain/rules/constants';

test('cleans Markdown links and decorative images in every plain-text surface', () => {
  const text = cleanMarkdownText('Излечите 1d4 [Ран](/rule/hit-points). ![](https://example.test/art.png) ![Схема](https://example.test/map.png)');

  assert.equal(text, 'Излечите 1d4 Ран. Схема');
});

test('uses one canonical label for persisted and API range values', () => {
  assert.equal(rangeLabel('very-close'), 'Близкая');
  assert.equal(rangeLabel('Очень далеко'), 'Очень далёкая');
  assert.equal(rangeLabel('any'), 'Любая');
});
