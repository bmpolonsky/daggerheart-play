export function initSentry() {
  if (!__SENTRY_DSN__) return;

  void import('@sentry/browser')
    .then((Sentry) => {
      Sentry.init({
        dsn: __SENTRY_DSN__,
        release: __APP_RELEASE__,
        integrations: (integrations) => [
          ...integrations,
          Sentry.browserTracingIntegration()
        ]
      });
    })
    .catch(() => undefined);
}
