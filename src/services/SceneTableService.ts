import { clamp, toSafeInteger } from '../core/utils/clamp';
import { nowIso } from '../core/utils/date';
import { pauseSceneMusic, playSceneMusic, setSceneMusicTrack, setSceneMusicVolume, stopSceneMusic } from '../domain/audio/sceneAudio';
import { arrangedTokenPositionForActor, createLocalParticipant, createTableScene, createTokenState } from '../domain/tabletop/factories';
import {
  autoArrangeTokens,
  DEFAULT_SCENE_HEIGHT,
  DEFAULT_SCENE_WIDTH,
  moveTokenWithinWorld,
  patchTokenFlags
} from '../domain/tabletop/logic';
import type { Character, SceneTableState } from '../domain/rules/types';
import type { ActorRef, TableParticipant, TableScene, TokenState } from '../domain/tabletop/types';
import type { TokenFlagPatch } from '../domain/tabletop/logic';
import { charactersStore, sceneTableStore } from '../stores/gameStores';

export interface SceneImportReport {
  imported: boolean;
  sceneId?: string;
  warnings: string[];
}

export class SceneTableService {
  readonly sceneTableStore = sceneTableStore;

  assignLocalPlayerCharacter(characterId: string | null): void {
    let nextParticipants: SceneTableState['participants'] | null = null;
    sceneTableStore.update((state) => {
      nextParticipants = {
        ...state.participants,
        'local-player': createLocalParticipant({
          ...state.participants['local-player'],
          id: 'local-player',
          name: state.participants['local-player']?.name ?? 'Экран игрока',
          role: 'player',
          actorIds: characterId ? [characterId] : [],
          connected: true
        })
      };
      return {
        ...state,
        participants: nextParticipants,
        updatedAt: nowIso()
      };
    });
    if (nextParticipants) syncCharacterPlayerNames(nextParticipants);
  }

