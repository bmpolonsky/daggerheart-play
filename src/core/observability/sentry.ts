import * as Sentry from '@sentry/browser';

export function initSentry() {
  if (!__SENTRY_DSN__) return;

  Sentry.init({
    dsn: __SENTRY_DSN__,
    release: __APP_RELEASE__,
    integrations: (integrations) => [
      ...integrations,
      Sentry.browserTracingIntegration()
    ]
  });
}
