/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { useStream } from "../../../core/hooks/useStream";
import type { LibraryBeastform } from "../../../domain/content/types";
import type { PlayerViewAdversarySummary, PlayerViewCharacterSummary } from "../../../domain/tabletop/playerView";
import type { TableFeedFeaturePreview } from "../../../domain/tabletop/feed";
import type { EncounterEnvironment, SceneTableState } from "../../../domain/rules/types";
import { gameService, tabletopService } from "../../../services/serviceRegistry";
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
import { TabButton, Tabs } from "../../components/common/Tabs";

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
  const [activeGmPanelTab, setActiveGmPanelTab] = useState<GmDockTab>('scenes');
  const [activeRosterTab, setActiveRosterTab] = useState<'players' | 'scene'>('players');
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
  const sceneActors = actors.filter((actor) => actor.kind === 'adversary' || actor.kind === 'environment');
  const visibleRosterActors = activeRosterTab === 'players' ? playerActors : sceneActors;
  return (
    <aside className="player-character-panel player-character-panel--gm-overview" aria-label="Инструменты сцены">
      <section className="player-gm-overview__actors" aria-label="Персонажи">
        <SectionTitle>Персонажи</SectionTitle>
        <Tabs className="player-roster-tabs" label="Типы участников">
          <TabButton active={activeRosterTab === 'players'} onClick={() => setActiveRosterTab('players')}>
            Игроки
          </TabButton>
          <TabButton active={activeRosterTab === 'scene'} onClick={() => setActiveRosterTab('scene')}>
            Сцена
          </TabButton>
        </Tabs>
        {visibleRosterActors.length > 0 ? (
          <PlayerRoster
            actors={visibleRosterActors}
            activeAdversaryId={activeAdversaryId}
            activeCharacterId={activeCharacterId}
            role="gm"
            sceneId={sceneId}
            onAddActorToScene={(actor, targetSceneId) => tabletopService.placeActorOnScene({ kind: actor.kind, id: actor.actorId }, targetSceneId)}
            onClearActivationRequest={onClearActivationRequest}
            onForceMutePlayer={onForceMutePlayer}
            onOpenActor={onOpenActor}
          />
        ) : (
          <p className="player-roster-empty">{activeRosterTab === 'players' ? 'Игроки еще не созданы.' : 'На сцене еще никого нет.'}</p>
        )}
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
