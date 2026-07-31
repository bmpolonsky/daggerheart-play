/// <reference types="vite/client" />

declare const __APP_RELEASE__: string;
declare const __SENTRY_DSN__: string;

interface ImportMetaEnv {
  readonly VITE_SESSION_MODE?: 'p2p' | 'server';
}
