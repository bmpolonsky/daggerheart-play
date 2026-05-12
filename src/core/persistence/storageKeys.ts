export const STORAGE_DEBOUNCE_MS = 150;

export const GAME_DOCUMENT_STORAGE = {
  dbName: 'daggerheart-play-game',
  storeName: 'documents',
  key: 'current-game'
} as const;

export const CUSTOM_CONTENT_STORAGE = {
  dbName: 'daggerheart-play-custom-content',
  storeName: 'documents',
  key: 'local'
} as const;

export const ASSET_BLOB_STORAGE = {
  dbName: 'daggerheart-play-assets',
  storeName: 'assets'
} as const;
