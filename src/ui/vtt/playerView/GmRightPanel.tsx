/** @jsxImportSource preact */
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Users } from "lucide-react";
import { useStream } from "../../../core/hooks/useStream";
import type { LibraryBeastform } from "../../../domain/content/types";
import type { PlayerViewAdversarySummary, PlayerViewCharacterSummary } from "../../../domain/tabletop/playerView";
import type { TableFeedFeaturePreview } from "../../../domain/tabletop/feed";
import type { EncounterEnvironment, SceneTableState } from "../../../domain/rules/types";
import { characterService, encounterService, gameService, sceneTableService, tabletopService } from "../../../services/serviceRegistry";
import { PlayerRoster } from "./PlayerRoster";
import type { PlayerRosterActor, PlayerViewedActor } from "./types";
import { AdversarySheet } from "./AdversarySheet";
import { CharacterSheet } from "./CharacterSheet";
import { EnvironmentSheet } from "./EnvironmentSheet";
import type { PlayerViewDomainCard } from "./domainCards/types";
import { GmActionsPanel } from "./gmPanel/GmActionsPanel";
import { GmHandoutsPanel } from "./gmPanel/GmHandoutsPanel";
import { LiveSceneSwitcher } from "./gmPanel/LiveSceneSwitcher";
import { SceneMusicControls } from "./gmPanel/SceneMusicControls";
import { GmCombatTracker } from "./gmPanel/GmCombatTracker";
import { EmptyState } from "../../components/common/EmptyState";
import { TabButton, Tabs } from "../../components/common/Tabs";

type GmPanelView = 'cast' | 'scenes' | 'actions' | 'media';

