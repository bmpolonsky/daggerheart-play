/** @jsxImportSource preact */
import { X } from 'lucide-react';
import { Checkbox, IconButton } from '../../components/common';

export function rollConfirmDefaultPosition() {
  return {
    x: typeof window === 'undefined' ? 320 : Math.max(16, window.innerWidth - 472),
    y: 118
  };
}

export function RollConfirmCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <IconButton variant="ghost" size="sm" type="button" title="Закрыть" aria-label="Закрыть" onClick={onClose}>
      <X size={15} aria-hidden="true" />
    </IconButton>
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
