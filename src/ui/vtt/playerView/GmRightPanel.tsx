/** @jsxImportSource preact */
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ChevronDown, ChevronRight, Clapperboard, ExternalLink, Music2, NotebookText, PackageCheck, Pencil, Settings2, Swords, Users, Zap } from "lucide-react";
import { useStream } from "../../../core/hooks/useStream";
import type { LibraryBeastform } from "../../../domain/content/types";
import type { PlayerViewAdversarySummary, PlayerViewCharacterSummary } from "../../../domain/tabletop/playerView";
import type { TableFeedFeaturePreview } from "../../../domain/tabletop/feed";
import type { EncounterEnvironment, GameHandout, SceneTableState } from "../../../domain/rules/types";
import { isPreparedAdversary, isPreparedEnvironment } from "../../../domain/tabletop/preparedActors";
import { buildPreparedHandoutRows } from "../../../domain/rules/handouts";
import { encounterService, gameService, preparedActorService, sceneTableService, tabletopService } from "../../../services/serviceRegistry";
import { PlayerRoster } from "./PlayerRoster";
import type { ConnectedPlayerRow, PlayerRosterActor, PlayerViewedActor } from "./types";
import { AdversarySheet } from "./AdversarySheet";
import { CharacterSheet } from "./CharacterSheet";
import { EnvironmentSheet } from "./EnvironmentSheet";
import type { PlayerViewDomainCard } from "./domainCards/types";
import { GmActionsPanel } from "./gmPanel/GmActionsPanel";
import { LiveSceneSwitcher } from "./gmPanel/LiveSceneSwitcher";
import { SceneMusicControls } from "./gmPanel/SceneMusicControls";
import { Button, IconButton, TabButton, Tabs } from "../../components/common";
import type { SceneAddTarget } from './SceneAddMenu';
import { ConnectedPlayerList } from './ConnectedPlayerList';
import { PreparedActorsPanel } from './PreparedActorsPanel';
import { groupSceneRosterActors } from './helpers';
import { PreparedAdversaryEditor } from './PreparedAdversaryEditor';
import { PreparedEnvironmentEditor } from './PreparedEnvironmentEditor';

type GmPanelView = 'sheet' | 'cast' | 'prepared' | 'scenes' | 'actions' | 'media';

