import { Minus, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FeatureUsageLimitEffect } from '../../domain/rules/featureEffects';
import type { CharacterChangeActor, CharacterUsageTracker, CharacterUsageTrackerReset, CharacterUsageTrackerTargetKind } from '../../domain/rules/types';
import { characterService } from '../../services/serviceRegistry';
import { Button } from '../components/common/Button';
import { Dialog } from '../components/common/Dialog';
import { NumberField, SelectField, TextField } from '../components/common/Field';
import { IconButton } from '../components/common/IconButton';
import { Notice } from '../components/common/Notice';
import { SectionHeader } from '../components/common/SectionHeader';
import styles from './UsageTrackerControl.module.css';

export function UsageTrackerControl({
  characterId,
  targetKind,
  targetId,
  targetName,
  tracker,
  actor,
  compact = false,
  suggestedUsage,
  onlyWhenSuggested = false
}: {
  characterId: string;
  targetKind: CharacterUsageTrackerTargetKind;
  targetId: string;
  targetName: string;
  tracker?: CharacterUsageTracker;
  actor?: CharacterChangeActor;
  compact?: boolean;
  suggestedUsage?: FeatureUsageLimitEffect | null;
  onlyWhenSuggested?: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const context = actor ? { actor } : undefined;
  const suggestion = usageTrackerSuggestionDefaults(suggestedUsage);
  const updateCurrent = (current: number) => {
    if (!tracker) return;
    characterService.updateUsageTracker(characterId, tracker.id, { current }, context);
  };

  if (!tracker) {
    if (onlyWhenSuggested && !suggestion) return null;
    return (
      <>
        {compact ? (
          <IconButton
            size="xs"
            variant="ghost"
            title={`Настроить трекер для «${targetName}»`}
            aria-label={`Настроить трекер ${targetName}`}
            onClick={(event) => {
              event.stopPropagation();
              setSettingsOpen(true);
            }}
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
          </IconButton>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            title={`Настроить трекер для «${targetName}»`}
            aria-label={`Настроить трекер ${targetName}`}
            iconBefore={<SlidersHorizontal size={13} aria-hidden="true" />}
            onClick={(event) => {
              event.stopPropagation();
              setSettingsOpen(true);
            }}
          >
            Трекер
          </Button>
        )}
        {settingsOpen && (
          <UsageTrackerDialog
            targetName={targetName}
            suggestion={suggestion}
            onClose={() => setSettingsOpen(false)}
            onSave={(input) => {
              characterService.configureUsageTracker(characterId, { targetKind, targetId, ...input }, context);
              setSettingsOpen(false);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className={styles.root} onClick={(event) => event.stopPropagation()} aria-label={`${tracker.label}: ${tracker.current} из ${tracker.max}`}>
      <IconButton size="xs" variant="ghost" title="Уменьшить" aria-label={`Уменьшить ${tracker.label}`} disabled={tracker.current <= 0} onClick={() => updateCurrent(tracker.current - 1)}>
        <Minus size={12} aria-hidden="true" />
      </IconButton>
      <span className={styles.value}>{tracker.current}/{tracker.max}</span>
      <IconButton size="xs" variant="ghost" title="Увеличить" aria-label={`Увеличить ${tracker.label}`} disabled={tracker.current >= tracker.max} onClick={() => updateCurrent(tracker.current + 1)}>
        <Plus size={12} aria-hidden="true" />
      </IconButton>
      <IconButton size="xs" variant="ghost" title="Настроить трекер" aria-label={`Настроить трекер ${targetName}`} onClick={() => setSettingsOpen(true)}>
        <SlidersHorizontal size={12} aria-hidden="true" />
      </IconButton>
      {settingsOpen && (
        <UsageTrackerDialog
          targetName={targetName}
          tracker={tracker}
          onClose={() => setSettingsOpen(false)}
          onRemove={() => {
            characterService.removeUsageTracker(characterId, tracker.id, context);
            setSettingsOpen(false);
          }}
          onSave={(input) => {
            characterService.updateUsageTracker(characterId, tracker.id, input, context);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function UsageTrackerDialog({
  targetName,
  tracker,
  suggestion,
  onClose,
  onRemove,
  onSave
}: {
  targetName: string;
  tracker?: CharacterUsageTracker;
  suggestion?: UsageTrackerSuggestionDefaults | null;
  onClose: () => void;
  onRemove?: () => void;
  onSave: (input: { label: string; max: number; current: number; reset: CharacterUsageTrackerReset }) => void;
}) {
  const [label, setLabel] = useState(tracker?.label ?? suggestion?.label ?? 'Использование');
  const [max, setMax] = useState(tracker?.max ?? suggestion?.max ?? 1);
  const [current, setCurrent] = useState(tracker?.current ?? 0);
  const [reset, setReset] = useState<CharacterUsageTrackerReset>(tracker?.reset ?? suggestion?.reset ?? 'manual');

  useEffect(() => setCurrent((value) => Math.min(value, max)), [max]);

  return (
    <Dialog className={styles.dialog} aria-label={`Трекер: ${targetName}`} onClose={onClose}>
      <SectionHeader
        title={targetName}
        actions={(
          <IconButton variant="ghost" size="sm" title="Закрыть" aria-label="Закрыть настройки трекера" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        )}
      />
      <div className={styles.dialogBody}>
        {suggestion && !tracker && (
          <Notice tone="info">
            Распознано из текста: {suggestion.summary}.{suggestion.manualReset ? ' Сброс нужно отмечать вручную.' : ''}
          </Notice>
        )}
        <TextField autoFocus label="Название трекера" value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
        <NumberField label="Количество использований" min={1} max={99} value={max} onChange={(event) => setMax(Math.max(1, Math.min(99, Number(event.currentTarget.value) || 1)))} />
        <SelectField label="Сброс" value={reset} onChange={(event) => setReset(event.currentTarget.value as CharacterUsageTrackerReset)}>
          <option value="manual">Вручную</option>
          <option value="short">После короткого отдыха</option>
          <option value="long">После долгого отдыха</option>
        </SelectField>
        <div className={styles.dialogActions}>
          {onRemove && <Button variant="danger" size="sm" onClick={onRemove}>Удалить</Button>}
          <div>
            {tracker && tracker.current > 0 && (
              <Button size="sm" variant="ghost" iconBefore={<RotateCcw size={14} aria-hidden="true" />} onClick={() => setCurrent(0)}>
                Сбросить
              </Button>
            )}
            <Button size="sm" onClick={onClose}>Отмена</Button>
            <Button size="sm" variant="primary" onClick={() => onSave({ label, max, current, reset })}>Сохранить</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export interface UsageTrackerSuggestionDefaults {
  label: string;
  max: number;
  reset: CharacterUsageTrackerReset;
  summary: string;
  manualReset: boolean;
}

export function usageTrackerSuggestionDefaults(
  effect: FeatureUsageLimitEffect | null | undefined
): UsageTrackerSuggestionDefaults | null {
  if (!effect || effect.scope !== 'feature') return null;
  const presentation = {
    rest: { label: 'До следующего отдыха', reset: 'short' as const, manualReset: false },
    longRest: { label: 'До продолжительного отдыха', reset: 'long' as const, manualReset: false },
    session: { label: 'За сессию', reset: 'manual' as const, manualReset: true },
    scene: { label: 'За сцену', reset: 'manual' as const, manualReset: true }
  }[effect.reset];
  return {
    ...presentation,
    max: effect.max,
    summary: effect.summary
  };
}
