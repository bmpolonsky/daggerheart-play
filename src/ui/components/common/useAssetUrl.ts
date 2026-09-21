import { useEffect, useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import { assetIdFromReference } from '../../../domain/game/assetReferences';
import { publicAssetUrl } from '../../../domain/content/publicAssets';
import { p2pSessionService, sceneTableService } from '../../../services/serviceRegistry';

/** Object URLs belong to the mounted view and are never persisted or synchronized. */
export function useAssetUrl(source = ''): string {
  const id = assetIdFromReference(source);
  const session = useStream(p2pSessionService.session$);
  const table = useStream(sceneTableService.sceneTable$);
  const available = Boolean(id && table.assets[id]);
  const [resolved, setResolved] = useState({ source: '', url: '' });
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let cancelled = false;
    let objectUrl: string | null = null;
    void p2pSessionService.resolveAssetUrl(source, controller.signal).then((url) => {
      if (cancelled) { if (url) URL.revokeObjectURL(url); return; }
      objectUrl = url;
      setResolved({ source, url: url ?? '' });
    }).catch(() => { if (!cancelled) setResolved({ source, url: '' }); });
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, id, available, session.connected, session.roomId]);
  return id ? (resolved.source === source ? resolved.url : '') : publicAssetUrl(source);
}
