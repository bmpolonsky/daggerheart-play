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
      for (const [key, value] of Object.entries(context.tags ?? {})) {
        if (value !== undefined && value !== null) scope.setTag(key, String(value));
      }
      for (const key of ['roomId', 'worldId', 'participantId'] as const) {
        const value = context.details?.[key];
        if (value !== undefined && value !== null) scope.setTag(`diagnostic.${key}`, String(value));
      }
      const errorMetadata = readErrorMetadata(error);
      if (errorMetadata.code) scope.setTag('diagnostic.errorCode', errorMetadata.code);
      if (errorMetadata.status) scope.setTag('diagnostic.httpStatus', errorMetadata.status);
      scope.setContext('operation', compactValues({
        area: context.area,
        operation: context.operation,
        online: typeof navigator === 'undefined' ? undefined : navigator.onLine,
        ...context.details
      }));
      Sentry.captureException(asError(error));
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
    url.search = '';
    url.hash = url.hash.replace(/#\/(join|player)\/[^/?#]+/i, '#/$1/:roomCode');
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
          return event;
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

function readErrorMetadata(error: unknown): { code?: string; status?: string } {
  if (!error || typeof error !== 'object') return {};
  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' || typeof record.code === 'number' ? String(record.code) : undefined;
  const statusValue = record.status ?? record.statusCode;
  const status = typeof statusValue === 'string' || typeof statusValue === 'number' ? String(statusValue) : undefined;
  return { code, status };
}

function compactValues(values: Record<string, DiagnosticValue>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined));
}
