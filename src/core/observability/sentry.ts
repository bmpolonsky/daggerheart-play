import type * as SentryBrowser from '@sentry/browser';

type DiagnosticValue = string | number | boolean | null | undefined;

export interface OperationalErrorContext {
  area: 'app' | 'auth' | 'content' | 'media' | 'network' | 'persistence' | 'storage';
  operation: string;
  tags?: Record<string, DiagnosticValue>;
  details?: Record<string, DiagnosticValue>;
}

let sentryPromise: Promise<typeof SentryBrowser | null> | null = null;
const reportedErrors = new WeakSet<object>();

export function initSentry(): void {
  void loadSentry();
}

export function reportOperationalError(error: unknown, context: OperationalErrorContext): void {
  if (error && typeof error === 'object') {
    if (reportedErrors.has(error)) return;
    reportedErrors.add(error);
  }

  void loadSentry().then((Sentry) => {
    if (!Sentry) return;
    Sentry.withScope((scope) => {
      scope.setTag('diagnostic.area', context.area);
      scope.setTag('diagnostic.operation', context.operation);
      const safe = safeOperationalError(error, context);
      for (const [key, value] of Object.entries(safe.tags)) scope.setTag(key, value);
      scope.setContext('operation', {
        area: context.area,
        operation: context.operation,
        online: typeof navigator === 'undefined' ? undefined : navigator.onLine
      });
      Sentry.captureException(safe.error);
    });
  });
}

export function sanitizeDiagnosticUrl(value: string): string {
  const redacted = value
    .replace(/\/(join|player)\/[^/?#\s]+/gi, '/$1/:roomCode')
    .replace(/(\/storage\/v1\/object\/world-assets)\/[^/\s]+\/[^/\s]+\/assets\/[^/?#\s]+/gi, '$1/:owner/:world/assets/:asset');
  if (!/^(?:https?|wss?):\/\//i.test(redacted)) return redacted;
  try {
    const url = new URL(redacted);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = /^#\/(join|player)\//i.test(url.hash) ? url.hash.replace(/(#\/(join|player)\/).*/i, '$1:roomCode') : '';
    url.pathname = url.pathname
      .replace(/\/(join|player)\/[^/?#]+/gi, '/$1/:roomCode')
      .replace(/(\/storage\/v1\/object\/world-assets)\/[^/]+\/[^/]+\/assets\/[^/?#]+/i, '$1/:owner/:world/assets/:asset');
    return url.toString();
  } catch {
    return redacted;
  }
}

function loadSentry(): Promise<typeof SentryBrowser | null> {
  if (!__SENTRY_DSN__) return Promise.resolve(null);
  sentryPromise ??= import('@sentry/browser')
    .then((Sentry) => {
      Sentry.init({
        dsn: __SENTRY_DSN__,
        release: __APP_RELEASE__,
        environment: 'production',
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
        beforeBreadcrumb: (breadcrumb) => {
          if (breadcrumb.data) {
            for (const key of ['url', 'from', 'to']) {
              if (typeof breadcrumb.data[key] === 'string') breadcrumb.data[key] = sanitizeDiagnosticUrl(breadcrumb.data[key]);
            }
          }
          return breadcrumb;
        },
        beforeSend: (event) => {
          if (event.request?.url) event.request.url = sanitizeDiagnosticUrl(event.request.url);
          return sanitizeOperationalEvent(event);
        },
        integrations: (integrations) => [
          ...integrations,
          Sentry.browserTracingIntegration({
            beforeStartSpan: (context) => ({
              ...context,
              name: sanitizeDiagnosticUrl(context.name)
            })
          })
        ]
      });
      return Sentry;
    })
    .catch(() => null);
  return sentryPromise;
}

function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const normalized = new Error(error.message);
    if ('name' in error && typeof error.name === 'string') normalized.name = error.name;
    return normalized;
  }
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

const SAFE_ERROR_CODES = new Set([
  'auth_failed', 'auth_required', 'room_not_found', 'master_offline', 'room_in_use',
  'participant_in_use', 'rate_limited', 'server_error', 'timeout', 'cancelled',
  'network_error', 'realtime_error', 'realtime_closed', 'operation_failed'
]);

/** No identifier, request payload or arbitrary backend error text leaves this boundary. */
export function safeOperationalError(error: unknown, context: OperationalErrorContext): { error: Error; tags: Record<string, string> } {
  const tags: Record<string, string> = {};
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = record.code ?? context.tags?.errorCode;
  if (typeof code === 'string' && SAFE_ERROR_CODES.has(code)) tags['diagnostic.errorCode'] = code;
  const status = Number(record.status ?? record.statusCode);
  if (Number.isInteger(status) && status >= 100 && status <= 599) tags['diagnostic.httpStatus'] = String(status);
  if (context.tags?.provider === 'supabase') tags.provider = 'supabase';
  if (context.tags?.role === 'gm' || context.tags?.role === 'player') tags.role = context.tags.role;
  // Network/auth exceptions may embed JWTs, RPC arguments, signed URLs or room codes.
  const safeError = context.area === 'network' || context.area === 'auth'
    ? new Error(`Connection operation failed (${tags['diagnostic.errorCode'] ?? 'unknown_error'})`)
    : asError(error);
  return { error: safeError, tags };
}

export function sanitizeOperationalEvent<T extends SentryBrowser.ErrorEvent>(event: T): T {
  if (event.tags?.['diagnostic.area'] !== 'network' && event.tags?.['diagnostic.area'] !== 'auth') return event;
  // SDK-collected breadcrumbs, request headers and extra context can undo an otherwise
  // sanitized exception. This applies only to our network/auth operational reports.
  delete event.breadcrumbs;
  delete event.request;
  delete event.user;
  delete event.extra;
  event.contexts = event.contexts?.operation ? { operation: event.contexts.operation } : {};
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map(value => ({
      type: 'Error', value: 'Connection operation failed', mechanism: value.mechanism
    }));
  }
  delete event.message;
  delete event.transaction;
  const allowedTags = new Set(['diagnostic.area', 'diagnostic.operation', 'diagnostic.errorCode', 'diagnostic.httpStatus', 'provider', 'role']);
  event.tags = Object.fromEntries(Object.entries(event.tags ?? {}).filter(([key]) => allowedTags.has(key)));
  return event;
}
