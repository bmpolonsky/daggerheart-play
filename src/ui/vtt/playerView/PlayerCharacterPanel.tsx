/** @jsxImportSource preact */
import { useMemo } from "preact/hooks";
import { useStore } from "../../../core/hooks/useStore";
import { buildPlayerTokens, type PlayerViewAdversarySummary, type PlayerViewCharacterSummary, type PlayerViewEmptyCharacterState } from "../../../domain/tabletop/playerView";
import type { EncounterEnvironment, SceneTableState } from "../../../domain/rules/types";
import { characterService, contentService, encounterService, playerActivationQueueService, playerPresenceService } from "../../../services/serviceRegistry";
import { buildSessionRosterActors } from "./helpers";
import type { PlayerRosterActor, PlayerViewedActor, TableViewRole } from "./types";
import type { PlayerViewDomainCard } from "./domainCards/types";
import { GmRightPanel } from "./GmRightPanel";
import { PlayerRightPanel } from "./PlayerRightPanel";

export function PlayerCharacterPanel({
  activeAdversaryId,
  activeCharacterId,
  adversary,
  character,
  environment,
  emptyActionLabel,
  emptyState,
  role,
  sceneId,
  sceneTable,
  onClearActivationRequest,
  onClearActor,
  onDomainCardPreview,
  onEmptyAction,
  onForceMutePlayer,
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
  sceneId: string;
  sceneTable: SceneTableState;
  onClearActivationRequest?: (request: NonNullable<PlayerRosterActor["activationRequest"]>) => void;
  onClearActor: () => void;
  onDomainCardPreview?: (character: PlayerViewCharacterSummary, card: PlayerViewDomainCard) => void;
  onEmptyAction?: () => void;
  onForceMutePlayer?: (actor: PlayerRosterActor) => void;
  onOpenActor: (actor: PlayerViewedActor) => void;
}) {
  const characters = useStore(characterService.charactersStore);
  const { beastforms } = useStore(contentService.contentStore);
  const encounter = useStore(encounterService.encounterStore);
  const activationQueue = useStore(playerActivationQueueService.queueStore);
  const playerPresence = useStore(playerPresenceService.presenceStore);
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

  if (role === "gm") {
    return (
      <GmRightPanel
        activeAdversaryId={activeAdversaryId}
        activeCharacterId={activeCharacterId}
        adversary={adversary}
        environment={environment}
        actors={actors}
        beastforms={beastforms}
        character={character}
        sceneId={sceneId}
        sceneTable={sceneTable}
        onClearActivationRequest={onClearActivationRequest}
        onClearActor={onClearActor}
        onDomainCardPreview={onDomainCardPreview}
        onForceMutePlayer={onForceMutePlayer}
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
      onEmptyAction={onEmptyAction}
    />
  );
}
