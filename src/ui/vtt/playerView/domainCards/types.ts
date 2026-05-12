import type { PlayerViewCharacterSummary } from "../../../../domain/tabletop/playerView";

export type PlayerViewDomainCard = PlayerViewCharacterSummary["loadoutCards"][number];
export type PlayerViewDomainCardMacro = PlayerViewDomainCard["macros"][number];
