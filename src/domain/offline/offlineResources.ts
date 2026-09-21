import type { PersistedState } from '../rules/types';
import type { GameCustomContent } from '../game/gameDocument';
import { defaultCharacterPortraitUrl, DEFAULT_LOBBY_SCENE_IMAGE, DEFAULT_SCENE_IMAGE } from '../tabletop/defaultArt';
import { publicAssetUrl } from '../content/publicAssets';
import { assetReferenceIds } from '../game/assetReferences';

// Media fields only: prose, invite URLs and external links are not downloads.
const MEDIA_FIELD = /^(?:imageUrl|portraitUrl|backgroundUrl|sourceUrl|image_url|domain_image_url|iconUrl)$/;

export function offlineResourceUrls(state: PersistedState, basePath?: string, customContent?: GameCustomContent): string[] {
  const urls = new Set<string>();
  const add = (value: string, audio = false) => {
    if (!value || /^(?:data|blob|asset):/i.test(value)) return;
    const url = audio ? new URL(value, publicAssetUrl('./', basePath)).href : publicAssetUrl(value, basePath);
    if (/^https?:\/\//i.test(url)) urls.add(url);
  };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string' && MEDIA_FIELD.test(key)) add(entry, key === 'sourceUrl');
      else if (typeof entry === 'object') visit(entry);
    }
  };
  visit(state);
  visit(customContent);
  for (const domain of customContent?.cardDomains ?? []) {
    if (domain && typeof domain === 'object' && 'icon' in domain && typeof domain.icon === 'string') add(domain.icon);
  }
  for (const id of offlineAssetIds(state, customContent)) {
    const asset = state.sceneTable.assets[id];
    if (!asset) continue;
    if (asset.storage === 'remote' && asset.url) add(asset.url);
  }
  for (const scene of Object.values(state.sceneTable.scenes)) {
    for (const layer of scene.layers) if (layer.url) add(layer.url);
  }
  for (const character of Object.values(state.characters.entities)) add(defaultCharacterPortraitUrl(character));
  add(DEFAULT_LOBBY_SCENE_IMAGE);
  add(DEFAULT_SCENE_IMAGE);
  return [...urls];
}

export function offlineAssetIds(state: PersistedState, customContent?: GameCustomContent): string[] {
  const ids = new Set([...assetReferenceIds(state), ...assetReferenceIds(customContent)]);
  for (const scene of Object.values(state.sceneTable.scenes)) {
    for (const id of [scene.backgroundAssetId, scene.music.assetId, ...scene.layers.map((layer) => layer.assetId)]) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
}
