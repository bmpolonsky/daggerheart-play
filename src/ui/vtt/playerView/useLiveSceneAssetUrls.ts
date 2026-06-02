import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore } from '../../../core/hooks/useStore';
import type { MapAsset, TableScene } from '../../../domain/tabletop/types';
import { assetService, p2pSessionService } from '../../../services/serviceRegistry';
import type { TableViewRole } from './types';

export function useLiveSceneAssetUrls(liveScene: TableScene, sceneAssets: Record<string, MapAsset>, role: TableViewRole): Record<string, string> {
  const p2pSession = useStore(p2pSessionService.sessionStore);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const pendingAssetRequests = useRef<Set<string>>(new Set());
  const liveSceneAssetIds = useMemo(() => [
    liveScene?.backgroundAssetId,
    role === 'gm' ? liveScene?.music.assetId : undefined
  ].filter((assetId): assetId is string => Boolean(assetId)), [liveScene?.backgroundAssetId, liveScene?.music.assetId, role]);

  useEffect(() => {
    const missingAssetIds = liveSceneAssetIds.filter((assetId) => sceneAssets[assetId]?.storage === 'indexeddb' && !assetUrls[assetId]);
    if (missingAssetIds.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(missingAssetIds.map(async (assetId) => {
        const localUrl = await assetService.getObjectUrl(assetId);
        if (localUrl) {
          return [assetId, localUrl] as const;
        }
        if (role !== 'player' || !p2pSession.connected || pendingAssetRequests.current.has(assetId)) {
          return [assetId, null] as const;
        }
        pendingAssetRequests.current.add(assetId);
        try {
          const received = await p2pSessionService.requestAsset(assetId, 'scene-background');
          if (!received) {
            return [assetId, null] as const;
          }
          return [assetId, await assetService.getObjectUrl(assetId)] as const;
        } finally {
          pendingAssetRequests.current.delete(assetId);
        }
      }));
      if (cancelled) return;
      const loadedEntries = entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
      if (loadedEntries.length === 0) return;
      setAssetUrls((current) => ({
        ...current,
        ...Object.fromEntries(loadedEntries)
      }));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [assetUrls, liveSceneAssetIds, p2pSession.connected, role, sceneAssets]);

  return assetUrls;
}
