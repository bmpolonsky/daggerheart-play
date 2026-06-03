/** @jsxImportSource preact */
import { render } from 'preact';
import { SuperApp } from './SuperApp';
import { initSentry } from './core/observability/sentry';
import { bootServices } from './services/serviceRegistry';
import './styles/app-foundation.css';
import './styles/cinematic-vtt.css';

initSentry();

const root = document.getElementById('root') as HTMLElement;

void bootServices().finally(() => {
  render(<SuperApp />, root);
});
