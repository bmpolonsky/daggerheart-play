import { test } from 'vitest';
import assert from 'node:assert/strict';
import { consumeMobilePreviewHistory, registerMobilePreviewHistory } from '../../src/app/mobilePreviewHistory';

const back = { type: 'popstate', isTrusted: true } as Event;
test('routers consult the active preview before navigation; closing it is consumed once', () => {
  let calls = 0;
  const remove = registerMobilePreviewHistory(() => { calls++; remove(); return true; });
  assert.equal(consumeMobilePreviewHistory(back), true);
  assert.equal(consumeMobilePreviewHistory(back), false);
  assert.equal(calls, 1);
});
test('synthetic application navigation and direct hash edits are not consumed', () => {
  let calls = 0;
  const remove = registerMobilePreviewHistory(() => { calls++; return true; });
  try {
    assert.equal(consumeMobilePreviewHistory({ type: 'popstate', isTrusted: false } as Event), false);
    assert.equal(consumeMobilePreviewHistory({ type: 'hashchange', isTrusted: true } as Event), false);
    assert.equal(calls, 0);
  } finally { remove(); }
});
test('an older preview cleanup cannot remove the replacement; a topmost-dialog refusal still routes', () => {
  const removeOld = registerMobilePreviewHistory(() => true);
  const removeNew = registerMobilePreviewHistory(() => false);
  try { removeOld(); assert.equal(consumeMobilePreviewHistory(back), false); }
  finally { removeNew(); }
  assert.equal(consumeMobilePreviewHistory(back), false);
});
