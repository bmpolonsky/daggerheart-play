/** @jsxImportSource preact */
import { Checkbox } from '../../components/common';

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
