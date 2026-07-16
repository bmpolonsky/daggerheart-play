/** @jsxImportSource preact */
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { BookOpenText, ScrollText, Swords, X } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import {
  buildCharacterSummary,
  buildPlayerViewModel,
  type PlayerViewCharacterSummary
} from '../../domain/tabletop/playerView';
import { buildCharacterFeaturePreviewFeedItem, buildDomainCardPreviewFeedItem, buildWealthEditorFeedItem, type TableFeedFeaturePreview } from '../../domain/tabletop/feed';
import { latestVisibleRollLogEntry } from '../../domain/tabletop/rollPublication';
import { readStoredPlayerSeatId, writeStoredPlayerSeatId } from '../../domain/p2p/sessionLinks';
import { nowIso } from '../../core/utils/date';
import { normalizeSceneBackgroundFraming, sceneBackgroundTransform } from '../../domain/tabletop/sceneBackground';
import { gameService, characterService, contentService, encounterService, feedService, p2pSessionService, rollLogService, sceneTableService } from '../../services/serviceRegistry';
import { CharacterBuilderModal } from '../characters/CharacterBuilderModal';
import { CharacterEditor } from '../characters/CharacterEditor';
import { PlayerTopBar, PlayerLeftRail, PlayerSeatPicker } from './playerView/PlayerChrome';
import { PlayerCharacterPanel } from './playerView/PlayerCharacterPanel';
import { PlayerScene } from './playerView/PlayerScene';
import { SharedToolsModal } from './playerView/SharedToolsModal';
import { SceneAudioRuntime } from './playerView/SceneAudioRuntime';
import { PlayerActionDock } from './playerView/PlayerActionDock';
import { PlayerConnectionStatus } from './playerView/PlayerConnectionStatus';
import { PlayerSessionRuntime } from './playerView/PlayerSessionRuntime';
import { SessionFocusControls } from './playerView/SessionFocusControls';
import { FloatingCallWidget } from '../call/FloatingCallWidget';
import { buildP2PHealthSummary } from '../p2p/P2PHealthIndicator';
import { useLiveSceneAssetUrls } from './playerView/useLiveSceneAssetUrls';
import {
  cssImageUrl,
  playerCharacterIdFromParticipants
} from './playerView/helpers';
import {
  buildRoutedPlayerViewLocation,
  defaultSharedToolsTab,
  parseRoutedPlayerViewState
} from './playerView/routedUiState';
import { playerViewUiActions } from './playerView/playerViewUiState';
import type { SceneMusicState } from '../../domain/audio/sceneAudio';
import type { Character, DaggerheartClass, DomainCardRecord, DomainName, EncounterEnvironment } from '../../domain/rules/types';
import type { PlayerViewDomainCard } from './playerView/domainCards/types';
import type { PlayerMobileLayer, PlayerViewedActor, SharedToolsTab, TableViewRole } from './playerView/types';
import { TabButton, Tabs } from '../components/common/Tabs';
import { Dialog } from '../components/common/Dialog';
import { IconButton } from '../components/common/IconButton';
import { SectionHeader } from '../components/common/SectionHeader';
import './playerView/player-view.css';

