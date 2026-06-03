/** @jsxImportSource preact */
import { useMemo, useState } from "preact/hooks";
import { Plus, X } from "lucide-react";
import { CORE_STATUS_TAGS, normalizeStatusTag, statusLabel } from "../../../domain/rules/statuses";
import { Button } from "../../components/common/Button";
import { IconButton } from "../../components/common/IconButton";

export interface SheetStatus {
  id: string;
  name: string;
  notes?: string;
}

export function StatusChips({
  addLabel = 'Добавить состояние',
  conditions,
  onAdd,
  onRemove,
  options = CORE_STATUS_TAGS
}: {
  addLabel?: string;
  conditions: SheetStatus[];
  onAdd: (name: string) => void;
  onRemove: (conditionId: string) => void;
  options?: string[];
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const visibleConditions = conditions.filter((condition) => isVisibleStatus(condition.name));
  const activeNames = useMemo(() => new Set(visibleConditions.map((condition) => normalizeStatusTag(condition.name))), [visibleConditions]);
  const availableStatuses = options.filter((status) => !activeNames.has(normalizeStatusTag(status)));

  return (
    <section className="player-status-chips" aria-label="Состояния">
      <div className="player-status-chips__list">
        {visibleConditions.map((condition) => (
          <span className="player-status-chip" key={condition.id} title={condition.notes || condition.name}>
            <span>{statusLabel(condition.name)}</span>
            <IconButton variant="ghost" size="xs" type="button" aria-label={`Снять состояние ${statusLabel(condition.name)}`} onClick={() => onRemove(condition.id)}>
              <X size={13} aria-hidden="true" />
            </IconButton>
          </span>
        ))}
        <div className="player-status-chips__add">
          <IconButton
            className="player-status-chips__add-button"
            variant="secondary"
            size="xs"
            type="button"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={addLabel}
            title={addLabel}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <Plus size={15} aria-hidden="true" />
          </IconButton>
          {isMenuOpen && (
            <div className="player-status-chips__menu" role="menu">
              {availableStatuses.length > 0 ? availableStatuses.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant="ghost"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAdd(status);
                    setIsMenuOpen(false);
                  }}
                >
                  {statusLabel(status)}
                </Button>
              )) : (
                <span>Все основные состояния уже добавлены</span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function isVisibleStatus(value: string): boolean {
  return Boolean(normalizeStatusTag(value));
}
