import { describe, expect, it } from 'vitest';
import { connectionDiagnosticHint, createSafeDiagnosticReport, stageElapsedMs } from '../../src/domain/p2p/diagnosticReport';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import type { ConnectionStageDiagnostic } from '../../src/domain/p2p/connectionDiagnostics';

const stage: ConnectionStageDiagnostic = { id: 'auth-session', status: 'running', startedAt: 1000, finishedAt: null, timeoutMs: 15000 };
const session = {
  connected: false, status: 'connecting', role: 'player', roomId: 'SECRET_ROOM', peerId: 'SECRET_PEER', peers: ['SECRET_PEER'],
  lastSnapshotAt: null, latestRollAnimationId: null, lastRequestAt: null, message: 'SECRET_MESSAGE', transportMode: 'hybrid',
  connectionDiagnostics: [stage], routes: [{ strategy: 'supabase', status: 'waiting', activePeers: ['SECRET_PEER'], lastSeenAt: null, rttMs: null, error: 'SECRET_ERROR' }], routePeers: [],
  characterSync: { SECRET_ACTOR: { actorId: 'SECRET_ACTOR' } }
} as unknown as P2PSessionState;

describe('Safe connection report', () => {
  it('omits identities, raw errors, arbitrary state and secrets', () => {
    const report = createSafeDiagnosticReport(session, [], 4000, '479c401', true);
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/SECRET|roomId|peerId|characterSync|message|lastSeenAt/);
    expect(report.session.connectionDiagnostics[0]).toMatchObject({ id: 'auth-session', status: 'running', elapsedMs: 3000 });
    expect(report.session.routes[0]).toMatchObject({ status: 'waiting', activePeers: 1, hasError: true });
  });
  it('does not pass unexpected stage error codes through', () => {
    const report = createSafeDiagnosticReport({ ...session, connectionDiagnostics: [{ ...stage, errorCode: 'SECRET' }] as unknown as ConnectionStageDiagnostic[] }, [], 4000, 'SECRET?token=SECRET', true);
    expect(JSON.stringify(report)).not.toContain('SECRET');
    expect(report.release).toBe('unknown');
  });
  it('explains the stalled step without claiming a network block is proven', () => {
    const hint = connectionDiagnosticHint({ ...session, connectionDiagnostics: [{ ...stage, status: 'timed-out', errorCode: 'timeout' }] });
    expect(hint).toContain('Проверка входа в Supabase');
    expect(hint).toContain('не доказывает блокировку');
    expect(connectionDiagnosticHint({ ...session, connected: true, role: 'gm', peers: [], connectionDiagnostics: [] })).toContain('ожидает игроков');
  });
  it('does not call an optional P2P failure a failed cloud connection', () => {
    const hint = connectionDiagnosticHint({ ...session, connected: true, lastSnapshotAt: '2026-11-05T16:00:00Z', connectionDiagnostics: [{ ...stage, id: 'p2p-nostr', status: 'failed', errorCode: 'network_error' }] });
    expect(hint).toContain('Облачное подключение готово');
    expect(hint).not.toContain('Остановилось');
  });
  it('exports only the safe journal schema', () => {
    const report = createSafeDiagnosticReport(session, [], 4000, '479c401', true, [{ at: 4000, area: 'network', operation: 'auth-session', phase: 'failed', message: 'SECRET', roomId: 'SECRET' }] as never);
    expect(JSON.stringify(report)).not.toContain('SECRET');
    expect(report.journal).toHaveLength(1);
  });
  it('fixes duration at completion and handles not-started stages', () => {
    expect(stageElapsedMs({ ...stage, startedAt: null }, 9000)).toBeNull();
    expect(stageElapsedMs({ ...stage, finishedAt: 2500 }, 9000)).toBe(1500);
  });
});

it('explains a successful cloud-to-P2P fallback rather than claiming the connection stopped', () => {
  const hint = connectionDiagnosticHint({ connected: true, role: 'player', peers: ['local-peer'], lastSnapshotAt: 'now', transportMode: 'p2p', connectionDiagnostics: [
    { id: 'room-join', status: 'failed', startedAt: 1, finishedAt: 2, timeoutMs: 15000, errorCode: 'room_not_found' },
    { id: 'handshake', status: 'succeeded', startedAt: 3, finishedAt: 4, timeoutMs: 15000 }
  ] });
  expect(hint).toContain('продолжено по P2P');
  expect(hint).not.toContain('Остановилось');
});
