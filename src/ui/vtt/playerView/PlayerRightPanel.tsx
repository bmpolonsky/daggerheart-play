/** @jsxImportSource preact */
import { LayoutDashboard, UserRound } from "lucide-react";
import type { LibraryBeastform } from "../../../domain/content/types";
import type { PlayerViewCharacterSummary, PlayerViewEmptyCharacterState } from "../../../domain/tabletop/playerView";
import type { TableFeedFeaturePreview } from "../../../domain/tabletop/feed";
import { inferBasePathFromWorkspacePath } from "../../../domain/p2p/sessionLinks";
import { CharacterSheet } from "./CharacterSheet";
import type { PlayerViewDomainCard } from "./domainCards/types";

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
      <button className="dh-button dh-variant-primary player-character-panel__cta" type="button" onClick={onEmptyAction ?? openLobby}>
        <LayoutDashboard size={16} />
        {emptyActionLabel ?? emptyState.actionLabel}
      </button>
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
