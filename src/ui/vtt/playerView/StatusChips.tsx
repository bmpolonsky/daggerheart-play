/** @jsxImportSource preact */
import { useMemo, useState } from "preact/hooks";
import { Plus, X } from "lucide-react";
import { CORE_STATUS_TAGS, normalizeStatusTag, statusLabel } from "../../../domain/rules/statuses";

export interface SheetStatus {
  id: string;
  name: string;
  notes?: string;
}

export function StatusChips({
  addLabel = 'Добавить статус',
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
    <section className="player-status-chips" aria-label="Статусы">
      <div className="player-status-chips__list">
        {visibleConditions.map((condition) => (
          <span className="player-status-chip" key={condition.id} title={condition.notes || condition.name}>
            <span>{statusLabel(condition.name)}</span>
            <button type="button" aria-label={`Снять статус ${statusLabel(condition.name)}`} onClick={() => onRemove(condition.id)}>
              <X size={13} />
            </button>
          </span>
        ))}
        <div className="player-status-chips__add">
          <button
            className="player-status-chips__add-button"
            type="button"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={addLabel}
            title={addLabel}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <Plus size={15} />
          </button>
          {isMenuOpen && (
            <div className="player-status-chips__menu" role="menu">
              {availableStatuses.length > 0 ? availableStatuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAdd(status);
                    setIsMenuOpen(false);
                  }}
                >
                  {statusLabel(status)}
                </button>
              )) : (
                <span>Все основные статусы уже добавлены</span>
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
