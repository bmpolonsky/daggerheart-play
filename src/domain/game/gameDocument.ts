import type { PersistedState } from '../rules/types';
import type { MapAsset } from '../tabletop/types';

export const GAME_DOCUMENT_KIND = 'daggerheart-play:game';
const LEGACY_GAME_PROJECT_KIND = 'daggerheart-play:game-project-folder';
export const LEGACY_GAME_ARCHIVE_KIND = 'daggerheart-play:game-archive';

export interface GameManifest {
  kind: typeof GAME_DOCUMENT_KIND | typeof LEGACY_GAME_PROJECT_KIND;
  version: 1;
  name: string;
  updatedAt: string;
}

export interface GameCustomContent {
  ancestries: unknown[];
  communities: unknown[];
  subclasses: unknown[];
  domainCards: unknown[];
  cardDomains: unknown[];
  adversaries: unknown[];
  environments?: unknown[];
}

export interface GameResources {
  assets: MapAsset[];
}

export interface GameDocument {
  manifest: GameManifest;
  files: {
    'manifest.json': GameManifest;
    'data/game.json': PersistedState['game'];
    'data/characters.json': PersistedState['characters'];
    'data/encounter.json': PersistedState['encounter'];
    'data/roll-log.json': PersistedState['rollLog'];
    'data/feed.json': PersistedState['feed'];
    'data/ui.json': PersistedState['ui'];
    'data/scene-table.json': PersistedState['sceneTable'];
    'content/custom-ancestries.json': unknown[];
    'content/custom-communities.json': unknown[];
    'content/custom-subclasses.json': unknown[];
    'content/custom-domain-cards.json': unknown[];
    'content/custom-card-domains.json': unknown[];
    'content/custom-adversaries.json': unknown[];
    'content/custom-environments.json': unknown[];
    'resources/assets.json': MapAsset[];
  };
}

export interface LegacyGameArchive {
  kind: typeof LEGACY_GAME_ARCHIVE_KIND;
  version: 1;
  exportedAt: string;
  document: unknown;
  assets: MapAsset[];
}

export function createGameDocument(state: PersistedState, customContent: GameCustomContent = emptyCustomContent()): GameDocument {
  const updatedAt = state.game.updatedAt || state.sceneTable.updatedAt || new Date().toISOString();
  const manifest: GameManifest = {
    kind: GAME_DOCUMENT_KIND,
    version: 1,
    name: state.game.name || 'Без названия',
    updatedAt
  };
  return toJsonDocument({
    manifest,
    files: {
      'manifest.json': { ...manifest },
      'data/game.json': state.game,
      'data/characters.json': state.characters,
      'data/encounter.json': state.encounter,
      'data/roll-log.json': state.rollLog,
      'data/feed.json': state.feed,
      'data/ui.json': state.ui,
      'data/scene-table.json': state.sceneTable,
      'content/custom-ancestries.json': customContent.ancestries,
      'content/custom-communities.json': customContent.communities,
      'content/custom-subclasses.json': customContent.subclasses,
      'content/custom-domain-cards.json': customContent.domainCards,
      'content/custom-card-domains.json': customContent.cardDomains,
      'content/custom-adversaries.json': customContent.adversaries,
      'content/custom-environments.json': customContent.environments ?? [],
      'resources/assets.json': Object.values(state.sceneTable.assets).map(assetWithResourcePath)
    }
  });
}

export function gameDocumentToPersistedState(document: GameDocument): PersistedState {
  const sceneTable = document.files['data/scene-table.json'];
  return {
    schemaVersion: 5,
    game: document.files['data/game.json'],
    characters: document.files['data/characters.json'],
    encounter: document.files['data/encounter.json'],
    rollLog: document.files['data/roll-log.json'],
    feed: document.files['data/feed.json'],
    ui: document.files['data/ui.json'],
    sceneTable: {
      ...sceneTable,
      schemaVersion: 4,
      assets: {
        ...Object.fromEntries(document.files['resources/assets.json'].map((asset) => [asset.id, asset])),
        ...sceneTable.assets
      }
    }
  };
}

