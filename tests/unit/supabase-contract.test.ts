import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

const migration = readFileSync('supabase/migrations/202608120001_server_transport.sql', 'utf8');
const p2pTurnMigration = readFileSync('supabase/migrations/202608160001_p2p_turn_rooms.sql', 'utf8');
const roomMemberIdentityMigration = readFileSync('supabase/migrations/202608160002_room_member_identity.sql', 'utf8');
const assetPolicyMigration = readFileSync('supabase/migrations/202608160003_fix_asset_storage_policies.sql', 'utf8');
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
  assert.match(turnFunction, /https:\/\/daggerheart-play\.bmpolonsky\.chatgpt\.site/);
  assert.doesNotMatch(turnFunction, /TURN_KEY_API_TOKEN.*VITE_/);
});

test('P2P TURN registry stores no game state and is available only through its RPC', () => {
  assert.match(p2pTurnMigration, /create table public\.dh_p2p_turn_rooms/);
  assert.match(p2pTurnMigration, /revoke all on public\.dh_p2p_turn_rooms, public\.dh_p2p_turn_members from anon, authenticated/);
  assert.match(p2pTurnMigration, /dh_claim_p2p_turn_credentials/);
  assert.match(p2pTurnMigration, /current_attempts > 30/);
  assert.match(p2pTurnMigration, /current_issuance <= 3/);
  assert.doesNotMatch(p2pTurnMigration, /jsonb|world_state|snapshot/);
  assert.match(turnFunction, /dh_claim_p2p_turn_credentials/);
});

test('Supabase room join replaces a reloaded browser participant instead of duplicating it', () => {
  assert.match(roomMemberIdentityMigration, /unique \(room_id, incarnation, user_id\)/);
  assert.match(roomMemberIdentityMigration, /on conflict on constraint dh_room_members_user_unique do update set/);
  assert.match(roomMemberIdentityMigration, /peer_id = excluded\.peer_id/);
});

test('asset policies validate the outer storage path rather than the world title', () => {
  assert.match(migration, /storage\.foldername\(storage\.objects\.name\)/);
  assert.match(assetPolicyMigration, /storage\.foldername\(storage\.objects\.name\)/);
  assert.doesNotMatch(assetPolicyMigration, /storage\.foldername\(world\.name\)/);
});
