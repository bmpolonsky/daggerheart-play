/** @jsxImportSource preact */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MessageCircle, ScrollText, Swords } from 'lucide-react';
import { useStore } from '../../core/hooks/useStore';
import {
  buildCharacterSummary,
  buildPlayerViewModel,
  type PlayerViewCharacterSummary
} from '../../domain/tabletop/playerView';
import { buildDomainCardPreviewFeedItem, type TableFeedItem } from '../../domain/tabletop/feed';
import { latestVisibleRollLogEntry } from '../../domain/tabletop/rollPublication';
import { inferBasePathFromWorkspacePath, parsePlayerSessionLocation, readStoredPlayerSeatId, writeStoredPlayerSeatId } from '../../domain/p2p/sessionLinks';
import { nowIso } from '../../core/utils/date';
import { assetService, audioService, gameService, characterService, contentService, diceService, encounterService, feedService, p2pSessionService, playerActivationQueueService, playerPresenceService, rollLogService, sceneTableService } from '../../services/serviceRegistry';
import { MiniDiceLauncher } from './MiniDiceLauncher';
import { PlayerTopBar, PlayerLeftRail, PlayerSeatPicker } from './playerView/PlayerChrome';
import { PlayerCharacterPanel } from './playerView/PlayerCharacterPanel';
import { PlayerScene } from './playerView/PlayerScene';
import { SharedToolsModal } from './playerView/SharedToolsModal';
import { SceneAudioRuntime } from './playerView/SceneAudioRuntime';
import {
  buildSessionRosterActors,
  cssImageUrl,
  playerCharacterIdFromParticipants
} from './playerView/helpers';
import {
  defaultSharedToolsTab,
  parseRoutedPlayerViewState,
  updateRoutedPlayerViewSearch
} from './playerView/routedUiState';
import type { SceneMusicState } from '../../domain/audio/sceneAudio';
import type { DomainCardRecord, DomainName } from '../../domain/rules/types';
import type { P2PSessionState } from '../../services/P2PSessionService';
import type { PlayerViewDomainCard } from './playerView/domainCards/types';
import type { PlayerMobileLayer, PlayerViewedActor, SharedToolsTab, TableViewRole } from './playerView/types';
import './playerView/player-view.css';