export function GmRightPanel({
  activeAdversaryId,
  activeCharacterId,
  adversary,
  actors,
  beastforms,
  character,
  environment,
  sceneId,
  sceneTable,
  onClearActivationRequest,
  onClearActor,
  onDomainCardPreview,
  onFeaturePreview,
  onOpenChronicle,
  onForceMutePlayer,
  onWealthEdit,
  onOpenActor
}: {
  activeAdversaryId: string | null;
  activeCharacterId: string | null;
  adversary: PlayerViewAdversarySummary | null;
  actors: PlayerRosterActor[];
  beastforms?: LibraryBeastform[];
  character: PlayerViewCharacterSummary | null;
  environment: EncounterEnvironment | null;
  sceneId: string;
  sceneTable: SceneTableState;
  onClearActivationRequest?: (request: NonNullable<PlayerRosterActor['activationRequest']>) => void;
  onClearActor: () => void;
  onDomainCardPreview?: (character: PlayerViewCharacterSummary, card: PlayerViewDomainCard) => void;
  onFeaturePreview?: (character: PlayerViewCharacterSummary, feature: TableFeedFeaturePreview) => void;
  onOpenChronicle?: () => void;
  onForceMutePlayer?: (actor: PlayerRosterActor) => void;
  onWealthEdit?: (character: PlayerViewCharacterSummary) => void;
  onOpenActor: (actor: PlayerViewedActor) => void;
}) {
  const { handouts } = useStream(gameService.game$);
  const encounter = useStream(encounterService.encounter$);
  const [activeView, setActiveView] = useState<GmPanelView>('cast');
  if (adversary) {
    return <AdversarySheet adversary={adversary} onBack={onClearActor} />;
  }
  if (environment) {
    return <EnvironmentSheet environment={environment} onBack={onClearActor} />;
  }
  if (character) {
    return <CharacterSheet character={character} beastforms={beastforms} role="gm" showBackButton onBack={onClearActor} onDomainCardPreview={onDomainCardPreview} onFeaturePreview={onFeaturePreview} onWealthEdit={onWealthEdit} />;
  }

  const playerActors = actors.filter((actor) => actor.kind === 'character');
  const environmentActors = actors.filter((actor) => actor.kind === 'environment');
  const adversaryCount = encounter.order.filter((id) => Boolean(encounter.adversaries[id])).length;
  const rosterIsEmpty = playerActors.length === 0 && environmentActors.length === 0 && adversaryCount === 0;
  return (
    <aside className="player-character-panel player-character-panel--gm-overview" aria-label="Инструменты сцены" data-vtt-side-panel>
      <Tabs className="player-context-tabs" label="Контекст мастера" layout="equal">
        <TabButton active={activeView === 'cast'} onClick={() => setActiveView('cast')}>Участники</TabButton>
        <TabButton active={activeView === 'scenes'} onClick={() => setActiveView('scenes')}>Сцены</TabButton>
        <TabButton active={activeView === 'actions'} onClick={() => setActiveView('actions')}>Действия</TabButton>
        <TabButton active={activeView === 'media'} onClick={() => setActiveView('media')}>Материалы</TabButton>
      </Tabs>
      <div className="player-context-body">
        {activeView === 'cast' && (
          <section className="player-gm-overview__actors" aria-label="Участники">
            <div className="player-participant-feed">
              {playerActors.length > 0 && (
                <RosterGroup label="Игроки">
                  <PlayerRoster
                    actors={playerActors}
                    activeAdversaryId={activeAdversaryId}
                    activeCharacterId={activeCharacterId}
                    role="gm"
                    sceneId={sceneId}
                    onAddActorToScene={(actor, targetSceneId) => tabletopService.placeActorOnScene({ kind: actor.kind, id: actor.actorId }, targetSceneId)}
                    onRemoveActorFromScene={(actor, targetSceneId) => tabletopService.removeTokenFromScene(actor.tokenId, targetSceneId)}
                    onClearActivationRequest={onClearActivationRequest}
                    onForceMutePlayer={onForceMutePlayer}
                    onSetResource={(actor, resource, next) => {
                      if (resource === 'hope') {
                        characterService.setHope(actor.actorId, next);
                        return;
                      }
                      const current = actor[resource]?.marked ?? 0;
                      characterService.markSlots(actor.actorId, resource, next - current);
                    }}
                    onOpenActor={onOpenActor}
                  />
                </RosterGroup>
              )}
              {environmentActors.length > 0 && (
                <RosterGroup label="Окружение">
                  <PlayerRoster
                    actors={environmentActors}
                    activeAdversaryId={activeAdversaryId}
                    activeCharacterId={activeCharacterId}
                    role="gm"
                    sceneId={sceneId}
                    onAddActorToScene={(actor, targetSceneId) => tabletopService.placeActorOnScene(
                      { kind: actor.kind, id: actor.actorId },
                      targetSceneId,
                      { hidden: true, placement: 'random' }
                    )}
                    onRemoveActorFromScene={(actor, targetSceneId) => tabletopService.removeTokenFromScene(actor.tokenId, targetSceneId)}
                    onSetActorHidden={(actor, hidden, targetSceneId) => sceneTableService.setTokenHiddenInScene(targetSceneId, actor.tokenId, hidden)}
                    onOpenActor={onOpenActor}
                  />
                </RosterGroup>
              )}
              <GmCombatTracker activeAdversaryId={activeAdversaryId} sceneId={sceneId} onOpenActor={onOpenActor} />
              {rosterIsEmpty && (
                <EmptyState className="player-participant-feed__empty" tone="transparent" size="sm" icon={<Users size={18} />} title="Сцена пока пуста" body="Добавьте героя, противника или окружение." />
              )}
            </div>
          </section>
        )}
        {activeView === 'scenes' && <LiveSceneSwitcher sceneTable={sceneTable} />}
        {activeView === 'actions' && <GmActionsPanel onOpenChronicle={onOpenChronicle} />}
        {activeView === 'media' && (
          <div className="player-context-media">
            <GmHandoutsPanel handouts={handouts} onOpenChronicle={onOpenChronicle} />
            <SceneMusicControls sceneTable={sceneTable} />
          </div>
        )}
      </div>
    </aside>
  );
}

function RosterGroup({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <section className="player-participant-group" aria-label={label}>
      <header className="player-participant-group__header">
        <span>{label}</span>
      </header>
      {children}
    </section>
  );
}
