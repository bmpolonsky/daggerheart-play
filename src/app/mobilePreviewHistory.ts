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
