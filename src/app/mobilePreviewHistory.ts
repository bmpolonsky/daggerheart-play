/** One mobile preview may consume a real same-document Back before either
 * existing router updates its route state. No entry is added on preview open. */
type PreviewBackHandler = (event: PopStateEvent) => boolean;
let activeHandler: PreviewBackHandler | null = null;

export function registerMobilePreviewHistory(handler: PreviewBackHandler): () => void {
  activeHandler = handler;
  return () => { if (activeHandler === handler) activeHandler = null; };
}

export function consumeMobilePreviewHistory(event: Event): boolean {
  if (event.type !== 'popstate' || !event.isTrusted) return false;
  return activeHandler?.(event as PopStateEvent) === true;
}