  createPlayerSeat(input: { name?: string; characterId?: string | null } = {}): TableParticipant {
    const id = `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const currentParticipants = sceneTableStore.getSnapshot().participants;
    const participant = createLocalParticipant({
      id,
      name: input.name?.trim() || nextPlayerSeatName(currentParticipants),
      role: 'player',
      actorIds: input.characterId ? [input.characterId] : [],
      connected: false
    });
    let nextParticipants: SceneTableState['participants'] | null = null;
    sceneTableStore.update((state) => {
      nextParticipants = {
        ...state.participants,
        [id]: participant
      };
      return {
        ...state,
        participants: nextParticipants,
        updatedAt: nowIso()
      };
    });
    if (nextParticipants) syncCharacterPlayerNames(nextParticipants);
    return participant;
  }

  ensurePlayerSeatsForCharacters(characters: Character[]): TableParticipant[] {
    const created: TableParticipant[] = [];
    let nextParticipants: SceneTableState['participants'] | null = null;
    sceneTableStore.update((state) => {
      const participants = { ...state.participants };
      const assignedCharacterIds = new Set(
        Object.values(participants)
          .filter((participant) => participant.role === 'player')
          .flatMap((participant) => participant.actorIds)
      );
      characters.forEach((character, index) => {
        if (assignedCharacterIds.has(character.id)) return;
        const participant = createLocalParticipant({
          id: `player-${Date.now().toString(36)}-${index.toString(36)}`,
          name: character.name || nextPlayerSeatName(participants),
          role: 'player',
          actorIds: [character.id],
          connected: false
        });
        participants[participant.id] = participant;
        assignedCharacterIds.add(character.id);
        created.push(participant);
      });
      if (created.length === 0) return state;
      nextParticipants = participants;
      return {
        ...state,
        participants,
        updatedAt: nowIso()
      };
    });
    if (nextParticipants) syncCharacterPlayerNames(nextParticipants);
    return created;
  }

  updatePlayerSeat(participantId: string, patch: { name?: string; characterId?: string | null }): void {
    let nextParticipants: SceneTableState['participants'] | null = null;
    sceneTableStore.update((state) => {
      const current = state.participants[participantId];
      if (!current || current.role !== 'player') return state;
      nextParticipants = {
        ...state.participants,
        [participantId]: createLocalParticipant({
          ...current,
          name: patch.name === undefined ? current.name : patch.name.trim(),
          role: 'player',
          actorIds: patch.characterId === undefined ? current.actorIds : patch.characterId ? [patch.characterId] : [],
          updatedAt: nowIso()
        })
      };
      return {
        ...state,
        participants: nextParticipants,
        updatedAt: nowIso()
      };
    });
    if (nextParticipants) syncCharacterPlayerNames(nextParticipants);
  }

  removePlayerSeat(participantId: string): void {
    let nextParticipants: SceneTableState['participants'] | null = null;
    sceneTableStore.update((state) => {
      const current = state.participants[participantId];
      if (!current || current.role !== 'player') return state;
      const { [participantId]: _removed, ...participants } = state.participants;
      nextParticipants = participants;
      return {
        ...state,
        participants,
        updatedAt: nowIso()
      };
    });
    if (nextParticipants) syncCharacterPlayerNames(nextParticipants);
  }

  selectToken(selectedTokenId: string | null): void {
    sceneTableStore.update((state) => {
      const scene = state.scenes[state.activeSceneId];
      const visible = scene?.tokens.some((token) => token.id === selectedTokenId && !token.hidden) ?? false;
      return {
        ...state,
        selectedTokenId: selectedTokenId && visible ? selectedTokenId : null,
        updatedAt: nowIso()
      };
    });
  }

  updateTokenFlags(tokenId: string, patch: TokenFlagPatch): TokenState | null {
    let updated: TokenState | null = null;
    this.updateActiveScene((scene) => {
      let changed = false;
      const tokens = scene.tokens.map((token) => {
        if (token.id !== tokenId) return token;
        changed = true;
        updated = patchTokenFlags(token, patch);
        return updated;
      });
      return changed ? { ...scene, tokens } : scene;
    });
    return updated;
  }

  setTokenHidden(tokenId: string, hidden: boolean): TokenState | null {
    return this.updateTokenFlags(tokenId, { hidden });
  }

  setTokenLocked(tokenId: string, locked: boolean): TokenState | null {
    return this.updateTokenFlags(tokenId, { locked });
  }

  setTokenVisibility(tokenId: string, visibility: 'public' | 'gm'): TokenState | null {
    return this.updateTokenFlags(tokenId, { ownership: { visibility } });
  }

  addActorTokenToScene(sceneId: string, actor: ActorRef): TokenState | null {
    let placed: TokenState | null = null;
    sceneTableStore.update((state) => {
      const scene = state.scenes[sceneId];
      if (!scene) return state;
      const existing = scene.tokens.find((token) => token.actor.kind === actor.kind && token.actor.id === actor.id);
      const tokens = existing
        ? scene.tokens.map((token) => {
            if (token.id !== existing.id) return token;
            const nextToken = token.hidden ? { ...token, hidden: false } : token;
            placed = nextToken;
            return nextToken;
          })
        : [
            ...scene.tokens,
            createTokenState(
              actor,
              arrangedTokenPositionForActor(actor, scene.tokens.filter((token) => token.actor.kind === actor.kind).length)
            )
          ];
      if (!placed) placed = tokens[tokens.length - 1] ?? null;
      if (!placed) return state;
      return cleanTokenFocus({
        ...state,
        scenes: {
          ...state.scenes,
          [sceneId]: { ...scene, tokens, updatedAt: nowIso() }
        },
        selectedTokenId: state.activeSceneId === sceneId ? placed.id : state.selectedTokenId,
        updatedAt: nowIso()
      });
    });
    return placed;
  }

  removeTokenFromScene(tokenId: string): boolean {
    const sceneId = sceneTableStore.getSnapshot().activeSceneId;
    return this.removeTokenFromSceneInScene(sceneId, tokenId);
  }

  removeTokenFromSceneInScene(sceneId: string, tokenId: string): boolean {
    let removed = false;
    sceneTableStore.update((state) => {
      const scene = state.scenes[sceneId];
      if (!scene) return state;
      const tokens = scene.tokens.filter((token) => token.id !== tokenId);
      removed = tokens.length !== scene.tokens.length;
      if (!removed) return state;
      return cleanTokenFocus({
        ...state,
        scenes: {
          ...state.scenes,
          [sceneId]: { ...scene, tokens, updatedAt: nowIso() }
        },
        selectedTokenId: state.activeSceneId === sceneId && state.selectedTokenId === tokenId ? null : state.selectedTokenId,
        updatedAt: nowIso()
      });
    });
    return removed;
  }

  resetSceneTable(): void {
    const scene = createTableScene({ name: 'Новая сцена' });
    sceneTableStore.update((state) => ({
      ...state,
      activeSceneId: scene.id,
      liveSceneId: scene.id,
      scenes: { [scene.id]: scene },
      sceneOrder: [scene.id],
      selectedTokenId: null,
      updatedAt: nowIso()
    }));
  }

  getActiveScene(): TableScene {
    const state = sceneTableStore.getSnapshot();
    return state.scenes[state.activeSceneId] ?? state.scenes[state.sceneOrder[0]] ?? createTableScene();
  }

  updateActiveScene(updater: TableScene | ((scene: TableScene) => TableScene)): void {
    sceneTableStore.update((state) => {
      const currentScene = state.scenes[state.activeSceneId] ?? createTableScene();
      const nextScene = typeof updater === 'function' ? updater(currentScene) : updater;
      return cleanTokenFocus({
        ...state,
        activeSceneId: nextScene.id,
        scenes: { ...state.scenes, [nextScene.id]: { ...nextScene, updatedAt: nowIso() } },
        sceneOrder: state.sceneOrder.includes(nextScene.id) ? state.sceneOrder : [...state.sceneOrder, nextScene.id],
        updatedAt: nowIso()
      });
    });
  }

  createScene(input?: Partial<TableScene>): TableScene {
    const scene = createTableScene(input);
    sceneTableStore.update((state) => ({
      ...state,
      activeSceneId: scene.id,
      liveSceneId: state.liveSceneId || scene.id,
      scenes: { ...state.scenes, [scene.id]: scene },
      sceneOrder: [...state.sceneOrder, scene.id],
      selectedTokenId: null,
      updatedAt: nowIso()
    }));
    return scene;
  }

  updateScene(id: string, patch: Partial<Pick<TableScene, 'name' | 'subtitle' | 'backgroundAssetId' | 'backgroundUrl' | 'mode'>>): void {
    sceneTableStore.update((state) => {
      const scene = state.scenes[id];
      if (!scene) return state;
      const nextScene: TableScene = {
        ...scene,
        ...patch,
        updatedAt: nowIso()
      };
      return {
        ...state,
        scenes: { ...state.scenes, [id]: nextScene },
        updatedAt: nowIso()
      };
    });
  }

  setSceneMusicTrack(sceneId: string, input: { assetId?: string; sourceUrl: string; title?: string }): void {
    this.updateSceneMusic(sceneId, (music) => setSceneMusicTrack(music, { assetId: input.assetId, sourceUrl: input.sourceUrl, title: input.title }));
  }

  playSceneMusic(sceneId: string): void {
    this.updateSceneMusic(sceneId, (music) => playSceneMusic(music));
  }

  pauseSceneMusic(sceneId: string, position?: number): void {
    this.updateSceneMusic(sceneId, (music) => pauseSceneMusic(music, nowIso(), position));
  }

  stopSceneMusic(sceneId: string): void {
    this.updateSceneMusic(sceneId, (music) => stopSceneMusic(music));
  }

  setSceneMusicVolume(sceneId: string, volume: number): void {
    this.updateSceneMusic(sceneId, (music) => setSceneMusicVolume(music, volume));
  }

  duplicateScene(id: string): TableScene | null {
    const state = sceneTableStore.getSnapshot();
    const source = state.scenes[id];
    if (!source) return null;
    const scene = createTableScene({
      name: `${source.name} копия`,
      subtitle: source.subtitle,
      mode: source.mode,
      backgroundAssetId: source.backgroundAssetId,
      backgroundUrl: source.backgroundUrl,
      layers: source.layers.map((layer) => ({ ...layer })),
      tokens: source.tokens.map((token) => ({ ...token })),
      music: { ...source.music },
      notes: source.notes
    });
    sceneTableStore.update((current) => {
      const insertAfter = Math.max(0, current.sceneOrder.indexOf(id));
      const sceneOrder = [...current.sceneOrder];
      sceneOrder.splice(insertAfter + 1, 0, scene.id);
      return {
        ...current,
        activeSceneId: scene.id,
        scenes: { ...current.scenes, [scene.id]: scene },
        sceneOrder,
        selectedTokenId: null,
        updatedAt: nowIso()
      };
    });
    return scene;
  }

  deleteScene(id: string): boolean {
    const state = sceneTableStore.getSnapshot();
    if (!state.scenes[id] || state.sceneOrder.length <= 1) return false;
    const sceneOrder = state.sceneOrder.filter((sceneId) => sceneId !== id);
    const nextActiveSceneId = state.activeSceneId === id ? sceneOrder[0] : state.activeSceneId;
    const nextLiveSceneId = state.liveSceneId === id ? nextActiveSceneId : state.liveSceneId;
    sceneTableStore.update((current) => {
      const { [id]: _removed, ...scenes } = current.scenes;
      const activeScene = scenes[nextActiveSceneId] ?? scenes[sceneOrder[0]] ?? createTableScene();
      return {
        ...current,
        activeSceneId: activeScene.id,
        liveSceneId: scenes[nextLiveSceneId] ? nextLiveSceneId : activeScene.id,
        scenes,
        sceneOrder,
        selectedTokenId: null,
        updatedAt: nowIso()
      };
    });
    return true;
  }

  moveScene(id: string, direction: 'up' | 'down'): boolean {
    const state = sceneTableStore.getSnapshot();
    const index = state.sceneOrder.indexOf(id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= state.sceneOrder.length) return false;
    const sceneOrder = [...state.sceneOrder];
    const [sceneId] = sceneOrder.splice(index, 1);
    sceneOrder.splice(targetIndex, 0, sceneId);
    sceneTableStore.update((current) => ({
      ...current,
      sceneOrder,
      updatedAt: nowIso()
    }));
    return true;
  }

  importLegacySceneJson(json: string): SceneImportReport {
    try {
      const parsed = JSON.parse(json) as unknown;
      const input = unwrapLegacySceneInput(parsed);
      if (!input) {
        return { imported: false, warnings: ['Файл не похож на экспорт карты или сцены.'] };
      }
      const scene = this.createScene(input);
      return { imported: true, sceneId: scene.id, warnings: [] };
    } catch (error) {
      return { imported: false, warnings: [error instanceof Error ? error.message : 'Не удалось прочитать JSON сцены.'] };
    }
  }

  setActiveScene(id: string): void {
    sceneTableStore.update((state) => {
      const scene = state.scenes[id];
      if (!scene) return state;
      return {
        ...state,
        activeSceneId: id,
        selectedTokenId: null,
        updatedAt: nowIso()
      };
    });
  }

  publishScene(id: string): boolean {
    const state = sceneTableStore.getSnapshot();
    if (!state.scenes[id]) return false;
    sceneTableStore.update((current) => ({
      ...current,
      activeSceneId: id,
      liveSceneId: id,
      scenes: {
        ...current.scenes,
        [id]: shouldCarrySceneMusicPlayback(current, id)
          ? { ...current.scenes[id], music: playSceneMusic(current.scenes[id].music), updatedAt: nowIso() }
          : current.scenes[id]
      },
      selectedTokenId: null,
      updatedAt: nowIso()
    }));
    return true;
  }

  updateSceneTokens(updater: TokenState[] | ((tokens: TokenState[]) => TokenState[])): void {
    this.updateActiveScene((scene) => ({
      ...scene,
      tokens: typeof updater === 'function' ? updater(scene.tokens) : updater
    }));
  }

  moveTokenInScene(sceneId: string, tokenId: string, x: number, y: number, ownerActorId?: string | null, allowRestricted = false): boolean {
    let moved = false;
    sceneTableStore.update((state) => {
      const scene = state.scenes[sceneId];
      if (!scene) return state;
      const tokens = scene.tokens.map((token) => {
        if (token.id !== tokenId) return token;
        if (!allowRestricted && ownerActorId && (token.actor.kind !== 'character' || token.actor.id !== ownerActorId)) return token;
        if (token.locked || (!allowRestricted && (token.hidden || token.ownership.visibility !== 'public'))) return token;
        moved = true;
        return moveTokenWithinWorld(token, x, y);
      });
      if (!moved) return state;
      return {
        ...state,
        scenes: {
          ...state.scenes,
          [sceneId]: { ...scene, tokens, updatedAt: nowIso() }
        },
        updatedAt: nowIso()
      };
    });
    return moved;
  }

  autoArrangeActiveScene(): void {
    this.updateSceneTokens((tokens) => autoArrangeTokens(tokens));
  }

  private updateSceneMusic(sceneId: string, updater: (music: TableScene['music']) => TableScene['music']): void {
    sceneTableStore.update((state) => {
      const scene = state.scenes[sceneId];
      if (!scene) return state;
      const nextScene = {
        ...scene,
        music: updater(scene.music),
        updatedAt: nowIso()
      };
      return {
        ...state,
        scenes: { ...state.scenes, [sceneId]: nextScene },
        updatedAt: nowIso()
      };
    });
  }
}

function shouldCarrySceneMusicPlayback(state: SceneTableState, nextSceneId: string): boolean {
  const currentLiveScene = state.scenes[state.liveSceneId] ?? state.scenes[state.activeSceneId];
  const nextScene = state.scenes[nextSceneId];
  if (!currentLiveScene || !nextScene || currentLiveScene.id === nextScene.id) return false;
  if (!currentLiveScene.music.playing || nextScene.music.playing) return false;
  return Boolean(nextScene.music.sourceUrl || nextScene.music.assetId);
}

function unwrapLegacySceneInput(value: unknown): Partial<TableScene> | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const source = pickSceneSource(record);
  if (!source) return null;

  const backgroundUrl = stringField(source, 'backgroundUrl') || stringField(source, 'backgroundImageUrl');
  const mapMode = stringField(source, 'mapMode');
  const gridSize = numberField(source, 'gridSize') ?? numberField(record.canvasSettings, 'gridSize') ?? 52;
  const tokens = Array.isArray(source.tokens) ? source.tokens.map(mapLegacyToken).filter(Boolean) as TokenState[] : [];

  if (!backgroundUrl && tokens.length === 0 && !stringField(source, 'name')) return null;

  return {
    name: stringField(source, 'name') || stringField(record, 'name') || 'Импортированная сцена',
    subtitle: stringField(source, 'subtitle') || 'Импорт карты',
    mode: mapMode === 'grid' || mapMode === 'tactical' ? 'tactical' : 'scene',
    backgroundUrl,
    layers: [{
      id: `layer-import-${Date.now()}`,
      kind: 'background',
      name: 'Импортированный фон',
      opacity: 1,
      visible: true,
      gridType: 'square',
      gridSize: clamp(toSafeInteger(gridSize, 52), 24, 120),
      x: 0,
      y: 0,
      width: DEFAULT_SCENE_WIDTH,
      height: DEFAULT_SCENE_HEIGHT
    }],
    tokens
  };
}

function pickSceneSource(record: Record<string, unknown>): Record<string, unknown> | null {
  if (hasSceneFields(record)) return record;
  for (const key of ['scene', 'tableScene', 'map', 'sceneCanvas', 'canvasSettings']) {
    const value = record[key];
    if (value && typeof value === 'object' && hasSceneFields(value as Record<string, unknown>)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function hasSceneFields(record: Record<string, unknown>): boolean {
  return ['backgroundUrl', 'backgroundImageUrl', 'mapMode', 'gridSize', 'tokens', 'name'].some((key) => key in record);
}

function mapLegacyToken(value: unknown): TokenState | null {
  if (!value || typeof value !== 'object') return null;
  const token = value as Record<string, unknown>;
  const kind = token.kind === 'character' || token.kind === 'adversary' ? token.kind : null;
  const sourceId = stringField(token, 'sourceId') || stringField(token, 'actorId');
  if (!kind || !sourceId) return null;
  const x = numberField(token, 'x') ?? 50;
  const y = numberField(token, 'y') ?? 50;
  const size = token.size === 'small' ? 54 : token.size === 'large' ? 92 : 72;
  return {
    id: stringField(token, 'id') || `${kind}-${sourceId}`,
    actor: { kind, id: sourceId },
    x: clamp(x <= 100 ? (x / 100) * DEFAULT_SCENE_WIDTH : x, 0, DEFAULT_SCENE_WIDTH),
    y: clamp(y <= 100 ? (y / 100) * DEFAULT_SCENE_HEIGHT : y, 0, DEFAULT_SCENE_HEIGHT),
    width: size,
    height: size,
    rotation: numberField(token, 'rotation') ?? 0,
    hidden: Boolean(token.hidden),
    locked: false,
    ownership: { ownerId: null, editableBy: ['gm'], visibility: 'public' }
  };
}

function stringField(value: unknown, key: string): string {
  if (!value || typeof value !== 'object') return '';
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field.trim() : '';
}

function numberField(value: unknown, key: string): number | null {
  if (!value || typeof value !== 'object') return null;
  const field = (value as Record<string, unknown>)[key];
  if (typeof field === 'number' && Number.isFinite(field)) return field;
  if (typeof field === 'string' && field.trim() && Number.isFinite(Number(field))) return Number(field);
  return null;
}

function cleanTokenFocus(state: SceneTableState): SceneTableState {
  const scene = state.scenes[state.activeSceneId];
  const selectableTokenIds = new Set((scene?.tokens ?? []).filter((token) => !token.hidden).map((token) => token.id));
  return {
    ...state,
    selectedTokenId: state.selectedTokenId && selectableTokenIds.has(state.selectedTokenId) ? state.selectedTokenId : null
  };
}

function nextPlayerSeatName(participants: SceneTableState['participants']): string {
  const playerCount = Object.values(participants).filter((participant) => participant.role === 'player').length;
  return `Игрок ${playerCount + 1}`;
}

function syncCharacterPlayerNames(participants: SceneTableState['participants']): void {
  const playerNameByCharacterId = new Map<string, string>();
  Object.values(participants).forEach((participant) => {
    if (participant.role !== 'player') return;
    participant.actorIds.forEach((actorId) => {
      if (!playerNameByCharacterId.has(actorId)) {
        playerNameByCharacterId.set(actorId, participant.name.trim());
      }
    });
  });

  charactersStore.update((state) => {
    let changed = false;
    const entities = { ...state.entities };
    Object.entries(entities).forEach(([characterId, character]) => {
      const playerName = playerNameByCharacterId.get(characterId) ?? '';
      if (character.playerName === playerName) return;
      changed = true;
      entities[characterId] = { ...character, playerName };
    });
    return changed ? { ...state, entities, updatedAt: nowIso() } : state;
  });
}
