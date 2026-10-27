/** One active preview may consume a real same-document Back before either
 * existing router updates its route state. No entry is added on preview open. */
type PreviewBackHandler = (event: PopStateEvent) => boolean;
let activeHandler: PreviewBackHandler | null = null;
const consumedEvents = new WeakSet<Event>();

export function registerMobilePreviewHistory(handler: PreviewBackHandler): () => void {
  activeHandler = handler;
  return () => { if (activeHandler === handler) activeHandler = null; };
}

export function consumeMobilePreviewHistory(event: Event): boolean {
  if (event.type !== 'popstate' || !event.isTrusted) return false;
  // Both existing routers receive the same traversal, even if the first call
  // synchronously closes/unregisters the preview. Neither should then route it.
  if (consumedEvents.has(event)) return true;
  if (activeHandler?.(event as PopStateEvent) !== true) return false;
  consumedEvents.add(event);
  return true;
}

export type PreviewHistoryDirection = 'back' | 'forward' | 'same' | 'unknown';

/** The Navigation API exposes traversal position without patching the router
 * or adding preview-only history entries. Older browsers keep the existing
 * Back guard when position is unavailable; native behavior needs device QA. */
export function previewHistoryDirection(originIndex: number | null, destinationIndex: number | null): PreviewHistoryDirection {
  if (originIndex === null || destinationIndex === null || !Number.isSafeInteger(originIndex)
    || !Number.isSafeInteger(destinationIndex) || originIndex < 0 || destinationIndex < 0) return 'unknown';
  return destinationIndex < originIndex ? 'back' : destinationIndex > originIndex ? 'forward' : 'same';
}

export function currentPreviewHistoryIndex(): number | null {
  if (typeof window === 'undefined') return null;
  const navigation = (window as Window & { navigation?: { currentEntry?: { index?: number } } }).navigation;
  const index = navigation?.currentEntry?.index;
  return typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 ? index : null;
}