export function PlayerViewApp({ role: roleProp }: { role?: TableViewRole }) {
  const p2pSession = useStream(p2pSessionService.session$);
  const storedSession = p2pSessionService.storedSession();
  const role = roleProp ?? p2pSession.role ?? storedSession?.role ?? 'gm';
  const sessionRoomId = role === 'player' ? p2pSession.roomId || storedSession?.roomId || '' : '';
  const game = useStream(gameService.game$);
  const characters = useStream(characterService.characters$);
  const encounter = useStream(encounterService.encounter$);
  const content = useStream(contentService.content$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const rollLog = useStream(rollLogService.rollLog$);
  const feed = useStream(feedService.feed$);
  const liveScene = sceneTable.scenes[sceneTable.liveSceneId] ?? sceneTable.scenes[sceneTable.activeSceneId] ?? sceneTable.scenes[sceneTable.sceneOrder[0]];
  const [selectedPlayerSeatId, setSelectedPlayerSeatId] = useState(() => sessionRoomId ? readStoredPlayerSeatId(sessionRoomId) : null);
  const playerSeats = useMemo(() => Object.values(sceneTable.participants).filter((participant) => participant.role === 'player'), [sceneTable.participants]);
  const selectedPlayerSeat = playerSeats.find((seat) => seat.id === selectedPlayerSeatId) ?? null;
  const playerCharacterId = playerCharacterIdFromParticipants(sceneTable.participants, characters.entities, role === 'player' ? selectedPlayerSeatId : null);
  const [viewedActor, setViewedActor] = useState<PlayerViewedActor | null>(null);
  const [mobileLayer, setMobileLayer] = useState<PlayerMobileLayer>('scene');
  const [desktopLayout, setDesktopLayout] = useState(isDesktopLayout);
  const [activityOpen, setActivityOpen] = useState(defaultActivityPanelOpen);
  const [panelOpen, setPanelOpen] = useState(defaultDetailPanelOpen);
  const [routedUi, setRoutedUi] = useState(() => parseRoutedPlayerViewState(typeof window === 'undefined' ? '' : window.location.pathname, role));
  const [playerCharacterBuilderOpen, setPlayerCharacterBuilderOpen] = useState(false);
  const [playerCharacterEditorOpen, setPlayerCharacterEditorOpen] = useState(false);
  const assetUrls = useLiveSceneAssetUrls(liveScene, sceneTable.assets, role);
  const viewedCharacterId = viewedActor?.kind === 'character' ? viewedActor.actorId : null;
  const viewedAdversaryId = viewedActor?.kind === 'adversary' ? viewedActor.actorId : null;
  const viewedEnvironmentId = viewedActor?.kind === 'environment' ? viewedActor.actorId : null;
  const p2pHealth = useMemo(() => buildP2PHealthSummary(p2pSession), [p2pSession]);
  const mutationActor = useMemo(() => role === 'gm'
    ? { id: 'local-gm', name: game.gmName || 'Мастер', role: 'gm' as const }
    : {
      id: selectedPlayerSeat?.id || 'local-player',
      name: selectedPlayerSeat?.name || storedSession?.participantName || 'Игрок',
      role: 'player' as const
    }, [game.gmName, role, selectedPlayerSeat?.id, selectedPlayerSeat?.name, storedSession?.participantName]);

  useEffect(() => {
    characterService.setMutationActorProvider(() => mutationActor);
    return () => characterService.setMutationActorProvider(null);
  }, [mutationActor]);

  useEffect(() => {
    playerViewUiActions.reset();
    return () => playerViewUiActions.reset();
  }, [role, sessionRoomId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const desktopPanels = window.matchMedia('(min-width: 921px)');
    const handlePanelModeChange = (event: MediaQueryListEvent) => setDesktopLayout(event.matches);
    desktopPanels.addEventListener('change', handlePanelModeChange);
    return () => desktopPanels.removeEventListener('change', handlePanelModeChange);
  }, []);

  useEffect(() => {
    if (role !== 'player' || !sessionRoomId) return;
    const storedSeatId = readStoredPlayerSeatId(sessionRoomId);
    if (storedSeatId && storedSeatId !== selectedPlayerSeatId) {
      setSelectedPlayerSeatId(storedSeatId);
    }
  }, [role, selectedPlayerSeatId, sessionRoomId]);

  const model = useMemo(
    () => buildPlayerViewModel({
      game,
      characters,
      encounter,
      liveScene,
      assets: sceneTable.assets,
      assetUrls,
      rollLog,
      feed,
      playerCharacterId,
      role
    }),
    [assetUrls, game, characters, encounter, feed, liveScene, playerCharacterId, role, rollLog, sceneTable.assets]
  );
  const displayedCharacter = useMemo(() => {
    if (role === 'player') return model.character;
    const character = viewedCharacterId ? characters.entities[viewedCharacterId] : null;
    if (character) return buildCharacterSummary(character);
    return null;
  }, [characters.entities, model.character, role, viewedCharacterId]);
  const macroCharacters = useMemo(() => Object.fromEntries(
    Object.values(characters.entities)
      .map((character) => [character.id, buildCharacterSummary(character)])
  ), [characters.entities]);
  const displayedAdversary = role === 'gm' && viewedAdversaryId ? model.adversaries[viewedAdversaryId] ?? null : null;
  const displayedEnvironment = role === 'gm' && viewedEnvironmentId
    ? resolveEnvironmentDisplay(encounter.environments[viewedEnvironmentId] ?? null, content.environments)
    : null;
  const latestVisibleRoll = useMemo(
    () => latestVisibleRollLogEntry(rollLog, { role, actorId: playerCharacterId }),
    [playerCharacterId, role, rollLog]
  );
  const selectedPlayerName = selectedPlayerSeat?.name.trim() || undefined;
  const fallbackActorName = role === 'gm' ? 'Мастер' : 'Без персонажа';
  const displayedActor = displayedCharacter
    ? { id: displayedCharacter.id, name: displayedCharacter.name, kind: 'character' as const }
    : displayedAdversary
      ? { id: displayedAdversary.id, name: displayedAdversary.name, kind: 'adversary' as const }
      : displayedEnvironment
        ? { id: displayedEnvironment.id, name: displayedEnvironment.name, kind: 'environment' as const }
      : model.character
        ? { id: model.character.id, name: model.character.name, kind: 'character' as const }
        : null;
  const displayedActorName = displayedActor?.name ?? fallbackActorName;
  const activeCharacterActor = displayedCharacter
    ? { id: displayedCharacter.id, name: displayedCharacter.name }
    : model.character
      ? { id: model.character.id, name: model.character.name }
      : null;
  const activeCharacterName = activeCharacterActor?.name ?? fallbackActorName;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncRouteState = () => setRoutedUi(parseRoutedPlayerViewState(window.location.pathname, role));
    syncRouteState();
    window.addEventListener('popstate', syncRouteState);
    return () => window.removeEventListener('popstate', syncRouteState);
  }, [role]);

  useEffect(() => {
    if (!routedUi.libraryCollection || content.selectedCollection === routedUi.libraryCollection) return;
    contentService.setSelectedCollection(routedUi.libraryCollection);
  }, [content.selectedCollection, routedUi.libraryCollection]);

  const sceneBackgroundImage = model.scene.imageUrl
    ? `url("${cssImageUrl(model.scene.imageUrl)}")`
    : 'none';
  const sceneBackgroundFraming = normalizeSceneBackgroundFraming(model.scene.backgroundFraming);
  const openActor = useCallback((actor: PlayerViewedActor) => {
    if (role === 'player' && (actor.kind !== 'character' || actor.actorId !== playerCharacterId)) {
      return;
    }
    setViewedActor(actor);
    setPanelOpen(true);
    setMobileLayer('sheet');
  }, [playerCharacterId, role]);
  const completeDiceRoll = useCallback((rollId: string) => playerViewUiActions.completeDiceRoll(rollId), []);
  const selectPlayerSeat = useCallback((seatId: string) => {
    setSelectedPlayerSeatId(seatId);
    if (sessionRoomId) writeStoredPlayerSeatId(sessionRoomId, seatId);
  }, [sessionRoomId]);
  const commitRoutedUi = useCallback((next: { toolsOpen: boolean; toolsTab?: SharedToolsTab; libraryCollection?: typeof content.selectedCollection | null; settingsSection?: string | null }) => {
    if (typeof window === 'undefined') return;
    const navigation = buildRoutedPlayerViewLocation({
      hash: window.location.hash
    }, role, next);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (navigation.url !== currentUrl) {
      window.history.pushState({}, '', navigation.url);
    }
    setRoutedUi(parseRoutedPlayerViewState(navigation.pathname, role));
  }, [role]);
  const openTools = useCallback(() => {
    commitRoutedUi({ toolsOpen: true, toolsTab: routedUi.toolsTab || defaultSharedToolsTab(role) });
  }, [commitRoutedUi, role, routedUi.toolsTab]);
  const closeTools = useCallback(() => {
    commitRoutedUi({ toolsOpen: false });
  }, [commitRoutedUi]);
  const changeToolsTab = useCallback((tab: SharedToolsTab) => {
    commitRoutedUi({
      toolsOpen: true,
      toolsTab: tab,
      libraryCollection: tab === 'library' ? content.selectedCollection : null,
      settingsSection: tab === 'settings' ? routedUi.settingsSection : null
    });
  }, [commitRoutedUi, content.selectedCollection, routedUi.settingsSection]);
  const changeLibraryCollection = useCallback((collection: typeof content.selectedCollection) => {
    contentService.setSelectedCollection(collection);
    commitRoutedUi({ toolsOpen: true, toolsTab: 'library', libraryCollection: collection });
  }, [commitRoutedUi]);
  const changeSettingsSection = useCallback((section: string) => {
    commitRoutedUi({ toolsOpen: true, toolsTab: 'settings', settingsSection: section });
  }, [commitRoutedUi]);
  const createPlayerCharacterFromBuilder = useCallback((input: Partial<Character> & { className?: DaggerheartClass }) => {
    setPlayerCharacterBuilderOpen(false);
    if (role === 'player' && p2pSessionService.isConnectedPlayerSession()) {
      void p2pSessionService.submitPlayerCharacterCreate({
        draft: input,
        participantName: selectedPlayerName ?? input.playerName ?? input.name
      });
      return;
    }
    const character = characterService.createCharacter({
      ...input,
      playerName: selectedPlayerName ?? input.playerName ?? ''
    });
    if (role === 'player') {
      if (selectedPlayerSeatId) {
        sceneTableService.updatePlayerSeat(selectedPlayerSeatId, { characterId: character.id });
      } else {
        sceneTableService.assignLocalPlayerCharacter(character.id);
      }
    }
  }, [role, selectedPlayerName, selectedPlayerSeatId]);
  const previewDomainCard = useCallback((character: PlayerViewCharacterSummary, card: PlayerViewDomainCard) => {
    playerViewUiActions.setEphemeralFeedItem(buildDomainCardPreviewFeedItem({
      id: `ephemeral-card-${character.id}`,
      createdAt: nowIso(),
      authorName: character.name,
      card: toDomainCardRecord(card),
      actor: {
        actorId: character.id,
        actorName: character.name,
        actorType: 'character'
      }
    }));
    setActivityOpen(true);
    setMobileLayer('feed');
  }, []);
  const previewCharacterFeature = useCallback((character: PlayerViewCharacterSummary, feature: TableFeedFeaturePreview) => {
    playerViewUiActions.setEphemeralFeedItem(buildCharacterFeaturePreviewFeedItem({
      id: `ephemeral-feature-${character.id}-${feature.id}`,
      createdAt: nowIso(),
      authorName: character.name,
      feature: {
        id: feature.id,
        name: feature.name,
        subtitle: feature.subtitle,
        text: feature.text,
        sourceLabel: feature.sourceLabel
      },
      actor: {
        actorId: character.id,
        actorName: character.name,
        actorType: 'character'
      }
    }));
    setActivityOpen(true);
    setMobileLayer('feed');
  }, []);
  const editCharacterWealth = useCallback((character: PlayerViewCharacterSummary) => {
    playerViewUiActions.setEphemeralFeedItem(buildWealthEditorFeedItem({
      id: `ephemeral-wealth-${character.id}`,
      createdAt: nowIso(),
      authorName: character.name,
      characterId: character.id,
      actor: {
        actorId: character.id,
        actorName: character.name,
        actorType: 'character'
      }
    }));
    setActivityOpen(true);
    setMobileLayer('feed');
  }, []);
  const needsSeatSelection = role === 'player' && playerSeats.length > 0 && !selectedPlayerSeat;

  return (
    <main className={`player-view player-view--${role} player-view--mobile-${mobileLayer} ${activityOpen ? 'player-view--activity-open' : ''} ${panelOpen ? 'player-view--panel-open' : ''} ${!activityOpen && !panelOpen ? 'player-view--focus' : ''} ${model.handout ? 'dh-has-handout' : ''}`} data-vtt-root>
      <PlayerSessionRuntime
        displayedCharacter={displayedCharacter}
        gameGmName={game.gmName}
        playerCharacterId={playerCharacterId}
        role={role}
        selectedPlayerName={selectedPlayerName}
        selectedPlayerSeatId={selectedPlayerSeatId}
        sessionRoomId={sessionRoomId}
      />
      <div
        key={`${model.scene.id}:${model.scene.imageUrl}`}
        className="player-view__scene-image"
        aria-hidden="true"
        style={{
          backgroundImage: sceneBackgroundImage,
          backgroundSize: sceneBackgroundFraming.fit === 'fit' ? 'contain' : 'cover',
          backgroundPosition: 'center',
          transform: sceneBackgroundTransform(sceneBackgroundFraming)
        }}
      />
      <div className="player-view__scene-dim" aria-hidden="true" />
      <PlayerConnectionStatus
        hasCharacter={Boolean(model.character)}
        hasSelectedPlayerSeat={Boolean(selectedPlayerSeatId)}
        hasSessionRoom={Boolean(sessionRoomId)}
        role={role}
      />
      <SessionFocusControls
        activityOpen={activityOpen}
        connectionLabel={p2pHealth.label}
        connectionTone={p2pHealth.tone}
        panelOpen={panelOpen}
        role={role}
        onActivityToggle={() => setActivityOpen((current) => !current)}
        onPanelToggle={() => setPanelOpen((current) => !current)}
      />
      <PlayerTopBar model={model} role={role} />
      <Tabs className="player-mobile-layer-tabs" label="Слой интерфейса">
        <TabButton
          active={mobileLayer === 'feed'}
          aria-label={`Хроника. Соединение: ${p2pHealth.label}`}
          onClick={() => setMobileLayer('feed')}
        >
          <BookOpenText size={18} aria-hidden="true" />
          <span>Хроника</span>
          <span className={`player-connection-status-dot is-${p2pHealth.tone}`} aria-hidden="true" />
        </TabButton>
        <TabButton active={mobileLayer === 'scene'} onClick={() => setMobileLayer('scene')}>
          <Swords size={18} aria-hidden="true" />
          <span>Сцена</span>
        </TabButton>
        <TabButton active={mobileLayer === 'sheet'} onClick={() => setMobileLayer('sheet')}>
          <ScrollText size={18} aria-hidden="true" />
          <span>Лист</span>
        </TabButton>
      </Tabs>
      <PlayerLeftRail
        accessible={desktopLayout ? activityOpen : mobileLayer === 'feed'}
        macroCharacter={displayedCharacter ?? model.character}
        macroCharacters={macroCharacters}
        model={model}
        role={role}
      />
      <PlayerScene latestRoll={latestVisibleRoll} model={model} role={role} onOpenActor={openActor} onRollComplete={completeDiceRoll} />
      <SceneAudioRuntime music={resolveSceneMusicSource(model.scene.music, assetUrls)} role={role} />
      {needsSeatSelection && (
        <PlayerSeatPicker
          characters={characters}
          seats={playerSeats}
          onSelect={selectPlayerSeat}
        />
      )}
      <PlayerActionDock
        activeCharacterActor={activeCharacterActor}
        activeCharacterName={activeCharacterName}
        displayedActor={displayedActor}
        displayedActorName={displayedActorName}
        displayedCharacter={displayedCharacter}
        role={role}
        selectedPlayerName={selectedPlayerName}
        selectedPlayerSeatId={selectedPlayerSeatId}
        onOpenTools={openTools}
      />
      <FloatingCallWidget />
      <div
        className="player-character-panel-a11y-guard"
        aria-hidden={!(desktopLayout ? panelOpen : mobileLayer === 'sheet')}
        inert={!(desktopLayout ? panelOpen : mobileLayer === 'sheet')}
      >
        <PlayerCharacterPanel
          activeCharacterId={displayedCharacter?.id ?? null}
          activeAdversaryId={displayedAdversary?.id ?? null}
          adversary={displayedAdversary}
          environment={displayedEnvironment}
          character={displayedCharacter}
          emptyActionLabel={role === 'player' ? 'Создать персонажа' : undefined}
          emptyState={model.emptyCharacterState}
          role={role}
          sceneId={model.scene.id}
          sceneTable={sceneTable}
          onClearActivationRequest={(request) => void p2pSessionService.clearRaisedHand(request)}
          onClearActor={() => setViewedActor(null)}
          onDomainCardPreview={previewDomainCard}
          onFeaturePreview={previewCharacterFeature}
          onOpenChronicle={() => { setActivityOpen(true); setMobileLayer('feed'); }}
          onWealthEdit={editCharacterWealth}
          onEditCharacter={role === 'player' && model.character ? () => setPlayerCharacterEditorOpen(true) : undefined}
          onEmptyAction={role === 'player' ? () => setPlayerCharacterBuilderOpen(true) : undefined}
          onForceMutePlayer={(actor) => void p2pSessionService.forceMutePlayer({ actorId: actor.actorId, peerId: actor.presence?.peerId })}
          onOpenActor={openActor}
        />
      </div>
      {routedUi.toolsOpen && (
        <SharedToolsModal
          role={role}
          tab={routedUi.toolsTab}
          targetCharacterId={viewedCharacterId ?? model.character?.id ?? null}
          onClose={closeTools}
          onLibraryCollectionChange={changeLibraryCollection}
          onSettingsSectionChange={changeSettingsSection}
          onTabChange={changeToolsTab}
          routedSettingsSection={routedUi.settingsSection}
        />
      )}
      {playerCharacterBuilderOpen && role === 'player' && (
        <CharacterBuilderModal
          content={content.generic}
          classes={content.classes}
          equipment={content.equipment}
          onCancel={() => setPlayerCharacterBuilderOpen(false)}
          onCreate={createPlayerCharacterFromBuilder}
        />
      )}
      {playerCharacterEditorOpen && role === 'player' && playerCharacterId && characters.entities[playerCharacterId] && (
        <Dialog className="player-character-editor-dialog" aria-label="Редактор моего персонажа" onClose={() => setPlayerCharacterEditorOpen(false)}>
          <SectionHeader
            title={characters.entities[playerCharacterId].name}
            actions={(
              <IconButton variant="ghost" title="Закрыть" aria-label="Закрыть редактор персонажа" onClick={() => setPlayerCharacterEditorOpen(false)}>
                <X size={17} aria-hidden="true" />
              </IconButton>
            )}
          />
          <CharacterEditor
            character={characters.entities[playerCharacterId]}
            content={content}
            role="player"
            actor={mutationActor}
          />
        </Dialog>
      )}
    </main>
  );
}

