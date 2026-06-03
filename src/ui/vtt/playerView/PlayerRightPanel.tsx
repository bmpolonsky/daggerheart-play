/** @jsxImportSource preact */
import { LayoutDashboard, UserRound } from "lucide-react";
import type { LibraryBeastform } from "../../../domain/content/types";
import type { PlayerViewCharacterSummary, PlayerViewEmptyCharacterState } from "../../../domain/tabletop/playerView";
import type { TableFeedFeaturePreview } from "../../../domain/tabletop/feed";
import { inferBasePathFromWorkspacePath } from "../../../domain/p2p/sessionLinks";
import { CharacterSheet } from "./CharacterSheet";
import type { PlayerViewDomainCard } from "./domainCards/types";
import { Button } from "../../components/common/Button";

export function PlayerRightPanel({
  character,
  beastforms,
  emptyActionLabel,
  emptyState,
  onEmptyAction,
  onDomainCardPreview,
  onFeaturePreview,
  onWealthEdit
}: {
  character: PlayerViewCharacterSummary | null;
  beastforms?: LibraryBeastform[];
  emptyActionLabel?: string;
  emptyState: PlayerViewEmptyCharacterState;
  onEmptyAction?: () => void;
  onDomainCardPreview?: (character: PlayerViewCharacterSummary, card: PlayerViewDomainCard) => void;
  onFeaturePreview?: (character: PlayerViewCharacterSummary, feature: TableFeedFeaturePreview) => void;
  onWealthEdit?: (character: PlayerViewCharacterSummary) => void;
}) {
  if (character) {
    return <CharacterSheet character={character} beastforms={beastforms} role="player" onDomainCardPreview={onDomainCardPreview} onFeaturePreview={onFeaturePreview} onWealthEdit={onWealthEdit} />;
  }
  return (
    <aside className="player-character-panel player-character-panel--empty" aria-label="Персонаж игрока">
      <UserRound size={22} />
      <strong>{emptyState.title}</strong>
      <p>{emptyState.description}</p>
      <Button className="player-character-panel__cta" variant="primary" type="button" iconBefore={<LayoutDashboard size={16} aria-hidden="true" />} onClick={onEmptyAction ?? openLobby}>
        {emptyActionLabel ?? emptyState.actionLabel}
      </Button>
    </aside>
  );
}

function openLobby(): void {
  if (typeof window === 'undefined') return;
  const basePath = inferBasePathFromWorkspacePath(window.location.pathname) || '';
  const nextPath = `${basePath}/`.replace(/\/{2,}/g, '/');
  window.history.pushState({}, '', nextPath);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
