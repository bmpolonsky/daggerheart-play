/** @jsxImportSource preact */
import { Eye, EyeOff, Hand, MapPlus, Mic, MicOff, Trash2 } from 'lucide-react';
import { Avatar } from '../../components/common/Avatar';
import { IconButton } from '../../components/common/IconButton';
import { ListItem } from '../../components/common/ListItem';
import { ResourcePips } from '../../components/common/ResourcePips';
import { cssImageUrl, initials } from './helpers';
import type { PlayerRosterActor, PlayerViewedActor, TableViewRole } from './types';

export function PlayerRoster({
  actors,
  activeAdversaryId,
  activeCharacterId,
  role,
  sceneId,
  onAddActorToScene,
  onRemoveActorFromScene,
  onSetActorHidden,
  onClearActivationRequest,
  onForceMutePlayer,
  onSetResource,
  onOpenActor
}: {
  actors: PlayerRosterActor[];
  activeAdversaryId: string | null;
  activeCharacterId: string | null;
  role: TableViewRole;
  sceneId: string;
  onAddActorToScene: (actor: PlayerRosterActor, sceneId: string) => void;
  onRemoveActorFromScene?: (actor: PlayerRosterActor, sceneId: string) => void;
  onSetActorHidden?: (actor: PlayerRosterActor, hidden: boolean, sceneId: string) => void;
  onClearActivationRequest?: (request: NonNullable<PlayerRosterActor['activationRequest']>) => void;
  onForceMutePlayer?: (actor: PlayerRosterActor) => void;
  onSetResource?: (actor: PlayerRosterActor, resource: 'hope' | 'hp' | 'stress', next: number) => void;
  onOpenActor: (actor: PlayerViewedActor) => void;
}) {
  if (actors.length === 0) return null;
  return (
    <section className="player-roster" aria-label="Участники сцены">
      {actors.map((actor) => {
        const opensSheet = actor.kind === 'character' || actor.kind === 'companion' || role === 'gm';
        const locked = !opensSheet;
        const active = actor.kind === 'character' || actor.kind === 'companion'
          ? actor.actorId === activeCharacterId
          : actor.actorId === activeAdversaryId;
        const activationRequest = actor.activationRequest;
        const voiceLive = Boolean(actor.presence?.voiceLive && !actor.presence.voiceMuted);
        const voiceConnected = Boolean(actor.presence?.connected);
        const subtitle = actor.kind === 'character' || actor.kind === 'companion'
          ? actor.subtitle
          : actor.kind === 'environment'
            ? actor.subtitle || 'Окружение'
            : actor.subtitle;
        const hasResources = (actor.kind === 'character' || actor.kind === 'adversary') && Boolean(actor.hp && actor.stress);
        const viewedActor: PlayerViewedActor = actor.kind === 'companion'
          ? { kind: 'character', actorId: actor.actorId }
          : { kind: actor.kind, actorId: actor.actorId };
        return (
          <div
            className={`player-roster__item ${actor.kind === 'companion' ? 'player-roster__item--companion' : ''} ${active || Boolean(activationRequest) ? 'dh-is-selected' : ''}`}
            key={`${actor.kind}:${actor.actorId}`}
            onClick={(event) => {
              if (!opensSheet || (event.target as HTMLElement).closest('button, .player-roster__tracks')) return;
              onOpenActor(viewedActor);
            }}
          >
            <ListItem
              className={`player-roster__row ${locked ? 'dh-is-locked' : ''} ${actor.presence?.connected ? 'dh-is-online' : 'dh-is-offline'}`}
              title={actor.name}
              subtitle={subtitle}
              align="center"
              leftAccessory={(
                <>
                  {actor.kind === 'character' && role === 'gm' && (
                    <i
                      className={`player-roster__presence ${actor.presence?.connected ? 'dh-is-online' : 'dh-is-offline'}`}
                      aria-label={actor.presence?.connected ? 'Игрок подключен' : 'Игрок не подключен'}
                    />
                  )}
                  <Avatar src={actor.imageUrl ? cssImageUrl(actor.imageUrl) : undefined} fallback={initials(actor.name)} size="sm" />
                </>
              )}
              disabled={locked}
              tooltip={opensSheet ? actor.name : 'Детали скрыты от игроков'}
              onClick={opensSheet ? () => onOpenActor(viewedActor) : undefined}
              rightAccessory={role === 'gm' ? (
                <>
                  {actor.kind === 'companion' && actor.stress && (
                    <div className="player-roster__companion-stress" onClick={(event) => event.stopPropagation()}>
                      <ResourcePips
                        label="Стресс"
                        current={actor.stress.marked}
                        max={actor.stress.max}
                        tone="stress"
                        onChange={(next) => onSetResource?.(actor, 'stress', next)}
                      />
                    </div>
                  )}
                  {actor.kind === 'character' && (
                    <IconButton
                      aria-label={`Микрофон ${actor.name}`}
                      className="player-roster__mic"
                      variant="ghost"
                      tone={voiceLive ? 'green' : voiceConnected ? 'blue' : 'neutral'}
                      size="xs"
                      disabled={!voiceConnected}
                      title={voiceConnected ? 'Заглушить микрофон игрока' : 'Игрок не подключен'}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onForceMutePlayer?.(actor);
                      }}
                    >
                      {voiceLive ? <Mic size={13} aria-hidden="true" /> : <MicOff size={13} aria-hidden="true" />}
                    </IconButton>
                  )}
                  {activationRequest && (
                    <IconButton
                      aria-label={`Дать активацию ${actor.name}`}
                      className="player-roster__activation"
                      variant="primary"
                      size="xs"
                      title="Дать активацию и убрать из очереди"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onClearActivationRequest?.(activationRequest);
                      }}
                    >
                      <Hand size={13} aria-hidden="true" />
                    </IconButton>
                  )}
                  {(actor.kind === 'environment' || actor.kind === 'adversary') && actor.isOnScene && (
                    <IconButton
                      aria-label={actor.hidden ? `Показать ${actor.name} игрокам` : `Скрыть ${actor.name} от игроков`}
                      variant="ghost"
                      tone={actor.hidden ? 'neutral' : 'gold'}
                      size="xs"
                      title={actor.hidden ? 'Показать игрокам' : 'Скрыть от игроков'}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSetActorHidden?.(actor, !actor.hidden, sceneId);
                      }}
                    >
                      {actor.hidden ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
                    </IconButton>
                  )}
                  {actor.isOnScene ? (
                    <IconButton
                      aria-label={`Убрать ${actor.name} со сцены`}
                      className="player-roster__remove"
                      variant="ghost"
                      tone="danger"
                      size="xs"
                      title="Убрать со сцены"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveActorFromScene?.(actor, sceneId);
                      }}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </IconButton>
                  ) : (
                    <IconButton
                      aria-label={`Добавить ${actor.name} на сцену`}
                      className="player-roster__add"
                      variant="secondary"
                      size="xs"
                      title="Добавить на сцену"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAddActorToScene(actor, sceneId);
                      }}
                    >
                      <MapPlus size={13} aria-hidden="true" />
                    </IconButton>
                  )}
                </>
              ) : undefined}
            />
            {hasResources && actor.hp && actor.stress && (
              <div className="player-roster__tracks" onClick={(event) => event.stopPropagation()}>
                {actor.kind === 'character' && actor.hope && (
                  <ResourcePips
                    label="Надежда"
                    current={actor.hope.value}
                    max={actor.hope.max}
                    tone="hope"
                    filledMeansMarked={false}
                    onChange={(next) => onSetResource?.(actor, 'hope', next)}
                  />
                )}
                <ResourcePips
                  label="Раны"
                  current={actor.hp.marked}
                  max={actor.hp.max}
                  tone="hp"
                  onChange={(next) => onSetResource?.(actor, 'hp', next)}
                />
                <ResourcePips
                  label="Стресс"
                  current={actor.stress.marked}
                  max={actor.stress.max}
                  tone="stress"
                  onChange={(next) => onSetResource?.(actor, 'stress', next)}
                />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
