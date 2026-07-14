/** @jsxImportSource preact */
import { Eye, EyeOff, PanelRightOpen, Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'preact/hooks';
import { useStream } from '../../../../core/hooks/useStream';
import { encounterService, sceneTableService, tabletopService } from '../../../../services/serviceRegistry';
import { IconButton, ResourcePips } from '../../../components/common';
import type { PlayerViewedActor } from '../types';
import { buildCombatTrackerEntries } from './combatTrackerModel';

export function GmCombatTracker({
  activeAdversaryId,
  sceneId,
  onOpenActor
}: {
  activeAdversaryId: string | null;
  sceneId: string;
  onOpenActor: (actor: PlayerViewedActor) => void;
}) {
  const encounter = useStream(encounterService.encounter$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const scene = sceneTable.scenes[sceneId] ?? sceneTable.scenes[sceneTable.liveSceneId] ?? sceneTable.scenes[sceneTable.activeSceneId] ?? null;
  const targetSceneId = scene?.id ?? null;
  const entries = useMemo(() => buildCombatTrackerEntries(encounter, scene), [encounter, scene]);

  if (entries.length === 0) return null;

  return (
    <section className="player-participant-group" aria-label="Противники">
      <header className="player-participant-group__header">
        <span>Противники</span>
      </header>
      <div className="player-combat-tracker" aria-label="Трекер боя">
        {entries.map((entry) => (
          <article
            className={`player-combat-tracker__entry ${entry.adversary.id === activeAdversaryId ? 'dh-is-selected' : ''}`}
            key={entry.adversary.id}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button, .player-combat-tracker__tracks')) return;
              onOpenActor({ kind: 'adversary', actorId: entry.adversary.id });
            }}
          >
            <header className="player-combat-tracker__entry-header">
              <strong className="player-combat-tracker__entry-name">{entry.adversary.name}</strong>
              <span className="player-combat-tracker__entry-actions">
                <IconButton
                  variant="ghost"
                  size="xs"
                  aria-label={`Открыть лист ${entry.adversary.name}`}
                  title="Открыть лист"
                  onClick={() => onOpenActor({ kind: 'adversary', actorId: entry.adversary.id })}
                >
                  <PanelRightOpen size={14} aria-hidden="true" />
                </IconButton>
                {entry.tokenId ? (
                  <>
                    <IconButton
                      variant="ghost"
                      size="xs"
                      tone={entry.hidden ? 'neutral' : 'gold'}
                      aria-label={entry.hidden ? `Показать ${entry.adversary.name} игрокам` : `Скрыть ${entry.adversary.name} от игроков`}
                      title={entry.hidden ? 'Показать игрокам' : 'Скрыть от игроков'}
                      onClick={() => {
                        if (!targetSceneId) return;
                        sceneTableService.setTokenHiddenInScene(targetSceneId, entry.tokenId!, !entry.hidden);
                      }}
                    >
                      {entry.hidden
                        ? <EyeOff size={13} aria-hidden="true" />
                        : <Eye size={13} aria-hidden="true" />}
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      size="xs"
                      tone="danger"
                      aria-label={`Убрать ${entry.adversary.name} со сцены`}
                      title="Убрать со сцены"
                      onClick={() => {
                        if (!targetSceneId) return;
                        tabletopService.removeTokenFromScene(entry.tokenId!, targetSceneId);
                      }}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </IconButton>
                  </>
                ) : (
                  <IconButton
                    variant="ghost"
                    size="xs"
                    tone="gold"
                    disabled={!targetSceneId}
                    aria-label={`Добавить ${entry.adversary.name} на сцену скрытым`}
                    title="Добавить скрытым на сцену"
                    onClick={() => {
                      if (!targetSceneId) return;
                      tabletopService.placeActorOnScene(
                        { kind: 'adversary', id: entry.adversary.id },
                        targetSceneId,
                        { hidden: true, placement: 'random' }
                      );
                    }}
                  >
                    <Plus size={13} aria-hidden="true" />
                  </IconButton>
                )}
              </span>
            </header>
            <div className="player-combat-tracker__tracks" onClick={(event) => event.stopPropagation()}>
              <ResourcePips
                label="Раны"
                current={entry.adversary.hp.marked}
                max={entry.adversary.hp.max}
                tone="hp"
                onChange={(next) => encounterService.updateAdversarySlots(entry.adversary.id, 'hp', { marked: next })}
              />
              <ResourcePips
                label="Стресс"
                current={entry.adversary.stress.marked}
                max={entry.adversary.stress.max}
                tone="stress"
                onChange={(next) => encounterService.updateAdversarySlots(entry.adversary.id, 'stress', { marked: next })}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
