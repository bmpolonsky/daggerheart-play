/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { HardDrive, X } from 'lucide-react';
import { useStream } from '../../../../core/hooks/useStream';
import { offlineService } from '../../../../services/serviceRegistry';
import { Button, Dialog, IconButton } from '../../../components/common';
import { OfflineSettings } from '../sharedTools/OfflineSettings';
import styles from './OfflineCopyIndicator.module.css';

export function OfflineCopyIndicator() {
  const state = useStream(offlineService.state$);
  const [open, setOpen] = useState(false);
  return <>
    {state.enabled && <IconButton size="sm" variant="ghost"
      aria-label="Офлайн-копия" title="Используется офлайн-копия — открыть настройки" onClick={() => setOpen(true)}>
      <HardDrive size={16} aria-hidden="true" />
    </IconButton>}
    {open && <Dialog className={styles.dialog} aria-label="Офлайн-копия" title="Офлайн-копия"
      onClose={() => setOpen(false)} actions={<IconButton aria-label="Закрыть" title="Закрыть" variant="ghost" size="sm" onClick={() => setOpen(false)}><X size={16} aria-hidden="true" /></IconButton>}>
      {state.enabled && !offlineService.mediaOnly && <p className={styles.explanation}>Используется сохранённая версия приложения, даже когда есть интернет. Сетевая игра при этом доступна.</p>}
      <OfflineSettings />
      {!state.enabled && <Button size="sm" disabled={state.busy} onClick={() => window.location.reload()}>Перезагрузить страницу</Button>}
    </Dialog>}
  </>;
}
