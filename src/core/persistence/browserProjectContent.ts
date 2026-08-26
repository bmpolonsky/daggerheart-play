import type { GameCustomContent } from '../../domain/game/gameDocument';
import { emptyCustomContent, normalizeGameCustomContent } from '../../domain/game/gameDocument';
import { createCustomContentStore } from './customContentStore';
import type { KeyValueDocumentStore } from './keyValueStore';
import { prepareCustomContentDocument, type BrowserCustomContentDocument } from './migrations/browserProjectContent';
import { CUSTOM_CONTENT_STORAGE } from './storageKeys';

export type CustomContentCollectionKey = Exclude<keyof GameCustomContent, 'cardDomains'>;
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

export async function reloadBrowserCustomContent(store: KeyValueDocumentStore | null = customContentStore): Promise<GameCustomContent> {
  await pendingWrite;
  const document = await readCustomContentDocument(store);
  setCustomContentDocumentCache(document);
  return cloneProjectContent(document);
}

export function applyBrowserCustomContent(content: GameCustomContent): void {
  setProjectContentCache(content);
  persistCustomContentDocumentSilently(customContentStore);
}

export async function replaceBrowserCustomContent(content: GameCustomContent, store: KeyValueDocumentStore | null = customContentStore): Promise<void> {
  const previous = projectContentCache;
  setProjectContentCache(content);
  try {
    await persistCustomContentDocument(store);
  } catch (error) {
    setProjectContentCache(previous);
    throw error;
  }
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
  persistCustomContentDocumentSilently(customContentStore);
}

export function saveCustomCardCollections(collections: Pick<GameCustomContent, CustomCardCollectionKey>): void {
  setProjectContentCache({
    ...projectContentCache,
    ancestries: collections.ancestries,
    communities: collections.communities,
    subclasses: collections.subclasses,
    domainCards: collections.domainCards
  });
  persistCustomContentDocumentSilently(customContentStore);
}

export async function loadCustomContentCollection<TKey extends CustomContentCollectionKey>(key: TKey): Promise<GameCustomContent[TKey]> {
  const content = await loadBrowserCustomContent();
  return [...content[key]] as GameCustomContent[TKey];
}

export function saveCustomContentCollection<TKey extends CustomContentCollectionKey>(key: TKey, items: GameCustomContent[TKey]): void {
  setProjectContentCache({ ...projectContentCache, [key]: [...items] });
  persistCustomContentDocumentSilently(customContentStore);
}

export async function loadCustomCardDomains(): Promise<unknown[]> {
  const content = await loadBrowserCustomContent();
  return [...content.cardDomains];
}

export function saveCustomCardDomains(cardDomains: unknown[]): void {
  setProjectContentCache({ ...projectContentCache, cardDomains });
  persistCustomContentDocumentSilently(customContentStore);
}

export async function loadCustomAdversaries(): Promise<unknown[]> {
  const content = await loadBrowserCustomContent();
  return [...content.adversaries];
}

export function saveCustomAdversaries(adversaries: unknown[]): void {
  setProjectContentCache({ ...projectContentCache, adversaries: adversaries.filter(isRecord) });
  persistCustomContentDocumentSilently(customContentStore);
}

export function readCustomAdversariesSnapshot(): unknown[] {
  return [...projectContentCache.adversaries];
}

export async function loadCustomEnvironments(): Promise<unknown[]> {
  const content = await loadBrowserCustomContent();
  return [...(content.environments ?? [])];
}

export function saveCustomEnvironments(environments: unknown[]): void {
  setProjectContentCache({ ...projectContentCache, environments: environments.filter(isRecord) });
  persistCustomContentDocumentSilently(customContentStore);
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
  try {
    return await readCustomContentDocument(store);
  } catch {
    return emptyCustomContentDocument();
  }
}

async function readCustomContentDocument(store: KeyValueDocumentStore | null): Promise<BrowserCustomContentDocument> {
  if (!store) {
    return cloneCustomContentDocument();
  }
  const document = await store.get<Partial<BrowserCustomContentDocument>>(CUSTOM_CONTENT_STORAGE.key);
  return prepareCustomContentDocument(document);
}

async function persistCustomContentDocument(store: KeyValueDocumentStore | null): Promise<void> {
  if (!store) return;
  const document = cloneCustomContentDocument();
  const write = isEmptyCustomContentDocument(document)
    ? store.delete(CUSTOM_CONTENT_STORAGE.key)
    : store.put(CUSTOM_CONTENT_STORAGE.key, document);
  pendingWrite = write.catch(() => undefined);
  await write;
}

function persistCustomContentDocumentSilently(store: KeyValueDocumentStore | null): void {
  void persistCustomContentDocument(store).catch(() => undefined);
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
  const normalized = normalizeGameCustomContent(content);
  return Object.fromEntries(
    Object.entries(normalized).map(([key, items]) => [key, [...items]])
  ) as unknown as GameCustomContent;
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
    document.environments.length === 0 &&
    document.classes.length === 0 &&
    document.equipment.length === 0 &&
    document.beastforms.length === 0
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
