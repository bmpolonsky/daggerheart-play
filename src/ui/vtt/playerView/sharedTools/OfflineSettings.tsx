/** @jsxImportSource preact */
import { useEffect } from 'preact/hooks';
import { Download, WifiOff } from 'lucide-react';
import { useStream } from '../../../../core/hooks/useStream';
import { offlineService } from '../../../../services/serviceRegistry';
import { Button, Checkbox, Notice, SectionHeader, Toolbar } from '../../../components/common';
import styles from './OfflineSettings.module.css';

export function OfflineSettings() {
  const state = useStream(offlineService.state$);
  useEffect(() => {
    void offlineService.refresh();
  }, []);
  if (!offlineService.supported) return null;
  return (
    <section className={styles.root} aria-label="Офлайн">
      <SectionHeader title="Офлайн" subtitle="Сохранить приложение и материалы текущей игры для игры без интернета на этом устройстве." />
      {offlineService.mediaOnly && <Notice>Локально сохраняются изображения, звуки и шрифты. Код приложения всегда загружается с dev-сервера.</Notice>}
      <Checkbox
        size="sm"
        boxPosition="start"
        label={<span className={styles.optionCopy}>
          <span>Все иллюстрации справочника</span>
          <span className={styles.hint}>{offlineService.artworkSizeLabel(state.artworkBytes)}</span>
        </span>}
        checked={state.includeArtwork}
        disabled={state.busy || !offlineService.canPrepare}
        onChange={(event) => offlineService.setIncludeArtwork(event.currentTarget.checked)}
      />
      <Toolbar className={styles.actions}>
        <Button size="sm" disabled={state.busy || !offlineService.canPrepare} iconBefore={<Download size={15} aria-hidden="true" />} onClick={() => void offlineService.prepare()}>
          {state.busy ? 'Подготовка…' : 'Подготовить офлайн'}
        </Button>
        {state.enabled && <Button size="sm" variant="ghost" disabled={state.busy} iconBefore={<WifiOff size={15} aria-hidden="true" />} onClick={() => void offlineService.disable()}>Отключить офлайн</Button>}
      </Toolbar>
      {state.message && <Notice role="status">{state.message}</Notice>}
      {state.skippedMedia > 0 && <Notice tone="warning">Не сохранено файлов: {state.skippedMedia}. Они будут недоступны без интернета.</Notice>}
      {state.enabled && !offlineService.mediaOnly && <Notice>Для обновления приложения отключите офлайн и перезагрузите страницу. После добавления материалов повторите подготовку.</Notice>}
      {state.error && <Notice tone="error" role="alert">{state.error}</Notice>}
    </section>
  );
}
