import { nowIso } from '../core/utils/date';
import { createAdversary, createEncounterEnvironment } from '../domain/rules/factories';
import type { Adversary, EncounterEnvironment } from '../domain/rules/types';
import { actorReferenceCount, buildPreparedActorsView, isPreparedAdversary, isPreparedEnvironment, nextSceneInstanceName } from '../domain/tabletop/preparedActors';
import { tokenIdForActor } from '../domain/tabletop/factories';
import type { ActorRef, TableScene, TokenState } from '../domain/tabletop/types';
import { charactersStore, encounterStore, sceneTableStore } from '../stores/gameStores';
import type { EncounterService } from './EncounterService';
import type { SceneTableService } from './SceneTableService';

export class PreparedActorService {
  constructor(
    private encounterService: EncounterService,
    private sceneTableService: SceneTableService
  ) {}

  buildView(query = '') {
    return buildPreparedActorsView(charactersStore.get(), encounterStore.get(), sceneTableStore.get(), query);
  }

  addCharacter(characterId: string, sceneId = sceneTableStore.get().activeSceneId): TokenState | null {
    if (!charactersStore.get().entities[characterId]) return null;
    return this.sceneTableService.addActorTokenToScene(sceneId, { kind: 'character', id: characterId });
  }

  addCompanion(characterId: string, sceneId = sceneTableStore.get().activeSceneId): TokenState | null {
    if (!charactersStore.get().entities[characterId]?.companion) return null;
    return this.sceneTableService.addActorTokenToScene(sceneId, { kind: 'companion', id: characterId });
  }

  instantiateAdversary(templateId: string, sceneId = sceneTableStore.get().activeSceneId): Adversary | null {
    const state = encounterStore.get();
    const template = state.adversaries[templateId];
    const scene = sceneTableStore.get().scenes[sceneId];
    if (!template || template.preparedTemplateId || !scene) return null;
    const usedNames = scene.tokens.flatMap((token) => token.actor.kind === 'adversary' ? [state.adversaries[token.actor.id]?.name ?? ''] : []);
    const instance = this.encounterService.createAdversary({
      ...template,
      id: undefined,
      preparedTemplateId: template.id,
      name: nextSceneInstanceName(template.name, usedNames),
      hp: { ...template.hp, marked: 0 },
      stress: { ...template.stress, marked: 0 },
      conditions: [],
      createdAt: undefined,
      updatedAt: undefined
    });
    const token = this.sceneTableService.addActorTokenToScene(sceneId, { kind: 'adversary', id: instance.id }, { hidden: true, placement: 'random' });
    if (token) return instance;
    this.encounterService.deleteAdversary(instance.id);
    return null;
  }

  instantiateEnvironment(templateId: string, sceneId = sceneTableStore.get().activeSceneId): EncounterEnvironment | null {
    const state = encounterStore.get();
    const template = state.environments[templateId];
    const scene = sceneTableStore.get().scenes[sceneId];
    if (!template || template.preparedTemplateId || !scene) return null;
    const alreadyPresent = scene.tokens.some((token) => {
      if (token.actor.kind !== 'environment') return false;
      const environment = state.environments[token.actor.id];
      return environment?.id === template.id || environment?.preparedTemplateId === template.id;
    });
    if (alreadyPresent) return null;
    const usedNames = scene.tokens.flatMap((token) => token.actor.kind === 'environment' ? [state.environments[token.actor.id]?.name ?? ''] : []);
    const instance = createEncounterEnvironment({
      ...template,
      id: undefined,
      preparedTemplateId: template.id,
      name: nextSceneInstanceName(template.name, usedNames),
      createdAt: undefined,
      updatedAt: undefined
    });
    encounterStore.update((encounter) => ({
      ...encounter,
      environments: { ...encounter.environments, [instance.id]: instance },
      updatedAt: nowIso()
    }));
    const token = this.sceneTableService.addActorTokenToScene(sceneId, { kind: 'environment', id: instance.id }, { hidden: true, placement: 'random' });
    if (token) return instance;
    this.deleteEnvironment(instance.id);
    return null;
  }

  duplicateAdversaryTemplate(templateId: string): Adversary | null {
    const template = encounterStore.get().adversaries[templateId];
    if (!template || template.preparedTemplateId) return null;
    return this.encounterService.createAdversary({
      ...template,
      id: undefined,
      preparedTemplateId: undefined,
      name: `${template.name} (копия)`,
      hp: { ...template.hp, marked: 0 },
      stress: { ...template.stress, marked: 0 },
      conditions: [],
      createdAt: undefined,
      updatedAt: undefined
    });
  }

  updateAdversaryTemplate(templateId: string, patch: Partial<Omit<Adversary, 'id' | 'preparedTemplateId' | 'createdAt' | 'updatedAt'>>): boolean {
    const template = encounterStore.get().adversaries[templateId];
    if (!template || !isPreparedAdversary(template, sceneTableStore.get())) return false;
    this.encounterService.updateAdversary(templateId, {
      ...patch,
      hp: patch.hp ? { ...patch.hp, marked: 0 } : template.hp,
      stress: patch.stress ? { ...patch.stress, marked: 0 } : template.stress,
      conditions: []
    });
    return true;
  }

