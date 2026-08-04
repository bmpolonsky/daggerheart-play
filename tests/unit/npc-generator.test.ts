import assert from 'node:assert/strict';
import { test } from 'vitest';
import { formatNpc, generateNpc } from '../../src/domain/generators/npc';

test('NPC generation is deterministic with an injected RNG', () => {
  const values = [0, 0.2, 0.4, 0.6, 0.8];
  const npc = generateNpc(() => values.shift() ?? 0);
  assert.deepEqual(npc, {
    name: 'Аверин',
    appearance: 'с серебряной прядью и внимательным взглядом',
    manner: 'нервно шутит в самые неподходящие моменты',
    motive: 'мечтает заслужить уважение своего бывшего наставника',
    detail: 'никогда не садится спиной к двери'
  });
  assert.match(formatNpc(npc), /Мотив: мечтает заслужить уважение/);
});
