import { Store } from '../core/store/Store';
import { reloadBrowserCustomContent } from '../core/persistence/browserProjectContent';
import { offlineAssetIds, offlineResourceUrls } from '../domain/offline/offlineResources';
import { snapshotPersistedState } from '../stores/persistedState';
import type { AssetService } from './AssetService';

interface OfflineState {
  enabled: boolean;
  busy: boolean;
  message: string;
  error: string | null;
  includeArtwork: boolean;
  artworkBytes: number | null;
  skippedMedia: number;
}

export class OfflineService {
  private store = new Store<OfflineState>({ enabled: false, busy: false, message: '', error: null, includeArtwork: false, artworkBytes: null, skippedMedia: 0 });
  private selectionRestored = false;
  readonly state$ = this.store.toStream();
  readonly mediaOnly = import.meta.env.DEV;
  readonly supported = typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'caches' in window && 'locks' in navigator;
  readonly canPrepare = this.supported;
  private scope = typeof window === 'undefined' ? '' : new URL(import.meta.env.BASE_URL, window.location.origin).href;
  private prefix = `daggerheart-offline:${this.scope}:${this.mediaOnly ? 'media:' : ''}`;
  private workerUrl = `${this.scope}offline-sw.js${this.mediaOnly ? '?media-only=1' : ''}`;
  private stateCache = `${this.prefix}state`;
  private stateUrl = `${this.scope}offline-state`;
  private refreshStatus = () => { void this.refresh(false); };

  constructor(private assets: AssetService) {}

  async start(): Promise<void> {
    if (!this.supported) return;
    window.addEventListener('focus', this.refreshStatus);
    await this.refresh(false);
    if (!this.canPrepare) return;
    try {
      const existing = await navigator.serviceWorker.getRegistration(this.scope);
      if (existing && existing.active?.scriptURL.split('?')[0] !== `${this.scope}offline-sw.js`) return;
      await navigator.serviceWorker.register(this.workerUrl, { scope: this.scope, updateViaCache: 'none' });
    } catch { /* Ordinary cache is optional; application startup must still work. */ }
  }

  async refresh(loadArtwork = true): Promise<void> {
    if (!this.supported || this.store.get().busy) return;
    try {
      const state = await this.readState();
      const registration = await navigator.serviceWorker.getRegistration(this.scope);
      const enabled = Boolean(state && registration?.active?.scriptURL === this.workerUrl && await caches.has(state.cacheName));
      if (this.store.get().busy) return;
      this.store.update((value) => ({ ...value, enabled, message: enabled ? 'Офлайн включён' : '', skippedMedia: enabled ? state?.skippedMedia ?? 0 : 0 }));
      if (!this.selectionRestored) {
        this.store.update((value) => ({ ...value, includeArtwork: state?.includeArtwork === true }));
        this.selectionRestored = true;
      }
      if (loadArtwork && this.canPrepare && this.store.get().artworkBytes === null) {
        const artwork = await this.readArtworkManifest().catch(() => null);
        if (artwork) this.store.update((value) => ({ ...value, artworkBytes: artwork.bytes }));
      }
    } catch {
      this.store.update((value) => ({ ...value, error: 'Браузер не разрешил доступ к офлайн-хранилищу.' }));
    }
  }

  setIncludeArtwork(includeArtwork: boolean): void {
    if (!this.store.get().busy) {
      this.selectionRestored = true;
      this.store.update((value) => ({ ...value, includeArtwork }));
    }
  }

  artworkSizeLabel(bytes: number | null): string {
    return bytes === null ? 'Размер пока недоступен' : `Встроенные: ≈ ${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(bytes / 1024 / 1024)} МБ; пользовательские — дополнительно`;
  }

