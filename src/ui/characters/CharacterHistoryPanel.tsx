import type { Character, CharacterChangeRecord } from '../../domain/rules/types';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { SectionHeader } from '../components/common/SectionHeader';
import { characterHistoryFieldLabel, formatCharacterFieldChange } from './characterHistoryPresentation';
import styles from './CharacterHistoryPanel.module.css';

export function CharacterHistoryPanel({
  character,
  canUndo = false,
  onUndo
}: {
  character: Character;
  canUndo?: boolean;
  onUndo?: (changeId: string) => void;
}) {
  const history = [...(character.changeHistory ?? [])].reverse();
  const undoneIds = new Set(history.flatMap((entry) => entry.undoesChangeId ? [entry.undoesChangeId] : []));

  return (
    <section className={styles.root} aria-label="История изменений персонажа">
      <SectionHeader title="История изменений" />
      {history.length === 0 ? (
        <EmptyState tone="transparent" size="sm" title="Изменений пока нет" />
      ) : (
        <ol className={styles.list}>
          {history.map((entry) => {
            const undone = undoneIds.has(entry.id);
            return (
              <li key={entry.id} className={styles.entry}>
                <details>
                  <summary>
                    <span className={styles.summary}>{entry.summary}</span>
                    <span className={styles.count}>{entry.changes.length}</span>
                    <span className={styles.meta}>{actorLabel(entry)} — {formatDate(entry.changedAt)}{undone ? ' — отменено' : ''}</span>
                  </summary>
                  <div className={styles.body}>
                    {entry.overrideReason && <p className={styles.override}>Причина свободного режима: {entry.overrideReason}</p>}
                    <ul className={styles.changes}>
                      {entry.changes.map((change, index) => (
                        <li key={`${change.path.join('.')}-${index}`} className={styles.change}>
                          <strong>{characterHistoryFieldLabel(change.path)}</strong>
                          <span>{formatCharacterFieldChange(change)}</span>
                        </li>
                      ))}
                    </ul>
                    {canUndo && entry.kind !== 'undo' && (
                      <div className={styles.actions}>
                        <Button size="xs" variant="ghost" disabled={undone} onClick={() => onUndo?.(entry.id)}>
                          {undone ? 'Отменено' : 'Отменить изменение'}
                        </Button>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function actorLabel(entry: CharacterChangeRecord): string {
  const role = entry.actor.role === 'gm' ? 'мастер' : entry.actor.role === 'player' ? 'игрок' : 'система';
  return `${entry.actor.name} — ${role}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
