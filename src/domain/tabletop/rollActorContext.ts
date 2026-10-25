import type { CharactersState, EncounterState } from '../rules/types';
import type { TokenState } from './types';

export interface RollActorOption {
  key: string;
  id: string | null;
  name: string;
  kind: 'gm' | 'unassigned' | 'character' | 'adversary' | 'environment';
}

export function buildRollActorOptions(input: {
  role: 'gm' | 'player';
  characters: CharactersState;
  encounter: EncounterState;
  sceneTokens: readonly TokenState[];
  playerCharacterId: string | null;
}): RollActorOption[] {
  if (input.role === 'player') {
    const character = input.playerCharacterId ? input.characters.entities[input.playerCharacterId] : null;
    return character
      ? [{ key: `character:${character.id}`, id: character.id, name: character.name, kind: 'character' }]
      : [{ key: 'unassigned', id: null, name: 'Без персонажа', kind: 'unassigned' }];
  }
  const options: RollActorOption[] = [{ key: 'gm', id: null, name: 'Мастер', kind: 'gm' }];
  input.characters.order.forEach((id) => {
    const character = input.characters.entities[id];
    if (character) options.push({ key: `character:${id}`, id, name: character.name, kind: 'character' });
  });
  const seen = new Set(options.map((option) => option.key));
  input.sceneTokens.forEach(({ actor }) => {
    if (actor.kind !== 'adversary' && actor.kind !== 'environment') return;
    const key = `${actor.kind}:${actor.id}`;
    if (seen.has(key)) return;
    const entity = actor.kind === 'adversary' ? input.encounter.adversaries[actor.id] : input.encounter.environments[actor.id];
    if (!entity) return;
    seen.add(key);
    options.push({ key, id: actor.id, name: entity.name, kind: actor.kind });
  });
  return options;
}

/** Viewing another sheet/token is deliberately absent from this selection. */
export function resolveRollActor(options: readonly RollActorOption[], selectedKey: string | null, role: 'gm' | 'player'): RollActorOption {
  if (role === 'player') return options[0] ?? { key: 'unassigned', id: null, name: 'Без персонажа', kind: 'unassigned' };
  return options.find((option) => option.key === selectedKey)
    ?? { key: 'gm', id: null, name: 'Мастер', kind: 'gm' };
}
