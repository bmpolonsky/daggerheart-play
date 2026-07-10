import type { GameCustomContent } from '../../domain/game/gameDocument';
import { emptyCustomContent } from '../../domain/game/gameDocument';
import { createCustomContentStore } from './customContentStore';
import type { KeyValueDocumentStore } from './keyValueStore';
import { prepareCustomContentDocument, type BrowserCustomContentDocument } from './migrations/browserProjectContent';
import { CUSTOM_CONTENT_STORAGE } from './storageKeys';

type CustomContentTopic = keyof GameCustomContent | 'customCards' | 'all';

const customContentStore = createCustomContentStore();

let projectContentCache = emptyCustomContent();
let projectContentLoaded = false;
let projectContentLoadPromise: Promise<BrowserCustomContentDocument> | null = null;
let pendingWrite: Promise<void> = Promise.resolve();

export function readBrowserCustomContent(): GameCustomContent {
  return cloneProjectContent(projectContentCache);
}

export async function loadBrowserCustomContent(): Promise<GameCustomContent> {
  if (projectContentLoaded) {
    return cloneProjectContent(projectContentCache);
  }
  if (!projectContentLoadPromise) {
    projectContentLoadPromise = loadCustomContentDocument(customContentStore).then((document) => {
      projectContentCache = cloneProjectContent(document);
      projectContentLoaded = true;
      return cloneCustomContentDocument();
    });
  }
  const document = await projectContentLoadPromise;
  return cloneProjectContent(document);
}

export async function reloadBrowserCustomContent(): Promise<GameCustomContent> {
  await pendingWrite;
  projectContentLoadPromise = loadCustomContentDocument(customContentStore).then((document) => {
    projectContentCache = cloneProjectContent(document);
    projectContentLoaded = true;
    return cloneCustomContentDocument();
  });
  const document = await projectContentLoadPromise;
  return cloneProjectContent(document);
}

export function applyBrowserCustomContent(content: GameCustomContent): void {
  setProjectContentCache(content);
  void persistProjectContent(customContentStore, projectContentCache);
}

export async function replaceBrowserCustomContent(content: GameCustomContent): Promise<void> {
  setProjectContentCache(content);
  await persistProjectContent(customContentStore, projectContentCache);
}

export type CustomCardCollectionKey = 'ancestries' | 'communities' | 'subclasses' | 'domainCards';

export async function loadCustomCardCollection(key: CustomCardCollectionKey): Promise<unknown[]> {
  const content = await loadBrowserCustomContent();
  return [...content[key]];
}

export function readCustomCardCollectionsSnapshot(): Pick<GameCustomContent, CustomCardCollectionKey> {
  return {
    ancestries: [...projectContentCache.ancestries],
    communities: [...projectContentCache.communities],
    subclasses: [...projectContentCache.subclasses],
    domainCards: [...projectContentCache.domainCards]
  };
}

export function saveCustomCardCollection(key: CustomCardCollectionKey, cards: unknown[]): void {
  setProjectContentCache({ ...projectContentCache, [key]: cards });
  void persistCustomContentDocument(customContentStore);
}

export function saveCustomCardCollections(collections: Pick<GameCustomContent, CustomCardCollectionKey>): void {
  setProjectContentCache({
    ...projectContentCache,
    ancestries: collections.ancestries,
    communities: collections.communities,
    subclasses: collections.subclasses,
    domainCards: collections.domainCards
  });
  void persistCustomContentDocument(customContentStore);
}

export async function loadCustomCardDomains(): Promise<unknown[]> {
  const content = await loadBrowserCustomContent();
  return [...content.cardDomains];
}

export function saveCustomCardDomains(cardDomains: unknown[]): void {
  setProjectContentCache({ ...projectContentCache, cardDomains });
  void persistCustomContentDocument(customContentStore);
}

export async function loadCustomAdversaries(): Promise<unknown[]> {
  const content = await loadBrowserCustomContent();
  return [...content.adversaries];
}

export function saveCustomAdversaries(adversaries: unknown[]): void {
  setProjectContentCache({ ...projectContentCache, adversaries });
  void persistCustomContentDocument(customContentStore);
}

export function readCustomAdversariesSnapshot(): unknown[] {
  return [...projectContentCache.adversaries];
}

export async function loadCustomEnvironments(): Promise<unknown[]> {
  const content = await loadBrowserCustomContent();
  return [...(content.environments ?? [])];
}

