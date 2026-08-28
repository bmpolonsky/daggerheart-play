import assert from 'node:assert/strict';
import { test } from 'vitest';
import { cleanMarkdownText, cleanMarkdownValue } from '../../src/core/utils/markdownText';
import { rangeLabel } from '../../src/domain/rules/constants';

test('cleans Markdown links and decorative images in every plain-text surface', () => {
  const text = cleanMarkdownText('Излечите 1d4 [Ран](/rule/hit-points). ![](https://example.test/art.png) ![Схема](https://example.test/map.png)');

  assert.equal(text, 'Излечите 1d4 Ран. Схема');
});

test('removes rule destinations without inventing or breaking emphasis', () => {
  assert.equal(
    cleanMarkdownText('**Отметьте [Стресс](/rule/stress)**, чтобы *втянуться в панцирь*.'),
    '**Отметьте Стресс**, чтобы *втянуться в панцирь*.'
  );
  assert.equal(cleanMarkdownText('Бонус равен [Мастерству](/rule/proficiency).'), 'Бонус равен Мастерству.');
  assert.equal(
    cleanMarkdownText('Бонус равен [Мастерству](/rule/proficiency).', { emphasizeLinks: true }),
    'Бонус равен **Мастерству**.'
  );
  assert.equal(
    cleanMarkdownText('Вы можете **потратить [Надежду](/rule/hope)**.', { emphasizeLinks: true }),
    'Вы можете **потратить Надежду**.'
  );
  assert.equal(
    cleanMarkdownText('[**Потратьте Страх**](/rule/spending-fear).', { emphasizeLinks: true }),
    '**Потратьте Страх**.'
  );
  assert.equal(
    cleanMarkdownText('*[*Помощь союзнику* ](/rule/help-an-ally) *', { emphasizeLinks: true }),
    '*Помощь союзнику*'
  );
  assert.equal(
    cleanMarkdownText('*[*Страх* ](/rule/fear) *и', { emphasizeLinks: true }),
    '*Страх* и'
  );
  assert.equal(
    cleanMarkdownText('*Отсчёт (*[*Цикл* ](/rule/loop-countdown) *1d6)*', { emphasizeLinks: true }),
    '*Отсчёт (Цикл 1d6)*'
  );
  assert.equal(
    cleanMarkdownText('> ***Совет:** текст *[*Помощь союзнику* ](/rule/help-an-ally) *.', { emphasizeLinks: true }),
    '> ***Совет:** текст Помощь союзнику*.'
  );
  assert.equal(
    cleanMarkdownText('* **Утешение:** один раз за [отдых](/rule/rest) получите [Надежду](/rule/hope).', { emphasizeLinks: true }),
    '* **Утешение:** один раз за **отдых** получите **Надежду**.'
  );
  assert.equal(
    cleanMarkdownText('**Потратьте 3 горсти** **золота (или** [Страх](/rule/fear)**)**.', { emphasizeLinks: true }),
    '**Потратьте 3 горсти** **золота (или Страх)**.'
  );
  assert.equal(
    cleanMarkdownText('**Потратьте количество** [**Надежды**](/rule/hope) **в размере половины уровня карты**.', { emphasizeLinks: true }),
    '**Потратьте количество** **Надежды** **в размере половины уровня карты**.'
  );
  assert.equal(
    cleanMarkdownText('*Их командира,* [*Скелета-рыцаря* ](/adversary/skeleton-knight) *.', { emphasizeLinks: true }),
    '*Их командира, Скелета-рыцаря*.'
  );
  assert.deepEqual(
    cleanMarkdownValue({ features: [{ text: '**[Стресс](/rule/stress)**' }] }),
    { features: [{ text: '**Стресс**' }] }
  );
});

test('uses one canonical label for persisted and API range values', () => {
  assert.equal(rangeLabel('very-close'), 'Близкая');
  assert.equal(rangeLabel('Очень далеко'), 'Очень далёкая');
  assert.equal(rangeLabel('any'), 'Любая');
});
