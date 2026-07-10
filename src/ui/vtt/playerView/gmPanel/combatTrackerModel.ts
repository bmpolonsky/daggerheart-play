import type { Adversary, EncounterState } from '../../../../domain/rules/types';
import type { TableScene } from '../../../../domain/tabletop/types';

export interface CombatTrackerEntry {
  adversary: Adversary;
  tokenId: string | null;
  hidden: boolean;
}

export function buildCombatTrackerEntries(encounter: EncounterState, scene: TableScene | null): CombatTrackerEntry[] {
  const tokenByActorId = new Map(
    (scene?.tokens ?? [])
      .filter((token) => token.actor.kind === 'adversary')
      .map((token) => [token.actor.id, token])
  );

  return encounter.order.flatMap((id) => {
    const adversary = encounter.adversaries[id];
    if (!adversary) return [];
    const token = tokenByActorId.get(adversary.id) ?? null;
    return [{
      adversary,
      tokenId: token?.id ?? null,
      hidden: token?.hidden ?? false
    }];
  });
}