function isDesktopLayout(): boolean {
  return typeof window === 'undefined' || window.matchMedia('(min-width: 921px)').matches;
}

function defaultActivityPanelOpen(): boolean {
  return typeof window === 'undefined' || window.matchMedia('(min-width: 1200px)').matches;
}

function defaultDetailPanelOpen(): boolean {
  return isDesktopLayout();
}

function toDomainCardRecord(card: PlayerViewDomainCard): DomainCardRecord {
  return {
    id: card.id,
    name: card.name,
    domain: card.domain as DomainName,
    level: card.level,
    cost: card.cost || undefined,
    recallCost: card.recallCost || undefined,
    text: card.text,
    inLoadout: true,
    permanentlyVaulted: card.permanentlyVaulted,
    loadoutChoicePending: card.loadoutChoicePending,
    imageUrl: card.imageUrl || null,
    tokens: card.tokens
  };
}

function resolveEnvironmentDisplay(
  environment: EncounterEnvironment | null,
  libraryEnvironments: Array<{ imageUrl: string | null; name: string; sourceId?: string | number; slug: string }>
): EncounterEnvironment | null {
  if (!environment || environment.imageUrl) return environment;
  const sourceId = environment.sourceId == null ? null : String(environment.sourceId);
  const libraryMatch = libraryEnvironments.find((item) => (
    (sourceId && item.sourceId != null && String(item.sourceId) === sourceId) ||
    (environment.sourceSlug && item.slug === environment.sourceSlug) ||
    item.name === environment.name
  ));
  return libraryMatch?.imageUrl ? { ...environment, imageUrl: libraryMatch.imageUrl } : environment;
}

function resolveSceneMusicSource(music: SceneMusicState, assetUrls: Record<string, string>): SceneMusicState {
  if (!music.assetId || music.sourceUrl) return music;
  const sourceUrl = assetUrls[music.assetId];
  return sourceUrl ? { ...music, sourceUrl } : music;
}
