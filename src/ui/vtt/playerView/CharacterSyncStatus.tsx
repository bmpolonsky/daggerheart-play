import { useStream } from '../../../core/hooks/useStream';
import { characterService, p2pSessionService } from '../../../services/serviceRegistry';
import type { CharacterSyncDelivery } from '../../../services/P2PSessionService';
import { Badge, Notice, Surface } from '../../components/common';
import type { TableViewRole } from './types';
import styles from './CharacterSyncStatus.module.css';

const labels: Record<CharacterSyncDelivery['state'], string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждено мастером',
  failed: 'Изменение отклонено'
};

export function CharacterSyncStatus({ role, actorId }: { role: TableViewRole; actorId: string | null }) {
  const session = useStream(p2pSessionService.session$);
  const characters = useStream(characterService.characters$);
  const current = actorId ? session.characterSync?.[actorId] : undefined;
  const events = (session.characterSyncEvents ?? []).filter((event) => role === 'gm' || event.actorId === actorId);
  if (!current && events.length === 0) return null;
  return (
    <div className={styles.status} aria-label="Синхронизация персонажа">
      {role === 'player' && current && (
        <Notice role="status" aria-live="polite" tone={current.state === 'failed' ? 'error' : current.state === 'pending' ? 'warning' : 'success'}>
          {labels[current.state]}
          {current.state === 'failed' && <div>{current.message}</div>}
        </Notice>
      )}
      <Surface tone="solid" padding="sm"><details className={styles.journal}>
        <summary>Журнал синхронизации <Badge size="xs">{events.length}</Badge></summary>
        <ol>
          {events.slice(0, 10).map((event) => (
            <li key={`${event.actorId}:${event.revision}:${event.state}:${event.at}`}>
              <strong>{characters.entities[event.actorId]?.name ?? 'Персонаж'}</strong>
              <span>{labels[event.state]}, версия {event.revision}</span>
              <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time>
            </li>
          ))}
        </ol>
      </details></Surface>
    </div>
  );
}
