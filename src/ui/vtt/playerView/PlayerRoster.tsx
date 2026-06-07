/** @jsxImportSource preact */
import { Hand, Mic, MicOff, Plus } from 'lucide-react';
import { Avatar } from '../../components/common/Avatar';
import { IconButton } from '../../components/common/IconButton';
import { ListItem } from '../../components/common/ListItem';
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
        const subtitle = actor.kind === 'character' ? actor.subtitle : actor.kind === 'environment' ? actor.subtitle || 'Окружение' : 'НПС';
        return (
          <ListItem
            className={`player-roster__row ${active || Boolean(activationRequest) ? 'dh-is-selected' : ''} ${locked ? 'dh-is-locked' : ''} ${actor.presence?.connected ? 'dh-is-online' : 'dh-is-offline'}`}
            key={`${actor.kind}:${actor.actorId}`}
            title={actor.name}
            subtitle={subtitle}
            leftAccessory={(
              <>
                {actor.kind === 'character' && role === 'gm' && (
                  <i
                    className={`player-roster__presence ${actor.presence?.connected ? 'dh-is-online' : 'dh-is-offline'}`}
                    aria-label={actor.presence?.connected ? 'Игрок подключен' : 'Игрок не подключен'}
                  />
                )}
                <Avatar src={actor.imageUrl ? cssImageUrl(actor.imageUrl) : undefined} fallback={initials(actor.name)} />
              </>
            )}
            disabled={locked}
            tooltip={opensSheet ? actor.name : 'Детали скрыты от игроков'}
            onClick={opensSheet ? () => onOpenActor({ kind: actor.kind, actorId: actor.actorId }) : undefined}
            rightAccessory={role === 'gm' ? (
              <>
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
              </>
            ) : undefined}
          />
        );
      })}
    </section>
  );
}
