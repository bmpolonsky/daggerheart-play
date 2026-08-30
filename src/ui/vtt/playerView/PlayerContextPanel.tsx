/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
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
  const [mobile, setMobile] = useState(isMobileLayout);
  closeRef.current = onClose;

  useEffect(() => {
    const close = () => closeRef.current();
    closeActivePanel?.();
    closeActivePanel = close;
    return () => {
      if (closeActivePanel === close) closeActivePanel = null;
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

  const content = (
    <>
      <IconButton className="player-context-panel__close" variant="ghost" size="sm" title={closeLabel} aria-label={closeLabel} onClick={onClose}>
        <X size={16} aria-hidden="true" />
      </IconButton>
      <div className="player-context-panel__body">{children}</div>
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
