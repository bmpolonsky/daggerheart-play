/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { X } from 'lucide-react';
import { Dialog, IconButton, Surface } from '../../components/common';

let closeActivePanel: (() => void) | null = null;

export function PlayerContextPanel({ ariaLabel, children, className = '', closeLabel = 'Закрыть', onClose }: {
  ariaLabel: string;
  children: ComponentChildren;
  className?: string;
  closeLabel?: string;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose);
  const activeCloseRef = useRef<(() => void) | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(isMobileLayout);
  closeRef.current = onClose;
  const currentLocation = typeof window === 'undefined' ? '' : window.location.href;

  useLayoutEffect(() => {
    const close = () => closeRef.current();
    activeCloseRef.current = close;
    closeActivePanel?.();
    closeActivePanel = close;
    return () => {
      if (closeActivePanel === close) closeActivePanel = null;
      if (activeCloseRef.current === close) activeCloseRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(max-width: 920px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (mobile || typeof document === 'undefined') return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobile]);

  // The preview is already interactive after layout. Register before paint so
  // an immediate Back cannot beat a deferred effect and navigate to the lobby.
  useLayoutEffect(() => {
    if (!mobile || typeof window === 'undefined') return;
    const returnUrl = new URL(window.location.href);
    const returnState: unknown = window.history.state;
    const closeOnHistoryTraversal = (event: PopStateEvent) => {
      // App navigation also dispatches synthetic popstate. Only a browser
      // history traversal may dismiss this mobile preview.
      if (!event.isTrusted || closeActivePanel !== activeCloseRef.current
        || window.location.origin !== returnUrl.origin) return;
      const ownDialog = bodyRef.current?.closest('[role="dialog"]');
      const visibleDialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
        .filter((element) => element.getClientRects().length > 0);
      // Do not consume navigation on behalf of a confirmation or child dialog.
      if (!ownDialog || visibleDialogs.at(-1) !== ownDialog) return;
      // No history entry is added when opening a preview. After Back, restore
      // its existing route before parent bubble listeners read it, then close.
      // A second Back follows the original route history normally. Traversals
      // to another document/origin cannot be intercepted by this local guard.
      window.history.pushState(returnState, '', returnUrl.href);
      closeRef.current();
    };
    window.addEventListener('popstate', closeOnHistoryTraversal, true);
    return () => window.removeEventListener('popstate', closeOnHistoryTraversal, true);
  }, [mobile, currentLocation]);

  const content = (
    <>
      <IconButton className="player-context-panel__close" variant="ghost" size="sm" title={closeLabel} aria-label={closeLabel} onClick={onClose}>
        <X size={16} aria-hidden="true" />
      </IconButton>
      <div ref={bodyRef} className="player-context-panel__body">{children}</div>
    </>
  );

  if (mobile) {
    return <Dialog className={`player-context-panel-dialog ${className}`.trim()} aria-label={ariaLabel} onClose={onClose}>{content}</Dialog>;
  }

  const panel = (
    <div className="dh-portal-scope">
      <Surface as="aside" className={`player-context-panel ${className}`.trim()} tone="solid" padding="none" aria-label={ariaLabel}>
        {content}
      </Surface>
    </div>
  );
  return typeof document === 'undefined' ? panel : createPortal(panel, document.body) as typeof panel;
}

function isMobileLayout(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 920px)').matches;
}
