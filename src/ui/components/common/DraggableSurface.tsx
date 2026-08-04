import type { HTMLAttributes, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Surface } from './Surface';
import styles from './DraggableSurface.module.css';

type UiNode = any;

export interface DraggableSurfacePosition {
  x: number;
  y: number;
}

export interface DraggableSurfaceBounds {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface DraggableSurfaceProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'style' | 'title'> {
  title: UiNode;
  actions?: UiNode;
  children?: UiNode;
  defaultPosition: DraggableSurfacePosition | (() => DraggableSurfacePosition);
  bounds?: DraggableSurfaceBounds;
  resizable?: boolean;
}

const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, [role="button"], [data-drag-ignore]';

export function DraggableSurface({
  title,
  actions,
  children,
  defaultPosition,
  bounds,
  resizable = false,
  className = '',
  ...props
}: DraggableSurfaceProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [position, setPosition] = useState<DraggableSurfacePosition>(() => resolvePosition(defaultPosition));
  const positionRef = useRef(position);
  positionRef.current = position;

  const clampToViewport = (x: number, y: number): DraggableSurfacePosition => {
    if (typeof window === 'undefined') return { x, y };
    const width = rootRef.current?.offsetWidth ?? 320;
    const height = rootRef.current?.offsetHeight ?? 240;
    const left = bounds?.left ?? 12;
    const top = bounds?.top ?? 12;
    const right = bounds?.right ?? 12;
    const bottom = bounds?.bottom ?? 12;
    return {
      x: Math.min(Math.max(left, x), Math.max(left, window.innerWidth - width - right)),
      y: Math.min(Math.max(top, y), Math.max(top, window.innerHeight - height - bottom))
    };
  };

  useEffect(() => {
    setPosition((current) => clampToViewport(current.x, current.y));

    if (typeof window === 'undefined') return;
    const handleResize = () => setPosition((current) => clampToViewport(current.x, current.y));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [bounds?.bottom, bounds?.left, bounds?.right, bounds?.top]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !resizable || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setPosition((current) => clampToViewport(current.x, current.y));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [bounds?.bottom, bounds?.left, bounds?.right, bounds?.top, resizable]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const frame = window.requestAnimationFrame(() => {
      const nextPosition = resolvePosition(defaultPosition);
      setPosition(clampToViewport(nextPosition.x, nextPosition.y));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = positionRef.current;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: current.x, originY: current.y };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clampToViewport(
      drag.originX + event.clientX - drag.startX,
      drag.originY + event.clientY - drag.startY
    ));
  };

  const stopDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <Surface
      {...props}
      elementRef={rootRef}
      padding="sm"
      className={`dh-draggable-surface ${styles.root} ${resizable ? styles.resizable : ''} ${className}`.trim()}
      style={{ left: position.x, top: position.y }}
    >
      <header
        className={styles.handle}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <span className={styles.title}>{title}</span>
        {actions && <span className={styles.actions} data-drag-ignore>{actions}</span>}
      </header>
      {children && <div className={styles.body}>{children}</div>}
    </Surface>
  );
}

function resolvePosition(position: DraggableSurfacePosition | (() => DraggableSurfacePosition)): DraggableSurfacePosition {
  return typeof position === 'function' ? position() : position;
}