export function emptyCustomContent(): GameCustomContent {
  return {
    ancestries: [],
    communities: [],
    subclasses: [],
    domainCards: [],
    cardDomains: [],
    adversaries: [],
    environments: []
  };
}

export function gameDocumentCustomContent(document: GameDocument): GameCustomContent {
  return {
    ancestries: document.files['content/custom-ancestries.json'],
    communities: document.files['content/custom-communities.json'],
    subclasses: document.files['content/custom-subclasses.json'],
    domainCards: document.files['content/custom-domain-cards.json'],
    cardDomains: document.files['content/custom-card-domains.json'],
    adversaries: document.files['content/custom-adversaries.json'],
    environments: document.files['content/custom-environments.json'] ?? []
  };
}

export function isGameDocument(value: unknown): value is GameDocument {
  if (!isRecord(value) || !isRecord(value.manifest) || !isRecord(value.files)) return false;
  return (value.manifest.kind === GAME_DOCUMENT_KIND || value.manifest.kind === LEGACY_GAME_PROJECT_KIND) &&
    value.manifest.version === 1 &&
    isRecord(value.files['data/game.json']) &&
    isRecord(value.files['data/characters.json']) &&
    isRecord(value.files['data/encounter.json']) &&
    Array.isArray(value.files['data/roll-log.json']) &&
    Array.isArray(value.files['data/feed.json']) &&
    isRecord(value.files['data/ui.json']) &&
    isRecord(value.files['data/scene-table.json']) &&
    Array.isArray(value.files['content/custom-ancestries.json']) &&
    Array.isArray(value.files['content/custom-communities.json']) &&
    Array.isArray(value.files['content/custom-subclasses.json']) &&
    Array.isArray(value.files['content/custom-domain-cards.json']) &&
    Array.isArray(value.files['content/custom-card-domains.json']) &&
    Array.isArray(value.files['content/custom-adversaries.json']) &&
    (value.files['content/custom-environments.json'] === undefined || Array.isArray(value.files['content/custom-environments.json'])) &&
    Array.isArray(value.files['resources/assets.json']);
}

export function isLegacyGameArchive(value: unknown): value is LegacyGameArchive {
  return isRecord(value) &&
    value.kind === LEGACY_GAME_ARCHIVE_KIND &&
    value.version === 1 &&
    Boolean(value.document) &&
    Array.isArray(value.assets);
}

export function assetResourcePath(asset: Pick<MapAsset, 'id' | 'name' | 'mimeType' | 'resourcePath'>): string {
  if (asset.resourcePath) {
    return asset.resourcePath;
  }
  const directory = asset.mimeType.startsWith('audio/') ? 'audio' : asset.mimeType.startsWith('image/') ? 'images' : 'files';
  return `resources/${directory}/${safeResourceName(asset.id, extensionForAsset(asset))}`;
}

function assetWithResourcePath(asset: MapAsset): MapAsset {
  if (asset.storage !== 'indexeddb') {
    return asset;
  }
  return {
    ...asset,
    resourcePath: assetResourcePath(asset)
  };
}

function safeResourceName(id: string, extension: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
  return `${safeId}${extension}`;
}

function extensionForAsset(asset: Pick<MapAsset, 'name' | 'mimeType'>): string {
  const nameExtension = asset.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1];
  if (nameExtension) {
    return `.${nameExtension.toLowerCase()}`;
  }
  const mimeExtension = mimeTypeExtensions[asset.mimeType];
  return mimeExtension ? `.${mimeExtension}` : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function toJsonDocument(document: GameDocument): GameDocument {
  return JSON.parse(JSON.stringify(document)) as GameDocument;
}

const mimeTypeExtensions: Record<string, string> = {
  'image/apng': 'apng',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm'
};
