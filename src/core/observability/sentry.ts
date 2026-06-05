export function initSentry() {
  if (!__SENTRY_DSN__) return;

  void import('@sentry/browser')
    .then((Sentry) => {
      Sentry.init({
        dsn: __SENTRY_DSN__,
        release: __APP_RELEASE__,
        environment: 'production',
        sendDefaultPii: true,
        tracesSampleRate: 1.0,
        integrations: (integrations) => [
          ...integrations,
          Sentry.browserTracingIntegration({
            beforeStartSpan: (context) => ({
              ...context,
              name: context.name.replace(/\/(join|player)\/[^/?#]+/, '/$1/:roomCode')
            })
          })
        ]
      });
    })
    .catch(() => undefined);
}