  duplicateEnvironmentTemplate(templateId: string): EncounterEnvironment | null {
    const template = encounterStore.get().environments[templateId];
    if (!template || !isPreparedEnvironment(template, sceneTableStore.get())) return null;
    const duplicate = createEncounterEnvironment({
      ...template,
      id: undefined,
      preparedTemplateId: undefined,
      name: `${template.name} (копия)`,
      createdAt: undefined,
      updatedAt: undefined
    });
    encounterStore.update((state) => ({
      ...state,
      environments: { ...state.environments, [duplicate.id]: duplicate },
      updatedAt: nowIso()
    }));
    return duplicate;
  }

  updateEnvironmentTemplate(templateId: string, patch: Partial<Omit<EncounterEnvironment, 'id' | 'preparedTemplateId' | 'createdAt' | 'updatedAt'>>): boolean {
    const template = encounterStore.get().environments[templateId];
    if (!template || !isPreparedEnvironment(template, sceneTableStore.get())) return false;
    encounterStore.update((state) => ({
      ...state,
      environments: {
        ...state.environments,
        [templateId]: { ...template, ...patch, id: templateId, updatedAt: nowIso() }
      },
      updatedAt: nowIso()
    }));
    return true;
  }

  deleteTemplate(actor: ActorRef): boolean {
    if (actorReferenceCount(sceneTableStore.get(), actor.kind, actor.id) > 0) return false;
    if (actor.kind === 'adversary') {
      const entity = encounterStore.get().adversaries[actor.id];
      if (!entity || entity.preparedTemplateId) return false;
      this.encounterService.deleteAdversary(actor.id);
      return true;
    }
    if (actor.kind === 'environment') {
      const entity = encounterStore.get().environments[actor.id];
      if (!entity || entity.preparedTemplateId) return false;
      this.deleteEnvironment(actor.id);
      return true;
    }
    return false;
  }

  removeFromScene(token: TokenState, sceneId = sceneTableStore.get().activeSceneId): boolean {
    const removed = this.sceneTableService.removeTokenFromSceneInScene(sceneId, token.id);
    if (!removed || (token.actor.kind !== 'adversary' && token.actor.kind !== 'environment')) return removed;
    if (actorReferenceCount(sceneTableStore.get(), token.actor.kind, token.actor.id) > 0) return true;
    if (token.actor.kind === 'adversary') this.encounterService.deleteAdversary(token.actor.id);
    else this.deleteEnvironment(token.actor.id);
    return true;
  }

  deleteScene(sceneId: string): boolean {
    const scene = sceneTableStore.get().scenes[sceneId];
    if (!scene) return false;
    const runtimeActors = scene.tokens.filter((token) => token.actor.kind === 'adversary' || token.actor.kind === 'environment').map((token) => token.actor);
    if (!this.sceneTableService.deleteScene(sceneId)) return false;
    for (const actor of runtimeActors) {
      if (actorReferenceCount(sceneTableStore.get(), actor.kind, actor.id) > 0) continue;
      if (actor.kind === 'adversary') this.encounterService.deleteAdversary(actor.id);
      else if (actor.kind === 'environment') this.deleteEnvironment(actor.id);
    }
    return true;
  }

  duplicateScene(sceneId: string): TableScene | null {
    const duplicated = this.sceneTableService.duplicateScene(sceneId);
    if (!duplicated) return null;
    const encounter = encounterStore.get();
    const actorIds = new Map<string, string>();
    for (const token of duplicated.tokens) {
      if (token.actor.kind === 'adversary') {
        const source = encounter.adversaries[token.actor.id];
        if (!source || actorIds.has(`adversary:${source.id}`)) continue;
        const clone = this.encounterService.createAdversary({ ...source, id: undefined, createdAt: undefined, updatedAt: undefined });
        actorIds.set(`adversary:${source.id}`, clone.id);
      } else if (token.actor.kind === 'environment') {
        const source = encounter.environments[token.actor.id];
        if (!source || actorIds.has(`environment:${source.id}`)) continue;
        const clone = createEncounterEnvironment({ ...source, id: undefined, createdAt: undefined, updatedAt: undefined });
        encounterStore.update((state) => ({ ...state, environments: { ...state.environments, [clone.id]: clone }, updatedAt: nowIso() }));
        actorIds.set(`environment:${source.id}`, clone.id);
      }
    }
    this.sceneTableService.updateActiveScene((scene) => ({
      ...scene,
      tokens: scene.tokens.map((token) => {
        const nextId = actorIds.get(`${token.actor.kind}:${token.actor.id}`);
        if (!nextId) return token;
        const actor = { kind: token.actor.kind, id: nextId } as ActorRef;
        return { ...token, id: tokenIdForActor(actor), actor };
      })
    }));
    return sceneTableStore.get().scenes[duplicated.id] ?? duplicated;
  }

  private deleteEnvironment(id: string): void {
    encounterStore.update((state) => {
      if (!state.environments[id]) return state;
      const environments = { ...state.environments };
      delete environments[id];
      return { ...state, environments, updatedAt: nowIso() };
    });
  }
}
