/** @jsxImportSource preact */
import { render } from 'preact';
import { observeTechnicalOperation } from './core/observability/technicalJournal';
import { App } from './App';
import { initSentry, reportOperationalError } from './core/observability/sentry';
import { bootServices, offlineService } from './services/serviceRegistry';
import './styles/app-foundation.css';
import './styles/cinematic-vtt.css';

initSentry();

const root = document.getElementById('root') as HTMLElement;

void observeTechnicalOperation({ area: 'startup', operation: 'initialize' }, bootServices).catch((error) => {
  reportOperationalError(error, { area: 'app', operation: 'boot-services' });
}).finally(() => {
  render(<App />, root);
  void offlineService.start();
});
