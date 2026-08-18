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
