/** @jsxImportSource preact */
import { Mountain, Plus, Shield, Swords, UserRound } from 'lucide-react';
import { ActionMenu, IconButton } from '../../components/common';

export type SceneAddTarget = 'character' | 'adversary' | 'environment' | 'combat';

export function SceneAddMenu({
  className,
  onSelect
}: {
  className?: string;
  onSelect: (target: SceneAddTarget) => void;
}) {
  return (
    <ActionMenu
      ariaLabel="Добавить к сцене"
      className={className}
      placement="top-end"
      items={[
        { id: 'character', label: 'Героя', icon: <UserRound size={16} />, onSelect: () => onSelect('character') },
        { id: 'adversary', label: 'Противника', icon: <Shield size={16} />, onSelect: () => onSelect('adversary') },
        { id: 'environment', label: 'Окружение', icon: <Mountain size={16} />, onSelect: () => onSelect('environment') },
        { id: 'combat', label: 'Создать бой', icon: <Swords size={16} />, onSelect: () => onSelect('combat') }
      ]}
      renderTrigger={(props) => (
        <IconButton
          {...props}
          aria-label="Добавить к сцене"
          size="xs"
          title="Добавить к сцене"
          tone="gold"
          variant="secondary"
        >
          <Plus size={14} aria-hidden="true" />
        </IconButton>
      )}
    />
  );
}
