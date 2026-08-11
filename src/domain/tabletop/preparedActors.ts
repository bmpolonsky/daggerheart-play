import type { Adversary, Character, CharactersState, EncounterEnvironment, EncounterState, SceneTableState } from '../rules/types';
import type { TableActorKind, TokenState } from './types';

export interface PreparedHeroRow {
  character: Character;
  onActiveScene: boolean;
  companionOnActiveScene: boolean;
}

export interface PreparedAdversaryRow {
  adversary: Adversary;
  activeSceneInstances: number;
}

export interface PreparedEnvironmentRow {
  environment: EncounterEnvironment;
  onActiveScene: boolean;
}

export interface PreparedActorsView {
  heroes: PreparedHeroRow[];
  adversaries: PreparedAdversaryRow[];
  environments: PreparedEnvironmentRow[];
}

export function referencedActorIds(sceneTable: SceneTableState, kind: TableActorKind): Set<string> {
  return new Set(Object.values(sceneTable.scenes).flatMap((scene) => (
    scene.tokens.filter((token) => token.actor.kind === kind).map((token) => token.actor.id)
  )));
}

export function isPreparedAdversary(adversary: Adversary, sceneTable: SceneTableState): boolean {
  return !adversary.preparedTemplateId && !referencedActorIds(sceneTable, 'adversary').has(adversary.id);
}

export function isPreparedEnvironment(environment: EncounterEnvironment, sceneTable: SceneTableState): boolean {
  return !environment.preparedTemplateId && !referencedActorIds(sceneTable, 'environment').has(environment.id);
}

export function buildPreparedActorsView(
  characters: CharactersState,
  encounter: EncounterState,
  sceneTable: SceneTableState,
  query = ''
): PreparedActorsView {
  const scene = sceneTable.scenes[sceneTable.activeSceneId];
  const tokens = scene?.tokens ?? [];
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const matches = (value: string) => !normalizedQuery || value.toLocaleLowerCase('ru').includes(normalizedQuery);
  const countInstances = (templateId: string) => tokens.filter((token) => {
    if (token.actor.kind !== 'adversary') return false;
    const actor = encounter.adversaries[token.actor.id];
    return actor?.preparedTemplateId === templateId || actor?.id === templateId;
  }).length;
  const hasEnvironment = (templateId: string) => tokens.some((token) => {
    if (token.actor.kind !== 'environment') return false;
    const actor = encounter.environments[token.actor.id];
    return actor?.preparedTemplateId === templateId || actor?.id === templateId;
  });

  return {
    heroes: characters.order.flatMap((id) => {
      const character = characters.entities[id];
      if (!character || !matches(`${character.name} ${character.playerName}`)) return [];
      return [{
        character,
        onActiveScene: hasToken(tokens, 'character', id),
        companionOnActiveScene: hasToken(tokens, 'companion', id)
      }];
    }),
    adversaries: encounter.order.flatMap((id) => {
      const adversary = encounter.adversaries[id];
      if (!adversary || !isPreparedAdversary(adversary, sceneTable) || !matches(`${adversary.name} ${adversary.sourceName ?? ''}`)) return [];
      return [{ adversary, activeSceneInstances: countInstances(adversary.id) }];
    }),
    environments: Object.values(encounter.environments).flatMap((environment) => (
      isPreparedEnvironment(environment, sceneTable) && matches(`${environment.name} ${environment.sourceName ?? ''}`)
        ? [{ environment, onActiveScene: hasEnvironment(environment.id) }]
        : []
    ))
  };
}

export function nextSceneInstanceName(baseName: string, usedNames: Iterable<string>): string {
  const used = new Set(Array.from(usedNames, (name) => name.trim().toLocaleLowerCase('ru')));
  if (!used.has(baseName.trim().toLocaleLowerCase('ru'))) return baseName;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${baseName} ${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase('ru'))) return candidate;
  }
}

export function actorReferenceCount(sceneTable: SceneTableState, kind: TableActorKind, actorId: string): number {
  return Object.values(sceneTable.scenes).reduce((count, scene) => (
    count + scene.tokens.filter((token) => token.actor.kind === kind && token.actor.id === actorId).length
  ), 0);
}

export function contentSourceMatches(
  actor: Pick<Adversary | EncounterEnvironment, 'sourceId' | 'sourceSlug'>,
  source: { sourceId?: string | number; sourceSlug?: string }
): boolean {
  if (source.sourceId !== undefined && actor.sourceId !== undefined) return String(source.sourceId) === String(actor.sourceId);
  return Boolean(source.sourceSlug && actor.sourceSlug && source.sourceSlug === actor.sourceSlug);
}

function hasToken(tokens: TokenState[], kind: TableActorKind, actorId: string): boolean {
  return tokens.some((token) => token.actor.kind === kind && token.actor.id === actorId);
}
