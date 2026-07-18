import type { Character, CharacterChangeRecord, CharacterChangeValue } from '../../domain/rules/types';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { SectionHeader } from '../components/common/SectionHeader';
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
                          <strong>{fieldLabel(change.path)}</strong>
                          <span>{formatValue(change.beforeExists ? change.before : undefined)} → {formatValue(change.afterExists ? change.after : undefined)}</span>
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

function fieldLabel(path: string[]): string {
  const labels: Record<string, string> = {
    name: 'Имя',
    className: 'Класс',
    subclassName: 'Подкласс',
    ancestry: 'Родословная',
    community: 'Сообщество',
    level: 'Уровень',
    proficiency: 'Мастерство',
    traits: 'Характеристики',
    evasion: 'Уклонение',
    thresholds: 'Пороги',
    hp: 'Раны',
    stress: 'Стресс',
    hope: 'Надежда',
    armor: 'Броня',
    experiences: 'Опыты',
    domainCards: 'Карты доменов',
    usageTrackers: 'Трекеры',
    inventory: 'Инвентарь',
    notes: 'Заметки'
  };
  if (path.length === 0) return 'Персонаж';
  return [labels[path[0]] ?? path[0], ...path.slice(1)].join(' — ');
}

function formatValue(value: CharacterChangeValue | undefined): string {
  if (value === undefined) return '—';
  if (value === null) return 'нет';
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (typeof value === 'string' || typeof value === 'number') return truncate(String(value));
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return 'изменено';
  }
}

function truncate(value: string): string {
  return value.length > 140 ? `${value.slice(0, 137)}…` : value;
}
