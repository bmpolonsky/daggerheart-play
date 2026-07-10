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
import { RosterGmDock } from "./gmPanel/RosterGmDock";
import { SceneMusicControls } from "./gmPanel/SceneMusicControls";
import { SectionTitle } from "./gmPanel/SectionTitle";
import type { GmDockTab } from "./gmPanel/types";
import { GmCombatTracker } from "./gmPanel/GmCombatTracker";
import { EmptyState } from "../../components/common/EmptyState";

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
  onForceMutePlayer?: (actor: PlayerRosterActor) => void;
  onWealthEdit?: (character: PlayerViewCharacterSummary) => void;
  onOpenActor: (actor: PlayerViewedActor) => void;
}) {
  const { handouts } = useStream(gameService.game$);
  const encounter = useStream(encounterService.encounter$);
  const [activeGmPanelTab, setActiveGmPanelTab] = useState<GmDockTab>('scenes');
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
      <section className="player-gm-overview__actors" aria-label="Участники">
        <SectionTitle>Участники</SectionTitle>
        <div className="player-participant-feed">
          {playerActors.length > 0 && (
            <RosterGroup label="Игроки" count={playerActors.length}>
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
            <RosterGroup label="Окружение" count={environmentActors.length}>
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
          <GmCombatTracker
            activeAdversaryId={activeAdversaryId}
            sceneId={sceneId}
            onOpenActor={onOpenActor}
          />
          {rosterIsEmpty && (
            <EmptyState
              className="player-participant-feed__empty"
              tone="subtle"
              size="sm"
              icon={<Users size={18} />}
              title="Участников пока нет"
              body="Добавьте персонажей, окружение или противников."
            />
          )}
        </div>
      </section>
      <RosterGmDock
        activeTab={activeGmPanelTab}
        handouts={handouts}
        sceneTable={sceneTable}
        onTabChange={setActiveGmPanelTab}
      />
      <SceneMusicControls sceneTable={sceneTable} />
    </aside>
  );
}

function RosterGroup({ label, count, children }: { label: string; count: number; children: ComponentChildren }) {
  return (
    <section className="player-participant-group" aria-label={label}>
      <header className="player-participant-group__header">
        <span>{label}</span>
        <strong>{count}</strong>
      </header>
      {children}
    </section>
  );
}
