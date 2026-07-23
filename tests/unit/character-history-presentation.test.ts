import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  characterHistoryFieldLabel,
  formatCharacterChangeValue,
  formatCharacterFieldChange
} from '../../src/ui/characters/characterHistoryPresentation';

test('character history presents domain card changes by name instead of serialized data', () => {
  const text = formatCharacterFieldChange({
    path: ['domainCards'],
    beforeExists: true,
    afterExists: true,
    before: [{
      id: 'domain-card:unleash-chaos',
      name: 'Высвобождение хаоса',
      level: 1,
      text: 'Старый длинный текст правила'
    }],
    after: [{
      id: 'domain-card:unleash-chaos',
      name: 'Высвобождение хаоса',
      level: 1,
      text: 'Новый длинный текст правила'
    }]
  });

  assert.equal(text, 'Обновлено: Высвобождение хаоса — уровень 1');
  assert.equal(text.includes('{'), false);
  assert.equal(text.includes('"text"'), false);
});

test('character history summarizes added and removed named collection items', () => {
  const text = formatCharacterFieldChange({
    path: ['experiences'],
    beforeExists: true,
    afterExists: true,
    before: [{ id: 'old', name: 'Старый опыт', modifier: 2 }],
    after: [{ id: 'new', name: 'Новый опыт', modifier: 3 }]
  });

  assert.equal(text, 'Добавлено: Новый опыт +3 — Убрано: Старый опыт +2');
});

test('character history keeps resources, images, and nested labels compact', () => {
  assert.equal(formatCharacterChangeValue({ marked: 2, max: 6 }), '2/6');
  assert.equal(formatCharacterChangeValue('data:image/png;base64,very-long-data', ['portraitUrl']), 'изображение');
  assert.equal(characterHistoryFieldLabel(['traits', 'agility']), 'Характеристики — Проворность');
  assert.equal(characterHistoryFieldLabel(['thresholds', 'major']), 'Пороги — Тяжёлый');
});
