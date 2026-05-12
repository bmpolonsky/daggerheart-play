/** @jsxImportSource preact */
import { render } from 'preact';
import { SuperApp } from './SuperApp';
import { bootServices } from './services/serviceRegistry';
import './styles/global.css';
import './styles/cinematic-vtt.css';

const root = document.getElementById('root') as HTMLElement;
render(<div className="app-loading">Загрузка...</div>, root);

void bootServices().finally(() => {
  render(<SuperApp />, root);
});