export function PlayerViewApp({ role = 'player' }: { role?: TableViewRole }) {
  const game = useStore(gameService.gameStore);
  const characters = useStore(characterService.charactersStore);
  const encounter = useStore(encounterService.encounterStore);
  const sceneTable = useStore(sceneTableService.sceneTableStore);
  const rollLog = useStore(rollLogService.rollLogStore);
  const feed = useStore(feedService.feedStore);
  const content = useStore(contentService.contentStore);
  const audioState = useStore(audioService.audioStore);
  const p2pSession = useStore(p2pSessionService.sessionStore);
  const activationQueue = useStore(playerActivationQueueService.queueStore);
  const localActivation = useStore(playerActivationQueueService.localStore);
  const playerPresence = useStore(playerPresenceService.presenceStore);
  const liveScene = sceneTable.scenes[sceneTable.liveSceneId] ?? sceneTable.scenes[sceneTable.activeSceneId] ?? sceneTable.scenes[sceneTable.sceneOrder[0]];
  const sessionParams = typeof window === 'undefined' ? null : parsePlayerSessionLocation(window.location.pathname, inferBasePathFromWorkspacePath(window.location.pathname));
  const [selectedPlayerSeatId, setSelectedPlayerSeatId] = useState(() => sessionParams?.roomId ? readStoredPlayerSeatId(sessionParams.roomId) : null);
  const playerSeats = useMemo(() => Object.values(sceneTable.participants).filter((participant) => participant.role === 'player'), [sceneTable.participants]);
  const selectedPlayerSeat = playerSeats.find((seat) => seat.id === selectedPlayerSeatId) ?? null;
  const playerCharacterId = playerCharacterIdFromParticipants(sceneTable.participants, characters.entities, role === 'player' ? selectedPlayerSeatId : null);
  const [viewedActor, setViewedActor] = useState<PlayerViewedActor | null>(null);
  const [mobileLayer, setMobileLayer] = useState<PlayerMobileLayer>('scene');
  const [routedUi, setRoutedUi] = useState(() => parseRoutedPlayerViewState(typeof window === 'undefined' ? '' : window.location.search, role));
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [completedDiceRollIds, setCompletedDiceRollIds] = useState<Set<string>>(() => new Set());
  const [ephemeralActivity, setEphemeralActivity] = useState<TableFeedItem | null>(null);
  const autoP2PRestoreKey = useRef<string | null>(null);
  const pendingAssetRequests = useRef<Set<string>>(new Set());
  const viewedCharacterId = viewedActor?.kind === 'character' ? viewedActor.actorId : null;
  const viewedAdversaryId = viewedActor?.kind === 'adversary' ? viewedActor.actorId : null;

  const liveSceneAssetIds = useMemo(() => [
    liveScene?.backgroundAssetId,
    role === 'gm' ? liveScene?.music.assetId : undefined
  ].filter((assetId): assetId is string => Boolean(assetId)), [liveScene?.backgroundAssetId, liveScene?.music.assetId, role]);

  useEffect(() => {
    const missingAssetIds = liveSceneAssetIds.filter((assetId) => sceneTable.assets[assetId]?.storage === 'indexeddb' && !assetUrls[assetId]);
    if (missingAssetIds.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(missingAssetIds.map(async (assetId) => {
        const localUrl = await assetService.getObjectUrl(assetId);
        if (localUrl) {
          return [assetId, localUrl] as const;
        }
        if (role !== 'player' || !p2pSession.connected || pendingAssetRequests.current.has(assetId)) {
          return [assetId, null] as const;
        }
        pendingAssetRequests.current.add(assetId);
        try {
          const received = await p2pSessionService.requestAsset(assetId, 'scene-background');
          if (!received) {
            return [assetId, null] as const;
          }
          return [assetId, await assetService.getObjectUrl(assetId)] as const;
        } finally {
          pendingAssetRequests.current.delete(assetId);
        }
      }));
      if (cancelled) return;
      const loadedEntries = entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
      if (loadedEntries.length === 0) return;
      setAssetUrls((current) => ({
        ...current,
        ...Object.fromEntries(loadedEntries)
      }));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [assetUrls, liveSceneAssetIds, p2pSession.connected, role, sceneTable.assets]);

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
  const rosterActors = useMemo(() => role === 'gm'
    ? buildSessionRosterActors({
      tokens: model.tokens,
      characters,
      adversaries: encounter.adversaries,
      role,
      playerCharacterId,
      activationQueue,
      presence: playerPresence
    })
    : [], [activationQueue, characters, encounter.adversaries, model.tokens, playerCharacterId, playerPresence, role]);
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
    if (typeof window === 'undefined') {
      return;
    }

    if (role === 'gm') {
      if ((p2pSession.connected || p2pSession.status === 'connecting') && p2pSession.role === 'gm') {
        autoP2PRestoreKey.current = null;
        return;
      }
      const key = `gm:auto-open:${game.gmName}`;
      if (autoP2PRestoreKey.current === key) return;
      autoP2PRestoreKey.current = key;
      void p2pSessionService.ensureGmRoom(game.gmName).catch(() => {
        autoP2PRestoreKey.current = null;
      });
      return;
    }

    const sessionParams = parsePlayerSessionLocation(window.location.pathname, inferBasePathFromWorkspacePath(window.location.pathname));
    if (!sessionParams) {
      const key = `player:restore:${selectedPlayerName ?? 'anonymous'}`;
      if (autoP2PRestoreKey.current === key) return;
      autoP2PRestoreKey.current = key;
      void p2pSessionService.restoreActiveSession('player', selectedPlayerName).catch(() => undefined);
      return;
    }
    const session = p2pSessionService.sessionStore.getSnapshot();
    if (session.connected && session.role === 'player' && session.roomId === sessionParams.roomId) {
      return;
    }
    const key = `player:room:${sessionParams.roomId}:${sessionParams.password}`;
    if (autoP2PRestoreKey.current === key && session.status === 'connecting') return;
    autoP2PRestoreKey.current = key;
    void p2pSessionService.startPlayerRoom({
      roomId: sessionParams.roomId,
      password: sessionParams.password,
      participantId: selectedPlayerSeatId ?? undefined,
      actorIds: playerCharacterId ? [playerCharacterId] : [],
      participantName: selectedPlayerName
    }).catch(() => undefined);
  }, [game.gmName, p2pSession.connected, p2pSession.role, p2pSession.roomId, p2pSession.status, playerCharacterId, role, selectedPlayerName, selectedPlayerSeatId]);

  useEffect(() => {
    if (role !== 'player') {
      return;
    }
    p2pSessionService.setPlayerActorContext({
      participantId: selectedPlayerSeatId,
      actorId: displayedCharacter?.id,
      actorName: displayedCharacter?.name
    });
  }, [displayedCharacter?.id, displayedCharacter?.name, role, selectedPlayerSeatId]);

  useEffect(() => {
    if (role !== 'player' || !p2pSession.connected || !displayedCharacter?.id) {
      return;
    }
    const publish = () => {
      void p2pSessionService.publishPresence({
        requesterId: p2pSession.peerId ?? selectedPlayerSeatId ?? displayedCharacter.id,
        actorId: displayedCharacter.id,
        actorName: displayedCharacter.name,
        playerName: selectedPlayerName ?? '',
        connected: true,
        voiceMuted: audioState.voiceMuted,
        voiceLive: audioState.voiceStatus === 'live'
      });
    };
    publish();
    const intervalId = window.setInterval(publish, 3000);
    return () => window.clearInterval(intervalId);
  }, [audioState.voiceMuted, audioState.voiceStatus, displayedCharacter?.id, displayedCharacter?.name, p2pSession.connected, p2pSession.peerId, role, selectedPlayerName, selectedPlayerSeatId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncRouteState = () => setRoutedUi(parseRoutedPlayerViewState(window.location.search, role));
    syncRouteState();
    window.addEventListener('popstate', syncRouteState);
    return () => window.removeEventListener('popstate', syncRouteState);
  }, [role]);

  const sceneBackgroundImage = `linear-gradient(180deg, rgba(7, 9, 12, 0.06), rgba(7, 9, 12, 0.34)), url("${cssImageUrl(model.scene.imageUrl)}")`;
  const openActor = useCallback((actor: PlayerViewedActor) => {
    if (role === 'player' && (actor.kind !== 'character' || actor.actorId !== playerCharacterId)) {
      return;
    }
    setViewedActor(actor);
    setMobileLayer('sheet');
  }, [playerCharacterId, role]);
  const completeDiceRoll = useCallback((rollId: string) => {
    setCompletedDiceRollIds((current) => {
      if (current.has(rollId)) return current;
      const next = new Set(current);
      next.add(rollId);
      return next;
    });
  }, []);
  const selectPlayerSeat = useCallback((seatId: string) => {
    setSelectedPlayerSeatId(seatId);
    if (sessionParams?.roomId) writeStoredPlayerSeatId(sessionParams.roomId, seatId);
  }, [sessionParams?.roomId]);
  const returnToJoinLobby = useCallback(() => {
    if (typeof window === 'undefined' || !sessionParams?.roomId) return;
    const nextUrl = new URL(window.location.href);
    nextUrl.pathname = `${inferBasePathFromWorkspacePath(window.location.pathname)}/join/${encodeURIComponent(sessionParams.roomId)}`;
    nextUrl.search = '';
    nextUrl.hash = '';
    window.history.pushState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [sessionParams?.roomId]);
  const commitRoutedUi = useCallback((next: { toolsOpen: boolean; toolsTab?: SharedToolsTab }) => {
    if (typeof window === 'undefined') return;
    const nextSearch = updateRoutedPlayerViewSearch(window.location.search, role, next);
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.pushState({}, '', nextUrl);
    }
    setRoutedUi(parseRoutedPlayerViewState(nextSearch, role));
  }, [role]);
  const openTools = useCallback(() => {
    commitRoutedUi({ toolsOpen: true, toolsTab: routedUi.toolsTab || defaultSharedToolsTab(role) });
  }, [commitRoutedUi, role, routedUi.toolsTab]);
  const closeTools = useCallback(() => {
    commitRoutedUi({ toolsOpen: false });
  }, [commitRoutedUi]);
  const changeToolsTab = useCallback((tab: SharedToolsTab) => {
    commitRoutedUi({ toolsOpen: true, toolsTab: tab });
  }, [commitRoutedUi]);
  const toggleActivationRequest = useCallback(() => {
    if (role !== 'player' || !displayedCharacter?.id) return;
    const requesterId = p2pSession.peerId ?? selectedPlayerSeatId ?? displayedCharacter.id;
    if (localActivation.raised && localActivation.actorId === displayedCharacter.id) {
      void p2pSessionService.lowerHand({
        requesterId,
        actorId: displayedCharacter.id
      });
      return;
    }
    void p2pSessionService.raiseHand({
      requesterId,
      requesterName: selectedPlayerName ?? displayedCharacter.name,
      actorId: displayedCharacter.id,
      actorName: displayedCharacter.name
    });
  }, [displayedCharacter?.id, displayedCharacter?.name, localActivation.actorId, localActivation.raised, p2pSession.peerId, role, selectedPlayerName, selectedPlayerSeatId]);
  const previewDomainCard = useCallback((character: PlayerViewCharacterSummary, card: PlayerViewDomainCard) => {
    setEphemeralActivity(buildDomainCardPreviewFeedItem({
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
    setMobileLayer('feed');
  }, []);
  const needsSeatSelection = role === 'player' && playerSeats.length > 0 && !selectedPlayerSeat;
  const showConnectionOverlay = role === 'player' && Boolean(sessionParams?.roomId) && Boolean(model.character) && (
    !p2pSession.connected ||
    p2pSession.status === 'connecting' ||
    p2pSession.status === 'degraded' ||
    p2pSession.status === 'error' ||
    !p2pSession.lastSnapshotAt
  );
  const connectionDiagnostic = p2pConnectionDiagnosticText(p2pSession);

  return (
    <main className={`player-view player-view--${role} player-view--mobile-${mobileLayer} ${model.handout ? 'dh-has-handout' : ''}`}>
      <div
        key={`${model.scene.id}:${model.scene.imageUrl}`}
        className="player-view__scene-image"
        aria-hidden="true"
        style={{ backgroundImage: sceneBackgroundImage }}
      />
      <div className="player-view__backdrop" aria-hidden="true" />
      {showConnectionOverlay && (
        <section className="player-connection-overlay" role="status" aria-live="polite">
          <div className="player-connection-overlay__spinner" aria-hidden="true" />
          <strong>{p2pSession.status === 'error' ? 'Связь с сервером мастера потеряна' : 'Подключаемся к серверу мастера'}</strong>
          <span>{p2pSession.message}</span>
        </section>
      )}
      {connectionDiagnostic && (
        <div className="player-connection-diagnostic" role="status" aria-live="polite">
          {connectionDiagnostic}
        </div>
      )}
      <PlayerTopBar model={model} role={role} />
      <div className="player-mobile-layer-tabs" aria-label="Слой интерфейса">
        <button className={mobileLayer === 'feed' ? 'dh-is-active' : ''} type="button" onClick={() => setMobileLayer('feed')}>
          <MessageCircle size={18} aria-hidden="true" />
          <span>Чат</span>
        </button>
        <button className={mobileLayer === 'scene' ? 'dh-is-active' : ''} type="button" onClick={() => setMobileLayer('scene')}>
          <Swords size={18} aria-hidden="true" />
          <span>Сцена</span>
        </button>
        <button className={mobileLayer === 'sheet' ? 'dh-is-active' : ''} type="button" onClick={() => setMobileLayer('sheet')}>
          <ScrollText size={18} aria-hidden="true" />
          <span>Лист</span>
        </button>
      </div>
      <PlayerLeftRail
        completedDiceRollIds={completedDiceRollIds}
        ephemeralActivity={ephemeralActivity}
        macroCharacter={displayedCharacter ?? model.character}
        macroCharacters={macroCharacters}
        model={model}
        role={role}
        onClearEphemeralActivity={() => setEphemeralActivity(null)}
      />
      <PlayerScene latestRoll={latestVisibleRoll} model={model} role={role} onOpenActor={openActor} onRollComplete={completeDiceRoll} />
      {role === 'gm' && <SceneAudioRuntime music={resolveSceneMusicSource(model.scene.music, assetUrls)} />}
      {needsSeatSelection && (
        <PlayerSeatPicker
          characters={characters}
          seats={playerSeats}
          onSelect={selectPlayerSeat}
        />
      )}
      <MiniDiceLauncher
        actorName={displayedActorName}
        selectedActorKind={displayedActor?.kind ?? null}
        role={role}
        voiceState={audioState}
        activationRaised={Boolean(displayedCharacter?.id && localActivation.raised && localActivation.actorId === displayedCharacter.id)}
        canRequestActivation={Boolean(role === 'player' && p2pSession.connected && displayedCharacter?.id)}
        onOpenTools={openTools}
        onActivationToggle={toggleActivationRequest}
        onVoiceToggle={() => void audioService.toggleVoiceChat(role === 'player' ? selectedPlayerName : displayedActorName)}
        onRoll={(formula, label, publication, options) => {
          if (role === 'player' && p2pSessionService.isConnectedPlayerSession() && displayedActor?.id) {
            void p2pSessionService.submitPlayerRollIntent({
              actorId: displayedActor.id,
              actorName: displayedActorName,
              publication,
              intent: {
                type: 'manualDice',
                formula,
                label,
                advantageCount: options?.advantageCount,
                disadvantageCount: options?.disadvantageCount,
                diceTones: options?.diceTones
              }
            });
            return;
          }
          diceService.rollManualDice({
            formula,
            label,
            actorId: displayedActor?.id,
            actorName: displayedActorName,
            publication,
            advantageCount: options?.advantageCount,
            disadvantageCount: options?.disadvantageCount,
            diceTones: options?.diceTones
          });
        }}
        onDualityRoll={({ rollType, trait, options, publication }) => {
          if (role === 'player' && p2pSessionService.isConnectedPlayerSession() && activeCharacterActor?.id) {
            void p2pSessionService.submitPlayerRollIntent({
              actorId: activeCharacterActor.id,
              actorName: activeCharacterName,
              publication,
              intent: {
                type: 'duality',
                rollType,
                trait: trait ?? null,
                difficulty: 0,
                ...options
              }
            });
            return;
          }
          const rollRequest = {
            actorId: activeCharacterActor?.id,
            actorName: activeCharacterName,
            trait: trait ?? null,
            difficulty: 0,
            ...options,
            publication
          };
          if (rollType === 'reaction') {
            diceService.rollReaction(rollRequest);
          } else {
            diceService.rollAction({
              ...rollRequest,
              applyConsequences: gameService.gameStore.getSnapshot().autoApplyRollConsequences
            });
          }
        }}
      />
      <PlayerCharacterPanel
        activeCharacterId={displayedCharacter?.id ?? null}
        activeAdversaryId={displayedAdversary?.id ?? null}
        adversary={displayedAdversary}
        actors={rosterActors}
        character={displayedCharacter}
        beastforms={content.beastforms}
        emptyActionLabel={role === 'player' && sessionParams?.roomId ? 'Вернуться в лобби' : undefined}
        emptyState={model.emptyCharacterState}
        role={role}
        sceneId={model.scene.id}
        sceneTable={sceneTable}
        onClearActivationRequest={(request) => void p2pSessionService.clearRaisedHand(request)}
        onClearActor={() => setViewedActor(null)}
        onDomainCardPreview={previewDomainCard}
        onEmptyAction={role === 'player' && sessionParams?.roomId ? returnToJoinLobby : undefined}
        onForceMutePlayer={(actor) => void p2pSessionService.forceMutePlayer({ actorId: actor.actorId, peerId: actor.presence?.peerId })}
        onOpenActor={openActor}
      />
      {routedUi.toolsOpen && (
        <SharedToolsModal
          game={game}
          characters={characters}
          encounter={encounter}
          role={role}
          sceneTable={sceneTable}
          tab={routedUi.toolsTab}
          targetCharacterId={viewedCharacterId ?? model.character?.id ?? null}
          onClose={closeTools}
          onTabChange={changeToolsTab}
        />
      )}
    </main>
  );
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
    imageUrl: card.imageUrl || null,
    tokens: card.tokens
  };
}

function p2pConnectionDiagnosticText(session: P2PSessionState): string {
  if (!session.role || session.status === 'disconnected') {
    return '';
  }
  if (session.status === 'error') {
    return `P2P: ошибка - ${session.message}`;
  }
  if (session.status === 'connecting') {
    return `P2P: подключаемся - комната ${session.roomId || '...'}`;
  }
  if (session.role === 'player') {
    if (!session.lastSnapshotAt) {
      return 'P2P: запрашиваем данные игры - повтор каждые 5 с';
    }
    if (session.status === 'degraded' || session.peers.length === 0) {
      return 'P2P: переподключаемся к мастеру - повтор каждые 5 с';
    }
    return '';
  }
  if (session.status === 'degraded') {
    return 'P2P: игроки отключились - ждем повторное подключение';
  }
  if (session.peers.length === 0) {
    return `P2P: ждем игроков - комната ${session.roomId}`;
  }
  return '';
}

function resolveSceneMusicSource(music: SceneMusicState, assetUrls: Record<string, string>): SceneMusicState {
  if (!music.assetId || music.sourceUrl) return music;
  const sourceUrl = assetUrls[music.assetId];
  return sourceUrl ? { ...music, sourceUrl } : music;
}
