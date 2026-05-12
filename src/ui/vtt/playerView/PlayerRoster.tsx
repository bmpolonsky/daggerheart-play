/** @jsxImportSource preact */
import { Hand, Mic, MicOff, Plus } from 'lucide-react';
import { cssImageUrl, initials } from './helpers';
import type { PlayerRosterActor, PlayerViewedActor, TableViewRole } from './types';

export function PlayerRoster({
  actors,
  activeAdversaryId,
  activeCharacterId,
  role,
  sceneId,
  onAddActorToScene,
  onClearActivationRequest,
  onForceMutePlayer,
  onOpenActor
}: {
  actors: PlayerRosterActor[];
  activeAdversaryId: string | null;
  activeCharacterId: string | null;
  role: TableViewRole;
  sceneId: string;
  onAddActorToScene: (actor: PlayerViewedActor, sceneId: string) => void;
  onClearActivationRequest?: (request: NonNullable<PlayerRosterActor['activationRequest']>) => void;
  onForceMutePlayer?: (actor: PlayerRosterActor) => void;
  onOpenActor: (actor: PlayerViewedActor) => void;
}) {
  if (actors.length === 0) return null;
  return (
    <section className="player-roster" aria-label="Участники сцены">
      {actors.map((actor) => {
        const opensSheet = actor.kind === 'character' || role === 'gm';
        const locked = !opensSheet;
        const active = actor.kind === 'character'
          ? actor.actorId === activeCharacterId
          : actor.actorId === activeAdversaryId;
        const activationRequest = actor.activationRequest;
        return (
          <article
            className={`player-roster__row ${active ? 'dh-is-active' : ''} ${locked ? 'dh-is-locked' : ''} ${activationRequest ? 'dh-has-activation' : ''} ${actor.presence?.connected ? 'dh-is-online' : 'dh-is-offline'}`}
            key={`${actor.kind}:${actor.actorId}`}
          >
            <button
              className="player-roster__open"
              disabled={locked}
              title={opensSheet ? actor.name : 'Лист НПС скрыт от игроков'}
              type="button"
              onClick={() => {
                if (opensSheet) onOpenActor({ kind: actor.kind, actorId: actor.actorId });
              }}
            >
              {actor.kind === 'character' && role === 'gm' && (
                <i
                  className={`player-roster__presence ${actor.presence?.connected ? 'dh-is-online' : 'dh-is-offline'}`}
                  aria-label={actor.presence?.connected ? 'Игрок подключен' : 'Игрок не подключен'}
                />
              )}
              {actor.imageUrl ? (
                <img src={cssImageUrl(actor.imageUrl)} alt="" draggable={false} onDragStart={(event) => event.preventDefault()} />
              ) : (
                <span className="player-roster__avatar" aria-hidden="true">{initials(actor.name)}</span>
              )}
              <span>
                <strong>{actor.name}</strong>
                <small>{actor.kind === 'adversary' ? 'НПС' : actor.subtitle}</small>
              </span>
            </button>
            {role === 'gm' && (
              <div className="player-roster__actions">
                {actor.kind === 'character' && (
                  <button
                    aria-label={`Микрофон ${actor.name}`}
                    className={`player-roster__mic ${actor.presence?.voiceLive && !actor.presence.voiceMuted ? 'dh-is-live' : ''}`}
                    disabled={!actor.presence?.connected}
                    title={actor.presence?.connected ? 'Заглушить микрофон игрока' : 'Игрок не подключен'}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onForceMutePlayer?.(actor);
                    }}
                  >
                    {actor.presence?.voiceLive && !actor.presence.voiceMuted ? <Mic size={15} aria-hidden="true" /> : <MicOff size={15} aria-hidden="true" />}
                  </button>
                )}
                {activationRequest && (
                  <button
                    aria-label={`Дать активацию ${actor.name}`}
                    className="player-roster__activation"
                    title="Дать активацию и убрать из очереди"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClearActivationRequest?.(activationRequest);
                    }}
                  >
                    <Hand size={15} aria-hidden="true" />
                  </button>
                )}
                <button
                  aria-label={`Добавить ${actor.name} на сцену${actor.isOnScene ? ' (уже на сцене)' : ''}`}
                  className="player-roster__add"
                  disabled={actor.isOnScene}
                  title={actor.isOnScene ? 'Уже на сцене' : 'Добавить на сцену'}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddActorToScene({ kind: actor.kind, actorId: actor.actorId }, sceneId);
                  }}
                >
                  <Plus size={15} aria-hidden="true" />
                </button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
