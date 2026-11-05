import { describe, expect, it } from 'vitest';
import { playerSeatAvailability } from '../../src/domain/p2p/playerSeatAvailability';
import { createLocalParticipant } from '../../src/domain/tabletop/factories';
const snapshot = { role: 'player' as const, roomId: 'CURRENT', lastSnapshotAt: '2026-11-05T18:00:00Z' };
const gm = createLocalParticipant({ id: 'gm', role: 'gm' });
const player = createLocalParticipant({ id: 'seat', role: 'player', actorIds: [], connected: false });
describe('player seat availability', () => {
  it('distinguishes a received empty or GM-only roster from a missing snapshot', () => {
    expect(playerSeatAvailability(snapshot, 'CURRENT', {})).toEqual({ hasSnapshot: true, seats: [] });
    expect(playerSeatAvailability(snapshot, 'CURRENT', { gm })).toEqual({ hasSnapshot: true, seats: [] });
    expect(playerSeatAvailability({ ...snapshot, lastSnapshotAt: null }, 'CURRENT', { player })).toEqual({ hasSnapshot: false, seats: [] });
  });
  it('keeps disconnected seats without an assigned character available', () => {
    expect(playerSeatAvailability(snapshot, 'CURRENT', { gm, player }).seats).toEqual([player]);
  });
  it('does not expose old-room or GM snapshot seats while joining another room', () => {
    expect(playerSeatAvailability(snapshot, 'NEW', { player })).toEqual({ hasSnapshot: false, seats: [] });
    expect(playerSeatAvailability({ ...snapshot, role: 'gm' }, 'CURRENT', { player })).toEqual({ hasSnapshot: false, seats: [] });
  });
});
