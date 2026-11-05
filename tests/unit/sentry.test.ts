import { describe, expect, it } from 'vitest';
import { sanitizeDiagnosticUrl } from '../../src/core/observability/sentry';

describe('Sentry diagnostics', () => {
  it('redacts room links, storage object paths and query parameters', () => {
    expect(sanitizeDiagnosticUrl('https://example.test/#/join/D8MX4M')).toBe('https://example.test/#/join/:roomCode');
    expect(sanitizeDiagnosticUrl('https://project.supabase.co/rest/v1/dh_world_state?owner_id=eq.secret')).toBe(
      'https://project.supabase.co/rest/v1/dh_world_state'
    );
    expect(sanitizeDiagnosticUrl(
      'https://project.supabase.co/storage/v1/object/world-assets/owner/world/assets/asset-id'
    )).toBe('https://project.supabase.co/storage/v1/object/world-assets/:owner/:world/assets/:asset');
  });

  it('keeps non-url transaction names readable', () => {
    expect(sanitizeDiagnosticUrl('GET /join/D8MX4M')).toBe('GET /join/:roomCode');
  });
});

import { safeOperationalError, sanitizeOperationalEvent } from '../../src/core/observability/sentry';

describe('Operational diagnostic privacy', () => {
  it('allowlists metadata and excludes raw network errors and identities', () => {
    const safe = safeOperationalError({ message: 'secret JWT room-ABC alice@example.test', code: 'room_not_found', status: 404 }, {
      area: 'network', operation: 'join', tags: { roomId: 'room-ABC', provider: 'supabase', role: 'player', errorCode: 'secret' },
      details: { participantId: 'alice', roomId: 'room-ABC', worldId: 'private-world' }
    });
    expect(JSON.stringify(safe.tags)).not.toMatch(/secret|room-ABC|alice|private-world/);
    expect(safe.tags).toEqual({ 'diagnostic.errorCode': 'room_not_found', 'diagnostic.httpStatus': '404', provider: 'supabase', role: 'player' });
    expect(safe.error.message).not.toMatch(/secret|alice|JWT/);
    expect(safeOperationalError({ code: 'private-secret', status: 'secret' }, { area: 'auth', operation: 'login' }).tags).toEqual({});
  });

  it('drops SDK-collected private context for network reports', () => {
    const event = sanitizeOperationalEvent({
      type: undefined,
      tags: { 'diagnostic.area': 'network', 'diagnostic.roomId': 'secret' },
      transaction: 'secret',
      breadcrumbs: [{ message: 'secret' }], user: { id: 'secret' }, extra: { secret: 'secret' },
      request: { url: 'https://example.test/secret', headers: { Authorization: 'secret' } },
      contexts: { operation: { operation: 'join' }, arbitrary: { value: 'secret' } },
      exception: { values: [{ type: 'Error', value: 'secret', stacktrace: { frames: [{ filename: 'secret' }] } }] }
    });
    expect(JSON.stringify(event)).not.toContain('secret');
    expect(event.contexts).toEqual({ operation: { operation: 'join' } });
  });

  it('removes credentials and invite hash parameters', () => {
    expect(sanitizeDiagnosticUrl('https://alice:secret@example.test/#/join/CODE?token=secret')).toBe('https://example.test/#/join/:roomCode');
    expect(sanitizeDiagnosticUrl('https://example.test/#access_token=secret')).toBe('https://example.test/');
  });
});