  async prepare(): Promise<void> {
    if (!this.canPrepare || this.store.get().busy) return;
    await this.run(async () => {
      const state = snapshotPersistedState();
      const includeArtwork = this.store.get().includeArtwork;
      const customContent = includeArtwork ? await reloadBrowserCustomContent() : undefined;
      let missingLocalFiles = 0;
      for (const id of offlineAssetIds(state, customContent)) {
        const asset = state.sceneTable.assets[id];
        if (!asset || (asset.storage === 'indexeddb' && !await this.assets.getBlob(asset.id))) {
          missingLocalFiles += 1;
        }
      }
      const manifestResponse = await fetch(`${this.scope}offline-manifest.json`, { cache: 'no-store' }).catch(() => {
        throw new Error('Не удалось загрузить список файлов. Проверьте соединение и повторите подготовку.');
      });
      if (!manifestResponse.ok) throw new Error('Не удалось загрузить список файлов приложения.');
      const manifest: unknown = await manifestResponse.json();
      if (!Array.isArray(manifest) || (!this.mediaOnly && !manifest.includes('index.html')) || !manifest.every((url) => typeof url === 'string' && !url.startsWith('/') && !url.includes('..') && !url.includes(':'))) {
        throw new Error('Некорректный список файлов приложения.');
      }
      const shellUrls = manifest.map((path: string) => new URL(path, this.scope).href);
      const requiredUrls = this.mediaOnly ? [] : shellUrls.filter((url) => /\.(?:html|[cm]?js|css|json|wasm)$/.test(new URL(url).pathname));
      const currentScripts = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map((script) => script.src);
      if (!this.mediaOnly && (!currentScripts.length || currentScripts.some((url) => !shellUrls.includes(url)))) {
        throw new Error('На сайте появилась новая версия. Перезагрузите страницу; если офлайн включён, сначала отключите его.');
      }
      const artwork = includeArtwork ? await this.readArtworkManifest(true) : null;
      if (artwork) this.store.update((value) => ({ ...value, artworkBytes: artwork.bytes }));
      const urls = [...new Set([...shellUrls, ...offlineResourceUrls(state, undefined, customContent), ...(artwork?.files ?? []).map((path) => new URL(path, this.scope).href)])];
      const existingRegistration = await navigator.serviceWorker.getRegistration(this.scope);
      if (existingRegistration && existingRegistration.active?.scriptURL.split('?')[0] !== `${this.scope}offline-sw.js`) {
        throw new Error('Страницей управляет другой офлайн-режим. Откройте приложение в отдельном профиле браузера.');
      }
      let html = '';
      if (!this.mediaOnly) {
        const response = await fetch(`${this.scope}index.html`, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error('Не удалось скачать приложение.');
        html = await response.text();
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const scripts = [...parsed.querySelectorAll('script[type="module"][src]')].map((script) => new URL(script.getAttribute('src')!, this.scope).href);
        if (scripts.length !== currentScripts.length || scripts.some((script) => !currentScripts.includes(script))) {
          throw new Error('Версия приложения изменилась во время подготовки. Перезагрузите страницу и повторите.');
        }
      }
      const registration = await navigator.serviceWorker.register(this.workerUrl, { scope: this.scope, updateViaCache: 'none' });
      await this.waitForActivation(registration);
      const skippedMedia = await this.command(registration.active!, { type: 'prepare', urls, requiredUrls, html, includeArtwork, missingLocalFiles });
      this.store.update((value) => ({ ...value, enabled: true, busy: true, message: 'Офлайн включён', error: null, skippedMedia }));
      void navigator.storage?.persist?.().catch(() => undefined);
    });
  }

  async disable(): Promise<void> {
    await this.run(async () => {
      const registration = await navigator.serviceWorker.getRegistration(this.scope);
      if (!registration?.active || registration.active.scriptURL !== this.workerUrl) {
        throw new Error('Офлайн-режим недоступен. Перезагрузите страницу и повторите.');
      }
      await this.command(registration.active, { type: 'disable' });
      this.store.update((value) => ({ ...value, enabled: false, busy: true, message: 'Офлайн отключён. Перезагрузите страницу для обновления.', error: null, skippedMedia: 0 }));
    });
  }

  private async readArtworkManifest(fresh = false): Promise<{ files: string[]; bytes: number }> {
    const response = await fetch(`${this.scope}offline-artwork.json`, { cache: fresh ? 'no-store' : 'default', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Не удалось загрузить список иллюстраций справочника.');
    const value = await response.json();
    if (!Array.isArray(value?.files) || !value.files.every((path: unknown) => typeof path === 'string' && path.startsWith('image/') && !path.includes('..') && !path.includes(':')) || !Number.isSafeInteger(value.bytes) || value.bytes < 0) {
      throw new Error('Некорректный список иллюстраций справочника.');
    }
    return value;
  }

  private command(worker: ServiceWorker, command: { type: 'prepare'; urls: string[]; requiredUrls: string[]; html: string; includeArtwork: boolean; missingLocalFiles: number } | { type: 'disable' }): Promise<number> {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = () => finish(new Error('Подготовка не отвечает. Перезагрузите страницу, чтобы проверить результат.'));
      let timer = setTimeout(timeout, 90_000);
      const finish = (error?: Error, skippedMedia = 0) => {
        clearTimeout(timer);
        channel.port1.close();
        if (error) reject(error); else resolve(skippedMedia);
      };
      channel.port1.onmessage = ({ data }) => {
        if (data.error) { finish(new Error(data.error)); return; }
        if (data.done) { finish(undefined, data.skippedMedia); return; }
        clearTimeout(timer);
        timer = setTimeout(timeout, 90_000);
        this.store.update((value) => ({ ...value, message: `Подготовка: ${data.completed} / ${data.total}` }));
      };
      channel.port1.onmessageerror = () => finish(new Error('Не удалось получить результат подготовки.'));
      worker.postMessage(command, [channel.port2]);
    });
  }

  private async readState(): Promise<{ cacheName: string; includeArtwork?: boolean; skippedMedia?: number } | null> {
    if (!await caches.has(this.stateCache)) return null;
    const response = await (await caches.open(this.stateCache)).match(this.stateUrl);
    return response ? await response.json() : null;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (!this.supported || this.store.get().busy) return;
    this.store.update((value) => ({ ...value, busy: true, error: null }));
    try {
      // Serialize prepare/disable across tabs sharing this application's cache.
      await navigator.locks.request(this.prefix, action);
    } catch (error) {
      this.store.update((value) => ({ ...value, message: value.enabled ? 'Предыдущая офлайн-копия сохранена' : '', error: error instanceof Error ? error.message : 'Не удалось подготовить офлайн. Проверьте соединение и свободное место.' }));
    } finally {
      this.store.update((value) => ({ ...value, busy: false }));
    }
  }

  private async waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    if (!worker) throw new Error('Не удалось включить офлайн. Попробуйте ещё раз.');
    if (worker.state === 'activated') return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Офлайн не успел включиться. Попробуйте ещё раз.')), 20_000);
      const changed = () => {
        if (worker.state === 'activated') finish();
        else if (worker.state === 'redundant') finish(new Error('Не удалось включить офлайн.'));
      };
      const finish = (error?: Error) => {
        clearTimeout(timer);
        worker.removeEventListener('statechange', changed);
        if (error) reject(error); else resolve();
      };
      worker.addEventListener('statechange', changed);
      changed();
    });
  }
}
