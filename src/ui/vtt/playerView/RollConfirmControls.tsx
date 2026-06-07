/** @jsxImportSource preact */
import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { X } from 'lucide-react';
import { clampRollConfirmPosition } from './helpers';
import { Checkbox } from '../../components/common/Checkbox';
import { IconButton } from '../../components/common/IconButton';

export function useRollConfirmDrag() {
  const panelRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState(() => ({
    x: typeof window === 'undefined' ? 320 : Math.max(16, window.innerWidth - 472),
    y: 118
  }));
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const clampToPanel = (x: number, y: number) => clampRollConfirmPosition(x, y, {
    width: panelRef.current?.offsetWidth,
    height: panelRef.current?.offsetHeight
  });

  const startDrag = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button, input, select')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y };
  };

  const moveWindow = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextX = drag.originX + event.clientX - drag.startX;
    const nextY = drag.originY + event.clientY - drag.startY;
    setPosition(clampToPanel(nextX, nextY));
  };

  const stopDrag = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    panelRef,
    position,
    dragHandlers: {
      onPointerDown: startDrag,
      onPointerMove: moveWindow,
      onPointerUp: stopDrag,
      onPointerCancel: stopDrag
    }
  };
}

export function RollConfirmHeader({
  label,
  onClose,
  dragHandlers
}: {
  label: string;
  onClose: () => void;
  dragHandlers: {
    onPointerDown: (event: JSX.TargetedPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: JSX.TargetedPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: JSX.TargetedPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: JSX.TargetedPointerEvent<HTMLElement>) => void;
  };
}) {
  return (
    <header className="player-roll-confirm__header" {...dragHandlers}>
      <span>{label}</span>
      <IconButton variant="ghost" size="sm" type="button" title="Закрыть" aria-label="Закрыть" onClick={onClose}>
        <X size={15} aria-hidden="true" />
      </IconButton>
    </header>
  );
}

export function RollPrivateToggle({
  checked,
  onChange
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      className="player-roll-confirm__private"
      size="sm"
      boxPosition="start"
      label="Приватный бросок"
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
    />
  );
}