export function saveCustomEnvironments(environments: unknown[]): void {
  setProjectContentCache({ ...projectContentCache, environments });
  void persistCustomContentDocument(customContentStore);
}

export function readCustomEnvironmentsSnapshot(): unknown[] {
  return [...(projectContentCache.environments ?? [])];
}

export function subscribeCustomContentChanges(topic: CustomContentTopic, listener: () => void): () => void {
  if (!customContentStore) {
    return () => undefined;
  }

  let initialized = false;
  let previousSignature: string | null = null;
  return customContentStore.subscribe<Partial<BrowserCustomContentDocument>>(CUSTOM_CONTENT_STORAGE.key, (value) => {
    const document = prepareCustomContentDocument(value);
    const nextSignature = customContentTopicSignature(document, topic);
    setCustomContentDocumentCache(document);

    if (!initialized) {
      initialized = true;
      previousSignature = nextSignature;
      return;
    }

    if (nextSignature === previousSignature) {
      return;
    }

    previousSignature = nextSignature;
    listener();
  });
}

async function loadCustomContentDocument(store: KeyValueDocumentStore | null): Promise<BrowserCustomContentDocument> {
  if (!store) {
    return cloneCustomContentDocument();
  }
  try {
    const document = await store.get<Partial<BrowserCustomContentDocument>>(CUSTOM_CONTENT_STORAGE.key);
    return prepareCustomContentDocument(document);
  } catch {
    return emptyCustomContentDocument();
  }
}

async function persistProjectContent(store: KeyValueDocumentStore | null, content: GameCustomContent): Promise<void> {
  projectContentCache = cloneProjectContent(content);
  await persistCustomContentDocument(store);
}

async function persistCustomContentDocument(store: KeyValueDocumentStore | null): Promise<void> {
  if (!store) {
    return;
  }
  try {
    const document = cloneCustomContentDocument();
    if (isEmptyCustomContentDocument(document)) {
      pendingWrite = store.delete(CUSTOM_CONTENT_STORAGE.key);
      await pendingWrite;
      return;
    }
    pendingWrite = store.put(CUSTOM_CONTENT_STORAGE.key, document);
    await pendingWrite;
  } catch {
    // Custom tool content is a project sidecar; failing to mirror it should not block the table.
  }
}

function setProjectContentCache(content: GameCustomContent): void {
  projectContentCache = cloneProjectContent(content);
  projectContentLoaded = true;
  projectContentLoadPromise = Promise.resolve(cloneCustomContentDocument());
}

function setCustomContentDocumentCache(document: BrowserCustomContentDocument): void {
  projectContentCache = cloneProjectContent(document);
  projectContentLoaded = true;
  projectContentLoadPromise = Promise.resolve(cloneCustomContentDocument());
}

function cloneProjectContent(content: GameCustomContent): GameCustomContent {
  return {
    ancestries: [...content.ancestries],
    communities: [...content.communities],
    subclasses: [...content.subclasses],
    domainCards: [...content.domainCards],
    cardDomains: [...content.cardDomains],
    adversaries: [...content.adversaries],
    environments: [...(content.environments ?? [])]
  };
}

function cloneCustomContentDocument(): BrowserCustomContentDocument {
  return cloneProjectContent(projectContentCache);
}

function emptyCustomContentDocument(): BrowserCustomContentDocument {
  return emptyCustomContent();
}

function isEmptyCustomContentDocument(document: BrowserCustomContentDocument): boolean {
  return (
    document.ancestries.length === 0 &&
    document.communities.length === 0 &&
    document.subclasses.length === 0 &&
    document.domainCards.length === 0 &&
    document.cardDomains.length === 0 &&
    document.adversaries.length === 0 &&
    (document.environments ?? []).length === 0
  );
}

function customContentTopicSignature(document: BrowserCustomContentDocument, topic: CustomContentTopic): string {
  if (topic === 'all') {
    return stableJsonSignature(document);
  }
  if (topic === 'customCards') {
    return stableJsonSignature({
      ancestries: document.ancestries,
      communities: document.communities,
      subclasses: document.subclasses,
      domainCards: document.domainCards
    });
  }
  return stableJsonSignature(document[topic]);
}

function stableJsonSignature(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'undefined';
  } catch {
    return String(value);
  }
}
