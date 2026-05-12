/** @jsxImportSource preact */
import type { PlayerViewAdversarySummary, PlayerViewCharacterSummary, PlayerViewEmptyCharacterState } from "../../../domain/tabletop/playerView";
import type { LibraryBeastform } from "../../../domain/content/types";
import type { SceneTableState } from "../../../domain/rules/types";
import type { PlayerRosterActor, PlayerViewedActor, TableViewRole } from "./types";
import type { PlayerViewDomainCard } from "./domainCards/types";
import { GmRightPanel } from "./GmRightPanel";
import { PlayerRightPanel } from "./PlayerRightPanel";

export function PlayerCharacterPanel({
  activeAdversaryId,
  activeCharacterId,
  adversary,
  actors,
  beastforms,
  character,
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
  actors: PlayerRosterActor[];
  beastforms?: LibraryBeastform[];
  character: PlayerViewCharacterSummary | null;
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
  if (role === "gm") {
    return (
      <GmRightPanel
        activeAdversaryId={activeAdversaryId}
        activeCharacterId={activeCharacterId}
        adversary={adversary}
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
