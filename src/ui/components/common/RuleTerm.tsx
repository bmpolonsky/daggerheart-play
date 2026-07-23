/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import styles from './RuleTerm.module.css';

export interface RuleTermProps {
  children: ComponentChildren;
  title: string;
  summary: string;
  onOpen?: () => void;
}

/**
 * An unobtrusive inline reference to a rule article. The visible text keeps
 * normal typography; hover/focus explains the term and activation opens the
 * complete source article.
 */
export function RuleTerm({ children, title, summary, onOpen }: RuleTermProps) {
  const anchorRef = useRef<HTMLElement>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<RuleTermTooltipPlacement | null>(null);

  useEffect(() => {
    if (!open) return;
    const updatePlacement = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const maxWidth = Math.max(180, Math.min(340, window.innerWidth - 24));
      setPlacement({
        left: Math.max(12 + maxWidth / 2, Math.min(window.innerWidth - 12 - maxWidth / 2, rect.left + rect.width / 2)),
        top: rect.top > 128 ? rect.top - 8 : rect.bottom + 8,
        maxWidth,
        above: rect.top > 128
      });
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
    };
  }, [open]);

  const tooltip = (
    <span
      id={tooltipId}
      className={open && placement ? styles.tooltip : styles.srOnly}
      role="tooltip"
      style={open && placement ? {
        left: `${placement.left}px`,
        top: `${placement.top}px`,
        maxWidth: `${placement.maxWidth}px`,
        transform: placement.above ? 'translate(-50%, -100%)' : 'translateX(-50%)'
      } : undefined}
    >
      <strong>{title}</strong>
      <span>{summary}</span>
      {onOpen && <small>Нажмите, чтобы открыть статью</small>}
    </span>
  );

  const sharedProps = {
    ref: (element: HTMLElement | null) => {
      anchorRef.current = element;
    },
    className: styles.root,
    'aria-describedby': tooltipId,
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => {
      if (document.activeElement !== anchorRef.current) setOpen(false);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      anchorRef.current?.blur();
    }
  };

  return (
    <>
      {onOpen ? (
        <button {...sharedProps} type="button" onClick={onOpen}>{children}</button>
      ) : (
        <span {...sharedProps}>{children}</span>
      )}
      {typeof document === 'undefined' ? tooltip : createPortal(tooltip, document.body)}
    </>
  );
}

interface RuleTermTooltipPlacement {
  left: number;
  top: number;
  maxWidth: number;
  above: boolean;
}
