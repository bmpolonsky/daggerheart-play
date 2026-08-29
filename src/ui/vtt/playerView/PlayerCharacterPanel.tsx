/** @jsxImportSource preact */
import { useMemo } from "preact/hooks";
import { useStream } from "../../../core/hooks/useStream";
import { buildPlayerTokens, type PlayerViewAdversarySummary, type PlayerViewCharacterSummary, type PlayerViewEmptyCharacterState } from "../../../domain/tabletop/playerView";
import type { TableFeedFeaturePreview } from "../../../domain/tabletop/feed";
import type { EncounterEnvironment, GameHandout, SceneTableState } from "../../../domain/rules/types";
import { characterService, contentService, encounterService, mediaCallService, playerActivationQueueService, playerPresenceService } from "../../../services/serviceRegistry";
import { buildConnectedPlayerRows, buildSessionRosterActors } from "./helpers";
import type { PlayerRosterActor, PlayerViewedActor, TableViewRole } from "./types";
import type { PlayerViewDomainCard } from "./domainCards/types";
import { GmRightPanel } from "./GmRightPanel";
import { PlayerRightPanel } from "./PlayerRightPanel";
import type { SceneAddTarget } from './SceneAddMenu';

export function PlayerCharacterPanel({
  activeAdversaryId,
  activeCharacterId,
  adversary,
  character,
  environment,
  emptyActionLabel,
  emptyState,
  role,
  rosterRequestId,
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
  onEmptyAction,
  onWealthEdit,
  onEditCharacter,
  onOpenTool,
  onOpenActor
}: {
  activeAdversaryId: string | null;
  activeCharacterId: string | null;
  adversary: PlayerViewAdversarySummary | null;
  character: PlayerViewCharacterSummary | null;
  environment: EncounterEnvironment | null;
  emptyActionLabel?: string;
  emptyState: PlayerViewEmptyCharacterState;
  role: TableViewRole;
  rosterRequestId?: number;
  sceneId: string;
  sceneTable: SceneTableState;
  onClearActivationRequest?: (request: NonNullable<PlayerRosterActor["activationRequest"]>) => void;
  onDomainCardPreview?: (character: PlayerViewCharacterSummary, card: PlayerViewDomainCard) => void;
  onFeaturePreview?: (character: PlayerViewCharacterSummary, feature: TableFeedFeaturePreview) => void;
  onHandoutPreview?: (handout: Pick<GameHandout, 'id' | 'title' | 'body' | 'imageUrl'>) => void;
  onOpenChronicle?: () => void;
  onAddToScene?: (target: SceneAddTarget) => void;
  onCreateCharacter?: () => void;
  onCreateHandout?: () => void;
  onOpenPlayersSettings?: () => void;
  onEmptyAction?: () => void;
  onWealthEdit?: (character: PlayerViewCharacterSummary) => void;
  onEditCharacter?: () => void;
  onOpenTool: (tab: 'characters' | 'scenes' | 'combat' | 'handouts') => void;
  onOpenActor: (actor: PlayerViewedActor) => void;
}) {
  const characters = useStream(characterService.characters$);
  const { beastforms } = useStream(contentService.content$);
  const encounter = useStream(encounterService.encounter$);
  const activationQueue = useStream(playerActivationQueueService.queue$);
  const playerPresence = useStream(playerPresenceService.presence$);
  const call = useStream(mediaCallService.call$);
  const scene = sceneTable.scenes[sceneId] ?? sceneTable.scenes[sceneTable.liveSceneId] ?? sceneTable.scenes[sceneTable.activeSceneId] ?? sceneTable.scenes[sceneTable.sceneOrder[0]];
  const tokens = useMemo(() => scene ? buildPlayerTokens(scene.tokens, characters.entities, encounter, role) : [], [characters.entities, encounter, role, scene, scene?.tokens]);
  const actors = useMemo(() => role === 'gm'
    ? buildSessionRosterActors({
      tokens,
      characters,
      adversaries: encounter.adversaries,
      environments: encounter.environments,
      role,
      activationQueue,
      presence: playerPresence
    })
    : [], [activationQueue, characters, encounter.adversaries, encounter.environments, playerPresence, role, tokens]);
  const connectedPlayers = useMemo(
    () => role === 'gm' ? buildConnectedPlayerRows(characters, playerPresence, call, activationQueue) : [],
    [activationQueue, call, characters, playerPresence, role]
  );

  if (role === "gm") {
    return (
      <GmRightPanel
        activeAdversaryId={activeAdversaryId}
        activeCharacterId={activeCharacterId}
        adversary={adversary}
        environment={environment}
        actors={actors}
        connectedPlayers={connectedPlayers}
        beastforms={beastforms}
        character={character}
        rosterRequestId={rosterRequestId}
        sceneId={sceneId}
        sceneTable={sceneTable}
        onClearActivationRequest={onClearActivationRequest}
        onDomainCardPreview={onDomainCardPreview}
        onFeaturePreview={onFeaturePreview}
        onHandoutPreview={onHandoutPreview}
        onOpenChronicle={onOpenChronicle}
        onAddToScene={onAddToScene}
        onCreateCharacter={onCreateCharacter}
        onCreateHandout={onCreateHandout}
        onOpenPlayersSettings={onOpenPlayersSettings}
        onWealthEdit={onWealthEdit}
        onEditCharacter={onEditCharacter}
        onOpenTool={onOpenTool}
        onOpenActor={onOpenActor}
      />
    );
  }
  return (
    <PlayerRightPanel
      character={character}
      beastforms={beastforms}
      emptyActionLabel={emptyActionLabel}
      emptyState={emptyState}
      onDomainCardPreview={onDomainCardPreview}
      onFeaturePreview={onFeaturePreview}
      onEmptyAction={onEmptyAction}
      onWealthEdit={onWealthEdit}
      onEditCharacter={onEditCharacter}
    />
  );
}
