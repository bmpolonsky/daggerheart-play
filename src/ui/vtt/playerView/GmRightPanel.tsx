/** @jsxImportSource preact */
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { FileStack, Images, Pencil, ScrollText, Settings2, Sparkles, Swords, Users } from "lucide-react";
import { useStream } from "../../../core/hooks/useStream";
import type { LibraryBeastform } from "../../../domain/content/types";
import type { PlayerViewAdversarySummary, PlayerViewCharacterSummary } from "../../../domain/tabletop/playerView";
import type { TableFeedFeaturePreview } from "../../../domain/tabletop/feed";
import type { EncounterEnvironment, SceneTableState } from "../../../domain/rules/types";
import { characterService, gameService, sceneTableService, tabletopService } from "../../../services/serviceRegistry";
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
import { Button, EmptyState, TabButton, Tabs } from "../../components/common";
import { SceneAddMenu, type SceneAddTarget } from './SceneAddMenu';

type GmPanelView = 'cast' | 'sheet' | 'scenes' | 'combat' | 'actions' | 'media';

export function GmRightPanel({
  activeAdversaryId,
  activeCharacterId,
  adversary,
  actors,
  beastforms,
  character,
  environment,
  rosterRequestId = 0,
  sceneId,
  sceneTable,
  onClearActivationRequest,
  onDomainCardPreview,
  onFeaturePreview,
  onOpenChronicle,
  onAddToScene,
  onForceMutePlayer,
  onWealthEdit,
  onEditCharacter,
  onOpenTool,
  onOpenActor
}: {
  activeAdversaryId: string | null;
  activeCharacterId: string | null;
  adversary: PlayerViewAdversarySummary | null;
  actors: PlayerRosterActor[];
  beastforms?: LibraryBeastform[];
  character: PlayerViewCharacterSummary | null;
  environment: EncounterEnvironment | null;
  rosterRequestId?: number;
  sceneId: string;
  sceneTable: SceneTableState;
  onClearActivationRequest?: (request: NonNullable<PlayerRosterActor['activationRequest']>) => void;
  onDomainCardPreview?: (character: PlayerViewCharacterSummary, card: PlayerViewDomainCard) => void;
  onFeaturePreview?: (character: PlayerViewCharacterSummary, feature: TableFeedFeaturePreview) => void;
  onOpenChronicle?: () => void;
  onAddToScene?: (target: SceneAddTarget) => void;
  onForceMutePlayer?: (actor: PlayerRosterActor) => void;
  onWealthEdit?: (character: PlayerViewCharacterSummary) => void;
  onEditCharacter?: () => void;
  onOpenTool: (tab: 'characters' | 'scenes' | 'combat' | 'handouts') => void;
  onOpenActor: (actor: PlayerViewedActor) => void;
}) {
  const { handouts } = useStream(gameService.game$);
  const [activeView, setActiveView] = useState<GmPanelView>('cast');
  const selectedActorName = character?.name ?? adversary?.name ?? environment?.name ?? null;
  const selectedActorKey = character
    ? `character:${character.id}`
    : adversary
      ? `adversary:${adversary.id}`
      : environment
        ? `environment:${environment.id}`
        : null;
  useEffect(() => {
    if (rosterRequestId > 0) setActiveView('cast');
  }, [rosterRequestId]);
  useEffect(() => {
    if (selectedActorKey) setActiveView('sheet');
    else setActiveView((current) => current === 'sheet' ? 'cast' : current);
  }, [selectedActorKey]);

  const openActorSheet = (actor: PlayerViewedActor) => {
    setActiveView('sheet');
    onOpenActor(actor);
  };
  const canConfigure = activeView !== 'actions';
  const configure = () => {
    if (activeView === 'cast') onOpenTool('characters');
    if (activeView === 'scenes') onOpenTool('scenes');
    if (activeView === 'combat') onOpenTool('combat');
    if (activeView === 'media') onOpenTool('handouts');
    if (activeView === 'sheet') {
      if (character && onEditCharacter) onEditCharacter();
      else onOpenTool('combat');
    }
  };
  const configureButton = canConfigure ? (
    <Button
      variant="secondary"
      size="xs"
      noWrap
      iconBefore={activeView === 'sheet' ? <Pencil size={13} aria-hidden="true" /> : <Settings2 size={13} aria-hidden="true" />}
      onClick={configure}
    >
      {activeView === 'sheet' ? 'Редактировать' : 'Настроить'}
    </Button>
  ) : null;
  const navigation = (
    <div className="player-context-navigation">
      <Tabs align="start" className="player-left-rail-tabs player-context-tabs" label="Контекст мастера">
        <TabButton active={activeView === 'cast'} title="Участники" aria-label="Участники" onClick={() => setActiveView('cast')}><Users size={16} aria-hidden="true" /></TabButton>
        <TabButton active={activeView === 'sheet'} disabled={!selectedActorKey} title={selectedActorName ? `Лист: ${selectedActorName}` : 'Лист не выбран'} aria-label={selectedActorName ? `Лист: ${selectedActorName}` : 'Лист не выбран'} onClick={() => setActiveView('sheet')}><ScrollText size={16} aria-hidden="true" /></TabButton>
        <TabButton active={activeView === 'scenes'} title="Сцены" aria-label="Сцены" onClick={() => setActiveView('scenes')}><Images size={16} aria-hidden="true" /></TabButton>
        <TabButton active={activeView === 'combat'} title="Бой" aria-label="Бой" onClick={() => setActiveView('combat')}><Swords size={16} aria-hidden="true" /></TabButton>
        <TabButton active={activeView === 'actions'} title="Действия" aria-label="Действия" onClick={() => setActiveView('actions')}><Sparkles size={16} aria-hidden="true" /></TabButton>
        <TabButton active={activeView === 'media'} title="Материалы" aria-label="Материалы" onClick={() => setActiveView('media')}><FileStack size={16} aria-hidden="true" /></TabButton>
      </Tabs>
      {configureButton}
    </div>
  );

  if (activeView === 'sheet' && adversary) {
    return <AdversarySheet adversary={adversary} navigation={navigation} />;
  }
  if (activeView === 'sheet' && environment) {
    return <EnvironmentSheet environment={environment} navigation={navigation} />;
  }
  if (activeView === 'sheet' && character) {
    return <CharacterSheet character={character} beastforms={beastforms} role="gm" navigation={navigation} onDomainCardPreview={onDomainCardPreview} onFeaturePreview={onFeaturePreview} onWealthEdit={onWealthEdit} />;
  }

  const playerActors = actors.filter((actor) => actor.kind === 'character' || actor.kind === 'companion');
  const environmentActors = actors.filter((actor) => actor.kind === 'environment');
  const rosterIsEmpty = playerActors.length === 0 && environmentActors.length === 0;
  return (
    <div className="player-character-panel-shell">
      {navigation}
      <aside className="player-character-panel player-character-panel--gm-overview" aria-label="Инструменты сцены" data-vtt-side-panel>
        <div className={`player-context-body ${activeView === 'cast' ? 'player-context-body--cast' : ''}`}>
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
                      if (actor.kind === 'companion') {
                        const current = actor.stress?.marked ?? 0;
                        characterService.markCompanionStress(actor.actorId, next - current);
                        return;
                      }
                      if (resource === 'hope') {
                        characterService.setHope(actor.actorId, next);
                        return;
                      }
                      const current = actor[resource]?.marked ?? 0;
                      characterService.markSlots(actor.actorId, resource, next - current);
                    }}
                    onOpenActor={openActorSheet}
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
                    onOpenActor={openActorSheet}
                    />
                  </RosterGroup>
                )}
                {rosterIsEmpty && (
                  <EmptyState className="player-participant-feed__empty" tone="transparent" size="sm" icon={<Users size={18} />} title="Сцена пока пуста" body="Добавьте героя, противника или окружение." />
                )}
              </div>
              <div className="player-gm-overview__add-bar">
                {onAddToScene && (
                  <SceneAddMenu className="player-gm-overview__add-menu" onSelect={onAddToScene} />
                )}
              </div>
            </section>
          )}
          {activeView === 'scenes' && <LiveSceneSwitcher sceneTable={sceneTable} />}
          <section className="player-gm-combat-panel" aria-label="Бой" hidden={activeView !== 'combat'}>
            <GmCombatTracker
              activeAdversaryId={activeAdversaryId}
              emptyState={<EmptyState tone="transparent" size="sm" icon={<Swords size={18} />} title="Бой не подготовлен" />}
              sceneId={sceneId}
              onOpenActor={openActorSheet}
            />
          </section>
          {activeView === 'actions' && <GmActionsPanel onOpenChronicle={onOpenChronicle} />}
          {activeView === 'media' && (
            <div className="player-context-media">
              <GmHandoutsPanel handouts={handouts} onOpenChronicle={onOpenChronicle} />
              <SceneMusicControls sceneTable={sceneTable} />
            </div>
          )}
        </div>
      </aside>
    </div>
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
