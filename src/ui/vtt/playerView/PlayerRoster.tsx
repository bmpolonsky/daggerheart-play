/** @jsxImportSource preact */
import { Hand, Mic, MicOff, Plus } from 'lucide-react';
import { ChoiceCard } from '../../components/common/ChoiceCard';
import { IconButton } from '../../components/common/IconButton';
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
        const voiceLive = Boolean(actor.presence?.voiceLive && !actor.presence.voiceMuted);
        const voiceConnected = Boolean(actor.presence?.connected);
        return (
          <article
            className={`player-roster__row ${locked ? 'dh-is-locked' : ''} ${actor.presence?.connected ? 'dh-is-online' : 'dh-is-offline'}`}
            key={`${actor.kind}:${actor.actorId}`}
          >
            <ChoiceCard
              className="player-roster__open"
              selected={active || Boolean(activationRequest)}
              disabled={locked}
              title={opensSheet ? actor.name : 'Детали скрыты от игроков'}
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
                <small>{actor.kind === 'character' ? actor.subtitle : actor.kind === 'environment' ? actor.subtitle || 'Окружение' : 'НПС'}</small>
              </span>
            </ChoiceCard>
            {role === 'gm' && (
              <div className="player-roster__actions">
                {actor.kind === 'character' && (
                  <IconButton
                    aria-label={`Микрофон ${actor.name}`}
                    className="player-roster__mic"
                    variant="ghost"
                    tone={voiceLive ? 'green' : voiceConnected ? 'blue' : 'neutral'}
                    size="sm"
                    disabled={!voiceConnected}
                    title={voiceConnected ? 'Заглушить микрофон игрока' : 'Игрок не подключен'}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onForceMutePlayer?.(actor);
                    }}
                  >
                    {voiceLive ? <Mic size={15} aria-hidden="true" /> : <MicOff size={15} aria-hidden="true" />}
                  </IconButton>
                )}
                {activationRequest && (
                  <IconButton
                    aria-label={`Дать активацию ${actor.name}`}
                    className="player-roster__activation"
                    variant="primary"
                    size="sm"
                    title="Дать активацию и убрать из очереди"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClearActivationRequest?.(activationRequest);
                    }}
                  >
                    <Hand size={15} aria-hidden="true" />
                  </IconButton>
                )}
                <IconButton
                  aria-label={`Добавить ${actor.name} на сцену${actor.isOnScene ? ' (уже на сцене)' : ''}`}
                  className="player-roster__add"
                  variant="secondary"
                  size="sm"
                  disabled={actor.isOnScene}
                  title={actor.isOnScene ? 'Уже на сцене' : 'Добавить на сцену'}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddActorToScene({ kind: actor.kind, actorId: actor.actorId }, sceneId);
                  }}
                >
                  <Plus size={15} aria-hidden="true" />
                </IconButton>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
