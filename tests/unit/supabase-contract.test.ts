import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

const migration = readFileSync('supabase/migrations/202608120001_server_transport.sql', 'utf8');
const turnFunction = readFileSync('supabase/functions/turn-credentials/index.ts', 'utf8');

test('Supabase room contract keeps writes behind authenticated RPCs', () => {
  assert.match(migration, /revoke all on public\.dh_worlds[\s\S]+from anon, authenticated;/);
  assert.match(migration, /not is_anonymous/);
  assert.match(migration, /dh_claim_turn_credentials/);
  assert.match(migration, /length\(p_fragments::text\) > 8388608/);
  assert.match(migration, /delete from public\.dh_rooms[\s\S]+interval '7 days'/);
});

test('TURN function verifies the caller and claims a rate-limited credential slot', () => {
  assert.match(turnFunction, /global: \{ headers: \{ authorization \} \}/);
  assert.match(turnFunction, /dh_claim_turn_credentials/);
  assert.doesNotMatch(turnFunction, /TURN_KEY_API_TOKEN.*VITE_/);
});
