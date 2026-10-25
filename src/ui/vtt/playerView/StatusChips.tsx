/** @jsxImportSource preact */
import { useMemo, useState } from "preact/hooks";
import { Pencil, Plus, X } from "lucide-react";
import { CORE_STATUS_TAGS, normalizeStatusTag, statusLabel } from "../../../domain/rules/statuses";
import { isCustomCondition, type CustomConditionDraft } from "../../../domain/rules/customConditions";
import { Button } from "../../components/common/Button";
import { IconButton } from "../../components/common/IconButton";
import { CompendiumRuleTerm } from "./CompendiumRuleTerm";
import { CustomConditionEditor } from "./CustomConditionEditor";

export interface SheetStatus {
  id: string;
  name: string;
  notes?: string;
  removalCondition?: string;
}

export function StatusChips({
  addLabel = 'Добавить состояние',
  conditions,
  onAdd,
  onRemove,
  onAddCustom,
  onUpdateCustom,
  options = CORE_STATUS_TAGS
}: {
  addLabel?: string;
  conditions: SheetStatus[];
  onAdd: (name: string) => void;
  onRemove: (conditionId: string) => void;
  onAddCustom?: (draft: CustomConditionDraft) => boolean | void;
  onUpdateCustom?: (conditionId: string, draft: CustomConditionDraft) => boolean | void;
  options?: string[];
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [conditionEditor, setConditionEditor] = useState<SheetStatus | 'new' | null>(null);
  const visibleConditions = conditions.filter((condition) => isVisibleStatus(condition.name));
  const activeNames = useMemo(() => new Set(visibleConditions.map((condition) => normalizeStatusTag(condition.name))), [visibleConditions]);
  const availableStatuses = options.filter((status) => !activeNames.has(normalizeStatusTag(status)));

  return (
    <section className="player-status-chips" aria-label="Состояния">
      <div className="player-status-chips__list">
        {visibleConditions.map((condition) => (
          <span className="player-status-chip" key={condition.id} title={[condition.notes, condition.removalCondition ? `Снять вручную: ${condition.removalCondition}` : ''].filter(Boolean).join('\n') || undefined}>
            <span>
              {isCustomCondition(condition) ? condition.name : <CompendiumRuleTerm ruleSlug={statusRuleSlug(condition.name)} leadSummary>
                {statusLabel(condition.name)}
              </CompendiumRuleTerm>}
            </span>
            {isCustomCondition(condition) && onUpdateCustom && (
              <IconButton variant="ghost" size="xs" type="button" aria-label={`Изменить состояние ${condition.name}`} onClick={() => setConditionEditor(condition)}>
                <Pencil size={12} aria-hidden="true" />
              </IconButton>
            )}
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
                  <CompendiumRuleTerm ruleSlug={statusRuleSlug(status)} leadSummary tooltipOnly>
                    {statusLabel(status)}
                  </CompendiumRuleTerm>
                </Button>
              )) : (
                <span>Все основные состояния уже добавлены</span>
              )}
              {onAddCustom && <Button size="sm" variant="ghost" type="button" role="menuitem" onClick={() => {
                setIsMenuOpen(false);
                setConditionEditor('new');
              }}>Своё состояние</Button>}
            </div>
          )}
        </div>
      </div>
      {conditionEditor && (
        <CustomConditionEditor
          conditions={conditions}
          condition={conditionEditor === 'new' ? undefined : conditionEditor}
          onClose={() => setConditionEditor(null)}
          onSave={(draft) => conditionEditor === 'new'
            ? onAddCustom?.(draft)
            : onUpdateCustom?.(conditionEditor.id, draft)}
        />
      )}
    </section>
  );
}

function isVisibleStatus(value: string): boolean {
  return Boolean(normalizeStatusTag(value));
}

function statusRuleSlug(value: string): string {
  const normalized = normalizeStatusTag(value);
  if (normalized === 'vulnerable') return 'vulnerable';
  if (normalized === 'hidden') return 'hidden';
  if (normalized === 'restrained') return 'restrained';
  return 'condition';
}
