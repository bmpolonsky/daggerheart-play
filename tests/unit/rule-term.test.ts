import assert from 'node:assert/strict';
import { test } from 'vitest';
import { plainRuleSummary, ruleSectionSummary } from '../../src/ui/vtt/playerView/CompendiumRuleTerm';

test('contextual rule summaries come from clean source text and can target one article section', () => {
  const body = [
    'Вводная часть.',
    '',
    '##### Использование опыта {#using-experiences}',
    '',
    'Потратьте [Надежду](/rule/hope), чтобы добавить **Опыт** к броску.',
    '',
    '##### Изменение опыта {#changing-experiences}',
    '',
    'Этот текст уже относится к следующему разделу.'
  ].join('\n');

  assert.equal(
    ruleSectionSummary(body, 'using-experiences'),
    'Потратьте Надежду, чтобы добавить Опыт к броску.'
  );
  assert.equal(
    plainRuleSummary('**Стресс** отражает напряжение. {#stress}'),
    'Стресс отражает напряжение.'
  );
  assert.equal(
    ruleSectionSummary([
      '## Проворность {#agility}',
      '',
      '*Пробежать, Прыгнуть, Маневрировать*',
      '',
      'Высокая Проворность означает скорость и ловкость.',
      '',
      '## Сила {#strength}',
      '',
      'Следующий раздел.'
    ].join('\n'), 'agility'),
    'Пробежать, Прыгнуть, Маневрировать Высокая Проворность означает скорость и ловкость.'
  );
});