export function GmRightPanel({
  activeAdversaryId,
  activeCharacterId,
  adversary,
  actors,
  connectedPlayers,
  beastforms,
  character,
  environment,
  rosterRequestId = 0,
  sceneId,
  sceneTable,
  onClearActivationRequest,
  onDomainCardPreview,
  onFeaturePreview,
  onHandoutPreview,
  onOpenChronicle,
  onAddToScene,
  onCreateCharacter,
  onCreateHandout,
  onOpenPlayersSettings,
  onWealthEdit,
  onEditCharacter,
  onOpenTool,
  onOpenActor
}: {
  activeAdversaryId: string | null;
  activeCharacterId: string | null;
  adversary: PlayerViewAdversarySummary | null;
  actors: PlayerRosterActor[];
  connectedPlayers: ConnectedPlayerRow[];
  beastforms?: LibraryBeastform[];
  character: PlayerViewCharacterSummary | null;
  environment: EncounterEnvironment | null;
  rosterRequestId?: number;
  sceneId: string;
  sceneTable: SceneTableState;
  onClearActivationRequest?: (request: NonNullable<PlayerRosterActor['activationRequest']>) => void;
  onDomainCardPreview?: (character: PlayerViewCharacterSummary, card: PlayerViewDomainCard) => void;
  onFeaturePreview?: (character: PlayerViewCharacterSummary, feature: TableFeedFeaturePreview) => void;
  onHandoutPreview?: (handout: Pick<GameHandout, 'id' | 'title' | 'body' | 'imageUrl'>) => void;
  onOpenChronicle?: () => void;
  onAddToScene?: (target: SceneAddTarget) => void;
  onCreateCharacter?: () => void;
  onCreateHandout?: () => void;
  onOpenPlayersSettings?: () => void;
  onWealthEdit?: (character: PlayerViewCharacterSummary) => void;
  onEditCharacter?: () => void;
  onOpenTool: (tab: 'characters' | 'scenes' | 'combat' | 'handouts') => void;
  onOpenActor: (actor: PlayerViewedActor) => void;
}) {
  const [activeView, setActiveView] = useState<GmPanelView>(() => {
    if (typeof window === 'undefined') return 'cast';
    const stored = window.sessionStorage.getItem('daggerheart:gm-panel-view');
    return stored && ['sheet', 'cast', 'prepared', 'scenes', 'actions', 'media'].includes(stored)
      ? stored as GmPanelView
      : 'cast';
  });
  const [preparedQuery, setPreparedQuery] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [playersOpen, setPlayersOpen] = useState(() => typeof window === 'undefined' ? true : window.localStorage.getItem('daggerheart:gm-players-open') !== 'false');
  const game = useStream(gameService.game$);
  const preparedView = preparedActorService.buildView(preparedQuery);
  const preparedHandouts = buildPreparedHandoutRows(game.handouts, game.presentedHandoutId, preparedQuery);
  const selectedActorName = character?.name ?? adversary?.name ?? environment?.name ?? null;
  const selectedActorKey = character
    ? `character:${character.id}`
    : adversary
      ? `adversary:${adversary.id}`
      : environment
        ? `environment:${environment.id}`
        : null;
  const selectedAdversarySource = adversary ? encounterService.encounter$.get().adversaries[adversary.id] : null;
  const selectedAdversaryIsTemplate = Boolean(selectedAdversarySource && isPreparedAdversary(selectedAdversarySource, sceneTable));
  const selectedEnvironmentSource = environment ? encounterService.encounter$.get().environments[environment.id] : null;
  const selectedEnvironmentIsTemplate = Boolean(selectedEnvironmentSource && isPreparedEnvironment(selectedEnvironmentSource, sceneTable));
  const editingTemplate = editingTemplateId ? encounterService.encounter$.get().adversaries[editingTemplateId] ?? null : null;
  const editingEnvironment = editingEnvironmentId ? encounterService.encounter$.get().environments[editingEnvironmentId] ?? null : null;
  useEffect(() => {
    if (rosterRequestId > 0) {
      setActiveView('cast');
      setPlayersOpen(true);
    }
  }, [rosterRequestId]);
  useEffect(() => {
    if (connectedPlayers.some((player) => player.activationRequest)) setPlayersOpen(true);
  }, [connectedPlayers]);
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('daggerheart:gm-players-open', String(playersOpen));
  }, [playersOpen]);
  useEffect(() => {
    if (typeof window !== 'undefined') window.sessionStorage.setItem('daggerheart:gm-panel-view', activeView);
  }, [activeView]);
  useEffect(() => {
    if (selectedActorKey) setActiveView('sheet');
    else setActiveView((current) => current === 'sheet' ? 'cast' : current);
  }, [selectedActorKey]);

  const openActorSheet = (actor: PlayerViewedActor) => {
    setActiveView('sheet');
    onOpenActor(actor);
  };
  const canConfigure = (activeView === 'sheet' && (!environment || selectedEnvironmentIsTemplate)) || activeView === 'scenes';
  const configure = () => {
    if (activeView === 'scenes') onOpenTool('scenes');
    if (activeView === 'sheet') {
      if (character && onEditCharacter) onEditCharacter();
      else if (selectedAdversaryIsTemplate && adversary) setEditingTemplateId(adversary.id);
      else if (selectedEnvironmentIsTemplate && environment) setEditingEnvironmentId(environment.id);
      else if (adversary) onOpenTool('combat');
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
        <TabButton active={activeView === 'sheet'} disabled={!selectedActorKey} title={selectedActorName ? `Лист: ${selectedActorName}` : 'Лист не выбран'} aria-label={selectedActorName ? `Лист: ${selectedActorName}` : 'Лист не выбран'} onClick={() => setActiveView('sheet')}><NotebookText size={16} aria-hidden="true" /></TabButton>
        <TabButton active={activeView === 'cast'} title="Участники" aria-label="Участники" onClick={() => setActiveView('cast')}><Users size={16} aria-hidden="true" /></TabButton>
        <TabButton active={activeView === 'prepared'} title="Подготовлено" aria-label="Подготовлено" onClick={() => setActiveView('prepared')}><PackageCheck size={16} aria-hidden="true" /></TabButton>
        <TabButton active={activeView === 'scenes'} title="Сцены" aria-label="Сцены" onClick={() => setActiveView('scenes')}><Clapperboard size={16} aria-hidden="true" /></TabButton>
        <TabButton active={activeView === 'actions'} title="Действия" aria-label="Действия" onClick={() => setActiveView('actions')}><Zap size={16} aria-hidden="true" /></TabButton>
        <TabButton active={activeView === 'media'} title="Музыка" aria-label="Музыка" onClick={() => setActiveView('media')}><Music2 size={16} aria-hidden="true" /></TabButton>
      </Tabs>
      {configureButton}
    </div>
  );

  if (activeView === 'sheet' && adversary) {
    return <><AdversarySheet adversary={adversary} navigation={navigation} readOnly={selectedAdversaryIsTemplate} />{editingTemplate && <PreparedAdversaryEditor key={editingTemplate.id} adversary={editingTemplate} onClose={() => setEditingTemplateId(null)} />}</>;
  }
  if (activeView === 'sheet' && environment) {
    return <><EnvironmentSheet environment={environment} navigation={navigation} />{editingEnvironment && <PreparedEnvironmentEditor key={editingEnvironment.id} environment={editingEnvironment} onClose={() => setEditingEnvironmentId(null)} />}</>;
  }
  if (activeView === 'sheet' && character) {
    return <CharacterSheet character={character} beastforms={beastforms} role="gm" navigation={navigation} onDomainCardPreview={onDomainCardPreview} onFeaturePreview={onFeaturePreview} onWealthEdit={onWealthEdit} />;
  }

  const actorGroups = groupSceneRosterActors(actors);
  const rosterProps = {
    activeAdversaryId,
    activeCharacterId,
    role: 'gm' as const,
    sceneId,
    onAddActorToScene: () => undefined,
    onRemoveActorFromScene: (actor: PlayerRosterActor, targetSceneId: string) => {
      const token = sceneTable.scenes[targetSceneId]?.tokens.find((item) => item.id === actor.tokenId);
      if (token) preparedActorService.removeFromScene(token, targetSceneId);
    },
    onSetActorHidden: (actor: PlayerRosterActor, hidden: boolean, targetSceneId: string) => sceneTableService.setTokenHiddenInScene(targetSceneId, actor.tokenId, hidden),
    onSetResource: (actor: PlayerRosterActor, resource: 'hope' | 'hp' | 'stress', next: number) => tabletopService.setActorResource({ kind: actor.kind, id: actor.actorId }, resource, next),
    onOpenActor: openActorSheet
  };
  return (
    <div className="player-character-panel-shell">
      {navigation}
      <aside className="player-character-panel player-character-panel--gm-overview" aria-label="Инструменты сцены" data-vtt-side-panel>
        <div className={`player-context-body ${activeView === 'cast' ? 'player-context-body--cast' : ''}`}>
          {activeView === 'cast' && (
            <section className="player-gm-overview__actors" aria-label="Участники">
              <div className="player-participant-feed">
                <RosterGroup label="Игроки" actions={<><IconButton size="xs" variant="ghost" title={playersOpen ? 'Свернуть игроков' : 'Развернуть игроков'} aria-label={playersOpen ? 'Свернуть игроков' : 'Развернуть игроков'} onClick={() => setPlayersOpen((open) => !open)}>{playersOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}</IconButton><IconButton size="xs" variant="ghost" title="Настроить игроков" aria-label="Настроить игроков" onClick={onOpenPlayersSettings}><ExternalLink size={14} aria-hidden="true" /></IconButton></>}>
                  {playersOpen ? <ConnectedPlayerList players={connectedPlayers} focusRaisedRequestId={rosterRequestId} onClearActivationRequest={onClearActivationRequest} /> : null}
                </RosterGroup>
                <RosterGroup label="Герои" actions={<IconButton size="xs" variant="ghost" title="Открыть персонажей" aria-label="Открыть персонажей" onClick={() => onAddToScene?.('character')}><ExternalLink size={14} aria-hidden="true" /></IconButton>}>
                  {actorGroups.heroes.length ? <PlayerRoster {...rosterProps} actors={actorGroups.heroes} /> : <RosterEmpty text="На сцене нет героев." />}
                </RosterGroup>
                <RosterGroup label="Противники" actions={<><IconButton size="xs" variant="ghost" title="Справочник противников" aria-label="Справочник противников" onClick={() => onAddToScene?.('adversary')}><ExternalLink size={14} aria-hidden="true" /></IconButton><IconButton size="xs" variant="ghost" title="Конструктор боя" aria-label="Конструктор боя" onClick={() => onAddToScene?.('combat')}><Swords size={14} aria-hidden="true" /></IconButton></>}>
                  {actorGroups.adversaries.length ? <PlayerRoster {...rosterProps} actors={actorGroups.adversaries} /> : <RosterEmpty text="На сцене нет противников." />}
                </RosterGroup>
                <RosterGroup label="Окружение" actions={<IconButton size="xs" variant="ghost" title="Справочник окружений" aria-label="Справочник окружений" onClick={() => onAddToScene?.('environment')}><ExternalLink size={14} aria-hidden="true" /></IconButton>}>
                  {actorGroups.environments.length ? <PlayerRoster {...rosterProps} actors={actorGroups.environments} /> : <RosterEmpty text="Окружение не добавлено." />}
                </RosterGroup>
              </div>
            </section>
          )}
          {activeView === 'prepared' && <PreparedActorsPanel view={preparedView} handouts={preparedHandouts} query={preparedQuery} onQueryChange={setPreparedQuery} onOpenActor={openActorSheet} onEditAdversary={setEditingTemplateId} onEditEnvironment={setEditingEnvironmentId} onCreateHero={() => onCreateCharacter?.()} onCreateHandout={() => onCreateHandout?.()} onPreviewHandout={(handout) => onHandoutPreview?.(handout)} onOpenAdversaries={() => onAddToScene?.('adversary')} onOpenEnvironments={() => onAddToScene?.('environment')} />}
          {activeView === 'scenes' && <LiveSceneSwitcher sceneTable={sceneTable} />}
          {activeView === 'actions' && <GmActionsPanel onOpenChronicle={onOpenChronicle} />}
          {activeView === 'media' && (
            <div className="player-context-media">
              <SceneMusicControls sceneTable={sceneTable} />
            </div>
          )}
        </div>
      </aside>
      {editingTemplate && <PreparedAdversaryEditor key={editingTemplate.id} adversary={editingTemplate} onClose={() => setEditingTemplateId(null)} />}
      {editingEnvironment && <PreparedEnvironmentEditor key={editingEnvironment.id} environment={editingEnvironment} onClose={() => setEditingEnvironmentId(null)} />}
    </div>
  );
}

function RosterGroup({ label, actions, children }: { label: string; actions?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section className="player-participant-group" aria-label={label}>
      <header className="player-participant-group__header">
        <span>{label}</span>
        {actions && <div className="player-participant-group__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

function RosterEmpty({ text }: { text: string }) {
  return <p className="player-participant-group__empty">{text}</p>;
}
