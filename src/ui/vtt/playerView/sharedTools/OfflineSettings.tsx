/** @jsxImportSource preact */
import { useEffect } from 'preact/hooks';
import { Download, WifiOff } from 'lucide-react';
import { useStream } from '../../../../core/hooks/useStream';
import { offlineService } from '../../../../services/serviceRegistry';
import { Button, Checkbox, Notice, SectionHeader, Toolbar } from '../../../components/common';

export function OfflineSettings() {
  const state = useStream(offlineService.state$);
  useEffect(() => {
    const refresh = () => void offlineService.refresh();
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  if (!offlineService.supported) return null;
  return (
    <section className="player-tools-settings-panel" aria-label="Офлайн">
      <SectionHeader title="Офлайн" subtitle="Сохранить приложение и материалы текущей игры для игры без интернета на этом устройстве." />
      <Checkbox
        label="Все иллюстрации справочника"
        meta={offlineService.artworkSizeLabel(state.artworkBytes)}
        checked={state.includeArtwork}
        disabled={state.busy}
        onChange={(event) => offlineService.setIncludeArtwork(event.currentTarget.checked)}
      />
      <Toolbar>
        <Button size="sm" disabled={state.busy} iconBefore={<Download size={15} aria-hidden="true" />} onClick={() => void offlineService.prepare()}>
          {state.busy ? 'Подготовка…' : 'Подготовить офлайн'}
        </Button>
        {state.enabled && <Button size="sm" variant="ghost" disabled={state.busy} iconBefore={<WifiOff size={15} aria-hidden="true" />} onClick={() => void offlineService.disable()}>Отключить офлайн</Button>}
      </Toolbar>
      {state.message && <Notice role="status">{state.message}</Notice>}
      {state.enabled && <Notice>Для обновления приложения отключите офлайн и перезагрузите страницу. После добавления материалов повторите подготовку.</Notice>}
      {state.error && <Notice tone="error" role="alert">{state.error}</Notice>}
    </section>
  );
}
