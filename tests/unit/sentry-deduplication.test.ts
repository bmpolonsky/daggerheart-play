import { describe, expect, it } from 'vitest';
import { BrowserClient, defaultStackParser, dedupeIntegration, type ErrorEvent } from '@sentry/browser';
import { sanitizeOperationalEvent } from '../../src/core/observability/sentry';

function networkEvent(area: 'network' | 'auth' = 'network', code = 'network_error'): ErrorEvent {
  return {
    type: undefined,
    tags: { 'diagnostic.area': area, 'diagnostic.operation': 'heartbeat', 'diagnostic.errorCode': code, privateTag: 'PRIVATE' },
    exception: { values: [{
      type: 'Error',
      value: `Connection operation failed (${code})`,
      stacktrace: { frames: [{ filename: 'app.js', lineno: 20, colno: 5, function: 'safeOperationalError' }] }
    }] },
    contexts: { operation: { area, operation: 'heartbeat' }, privateContext: { secret: 'PRIVATE' } },
    breadcrumbs: [{ message: 'PRIVATE' }],
    user: { id: 'PRIVATE' },
    request: { url: 'https://example.test/PRIVATE', headers: { Authorization: 'PRIVATE' } },
    extra: { secret: 'PRIVATE' },
    transaction: 'PRIVATE'
  };
}

describe('Sentry operational event isolation', () => {
  it.each(['network', 'auth'] as const)('scrubs %s without mutating SDK-held event data', area => {
    const previousEvent = networkEvent(area);
    previousEvent.message = 'PRIVATE';
    const original = structuredClone(previousEvent);
    // Event processors and normalization shallow-copy the event, not exception.
    const eventForBeforeSend = { ...previousEvent };
    const outgoing = sanitizeOperationalEvent(eventForBeforeSend);
    expect(previousEvent).toEqual(original);
    expect(eventForBeforeSend).toEqual(original);
    expect(outgoing).not.toBe(eventForBeforeSend);
    expect(outgoing.exception).not.toBe(previousEvent.exception);
    expect(JSON.stringify(outgoing)).not.toContain('PRIVATE');
    expect(outgoing.exception?.values).toEqual([{ type: 'Error', value: 'Connection operation failed', mechanism: undefined }]);
  });

  it.each(['network', 'auth'] as const)('keeps SDK deduplication effective across 240 identical %s failures', async area => {
    const sent: unknown[] = [];
    const client = new BrowserClient({
      dsn: 'https://public@example.invalid/1',
      environment: 'test',
      stackParser: defaultStackParser,
      integrations: [dedupeIntegration()],
      transport: () => ({
        send: async envelope => { sent.push(envelope); return {}; },
        flush: async () => true
      }),
      beforeSend: sanitizeOperationalEvent
    });
    client.init();
    try {
      for (let i = 0; i < 240; i++) {
        // Actual installed SDK pipeline, with a completely local transport.
        client.captureEvent(networkEvent(area));
        await client.flush(1000);
      }
      expect(sent).toHaveLength(1);
      expect(JSON.stringify(sent)).not.toContain('PRIVATE');
      // A different failure still reaches the transport.
      client.captureEvent(networkEvent(area, 'auth_failed'));
      await client.flush(1000);
      expect(sent).toHaveLength(2);
      // SDK deduplication is consecutive-only, not a rate limiter: A/B/A sends A again.
      client.captureEvent(networkEvent(area));
      await client.flush(1000);
      expect(sent).toHaveLength(3);
      const changedStack = networkEvent(area);
      changedStack.exception!.values![0].stacktrace!.frames![0].lineno = 21;
      client.captureEvent(changedStack);
      await client.flush(1000);
      expect(sent).toHaveLength(4);
      const plainEvent: ErrorEvent = { type: undefined, exception: { values: [{ type: 'TypeError', value: 'Unrelated application failure' }] } };
      client.captureEvent(plainEvent);
      await client.flush(1000);
      expect(sent).toHaveLength(5);
      expect(JSON.stringify(sent.at(-1))).toContain('Unrelated application failure');
      expect(JSON.stringify(sent.at(-1))).toContain('TypeError');
    } finally {
      await client.close(1000);
    }
  });

  it('leaves non-operational application events intact', () => {
    const event: ErrorEvent = { type: undefined, tags: { 'diagnostic.area': 'app' }, exception: { values: [{ type: 'TypeError', value: 'Application defect' }] } };
    expect(sanitizeOperationalEvent(event)).toBe(event);
  });
});
