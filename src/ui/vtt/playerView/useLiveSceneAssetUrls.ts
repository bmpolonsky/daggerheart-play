import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore } from '../../../core/hooks/useStore';
import type { MapAsset, TableScene } from '../../../domain/tabletop/types';
import { assetService, p2pSessionService } from '../../../services/serviceRegistry';
import type { TableViewRole } from './types';

export function useLiveSceneAssetUrls(liveScene: TableScene, sceneAssets: Record<string, MapAsset>, role: TableViewRole): Record<string, string> {
  const p2pSession = useStore(p2pSessionService.sessionStore);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const pendingAssetRequests = useRef<Set<string>>(new Set());
  const objectUrls = useRef<Record<string, string>>({});
  const liveSceneAssetIds = useMemo(() => [
    liveScene?.backgroundAssetId,
    role === 'gm' ? liveScene?.music.assetId : undefined
  ].filter((assetId): assetId is string => Boolean(assetId)), [liveScene?.backgroundAssetId, liveScene?.music.assetId, role]);

  useEffect(() => () => {
    for (const objectUrl of Object.values(objectUrls.current)) {
      URL.revokeObjectURL(objectUrl);
    }
    objectUrls.current = {};
  }, []);

  useEffect(() => {
    const liveAssetIds = new Set(liveSceneAssetIds);
    setAssetUrls((current) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [assetId, objectUrl] of Object.entries(current)) {
        if (liveAssetIds.has(assetId)) {
          next[assetId] = objectUrl;
          continue;
        }
        if (objectUrls.current[assetId]) {
          URL.revokeObjectURL(objectUrls.current[assetId]);
          delete objectUrls.current[assetId];
        }
        changed = true;
      }
      return changed ? next : current;
    });
  }, [liveSceneAssetIds]);

  useEffect(() => {
    const missingAssetIds = liveSceneAssetIds.filter((assetId) => sceneAssets[assetId]?.storage === 'indexeddb' && !objectUrls.current[assetId]);
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
      if (cancelled) {
        for (const [, objectUrl] of entries) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
        return;
      }
      const loadedEntries = entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
      if (loadedEntries.length === 0) return;
      setAssetUrls((current) => ({
        ...current,
        ...Object.fromEntries(loadedEntries.map(([assetId, objectUrl]) => {
          const previousUrl = objectUrls.current[assetId];
          if (previousUrl && previousUrl !== objectUrl) {
            URL.revokeObjectURL(previousUrl);
          }
          objectUrls.current[assetId] = objectUrl;
          return [assetId, objectUrl] as const;
        }))
      }));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [liveSceneAssetIds, p2pSession.connected, role, sceneAssets]);

  return assetUrls;
}
