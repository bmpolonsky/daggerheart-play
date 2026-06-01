import type { SubmitPlayerActionRequestInput } from '../../../services/PlayerActionRequestService';
import type { PlayerActivationQueueItem } from '../../../services/PlayerActivationQueueService';
import type { PlayerPresence } from '../../../services/PlayerPresenceService';
import type { Adversary, CharactersState, DamageType, RollLogEntry, TraitId } from '../../../domain/rules/types';
import type { TableParticipant } from '../../../domain/tabletop/types';
import type { PlayerViewModel, PlayerViewToken } from '../../../domain/tabletop/playerView';
import { defaultCharacterPortraitUrl } from '../../../domain/tabletop/defaultArt';
import { inferBasePathFromWorkspacePath } from '../../../domain/p2p/sessionLinks';
import { classLabel } from '../../../domain/rules/constants';
import type { PlayerRosterActor, SharedToolsTab, TableViewRole } from './types';

export function buildPlayerRosterActors(tokens: PlayerViewToken[], characters: CharactersState | null = null, adversaries: Record<string, Adversary> | null = null): PlayerRosterActor[] {
  const seen = new Set<string>();
  const placed = new Set(tokens.map((token) => `${token.kind}:${token.actorId}`));
  const actors = tokens.filter((token) => {
    const key = `${token.kind}:${token.actorId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((token) => ({
    tokenId: token.id,
    actorId: token.actorId,
    kind: token.kind,
    name: token.name,
    subtitle: token.subtitle,
    imageUrl: token.imageUrl,
    isOnScene: true
  }));
  if (characters) {
    characters.order.forEach((id) => {
      const key = `character:${id}`;
      if (seen.has(key)) return;
      const character = characters.entities[id];
      if (!character) return;
      seen.add(key);
      actors.push({
        tokenId: key,
        actorId: id,
        kind: 'character',
        name: character.name,
        subtitle: `${classLabel(character.className)} ${character.level}`,
        imageUrl: defaultCharacterPortraitUrl(character),
        isOnScene: placed.has(key)
      });
    });
  }
  if (adversaries) {
    Object.values(adversaries).forEach((adversary) => {
      const key = `adversary:${adversary.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      actors.push({
        tokenId: key,
        actorId: adversary.id,
        kind: 'adversary',
        name: adversary.name,
        subtitle: `Ранг ${adversary.tier} / ${adversary.type}`,
        imageUrl: adversary.imageUrl ?? '',
        isOnScene: placed.has(key)
      });
    });
  }
  return actors;
}

export function buildSessionRosterActors(input: {
  tokens: PlayerViewToken[];
  characters: CharactersState;
  adversaries: Record<string, Adversary>;
  role: TableViewRole;
  playerCharacterId?: string | null;
  activationQueue: PlayerActivationQueueItem[];
  presence: Record<string, PlayerPresence>;
}): PlayerRosterActor[] {
  let actors = buildPlayerRosterActors(
    input.tokens,
    input.role === 'gm' ? input.characters : null,
    input.role === 'gm' ? input.adversaries : null
  ).map((actor) => withPlayerPresence(actor, input.presence));

  if (input.role !== 'gm') {
    actors = input.playerCharacterId
      ? actors.filter((actor) => actor.kind === 'character' && actor.actorId === input.playerCharacterId)
      : [];
    return actors;
  }
  return sortRosterByActivation(actors.map((actor) => withActivationRequest(actor, input.activationQueue)), input.activationQueue);
}

function withPlayerPresence(actor: PlayerRosterActor, presence: Record<string, PlayerPresence>): PlayerRosterActor {
  if (actor.kind !== 'character') return actor;
  const actorPresence = presence[actor.actorId];
  return actorPresence ? { ...actor, presence: actorPresence } : actor;
}

function withActivationRequest(actor: PlayerRosterActor, queue: PlayerActivationQueueItem[]): PlayerRosterActor {
  if (actor.kind !== 'character') return actor;
  const request = queue.find((item) => item.actorId === actor.actorId);
  return request ? { ...actor, activationRequest: request } : actor;
}

function sortRosterByActivation(actors: PlayerRosterActor[], queue: PlayerActivationQueueItem[]): PlayerRosterActor[] {
  const orderByActor = new Map(queue.map((request, index) => [request.actorId, index]));
  return [...actors].sort((left, right) => {
    const leftOrder = left.activationRequest ? orderByActor.get(left.actorId) ?? 0 : Number.POSITIVE_INFINITY;
    const rightOrder = right.activationRequest ? orderByActor.get(right.actorId) ?? 0 : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(leftOrder) && !Number.isFinite(rightOrder)) return 0;
    return leftOrder - rightOrder;
  });
}

export function shouldIgnoreTokenDeleteShortcut(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown };
  if (element.isContentEditable) return true;
  const tagName = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
  return typeof element.closest === 'function' && Boolean(element.closest('[contenteditable=""], [contenteditable="true"]'));
}

export function playerCharacterIdFromParticipants(participants: Record<string, TableParticipant>, characters: Record<string, unknown>, selectedSeatId?: string | null): string | null {
  const selected = selectedSeatId ? participants[selectedSeatId]?.actorIds.find((id) => characters[id]) : null;
  if (selected) return selected;
  const explicit = participants['local-player']?.actorIds.find((id) => characters[id]);
  if (explicit) return explicit;
  if (selectedSeatId !== undefined) return null;
  const player = Object.values(participants).find((participant) => participant.role === 'player');
  return player?.actorIds.find((id) => characters[id]) ?? null;
}

export function cssImageUrl(input: string): string {
  if (!input) return '';
  if (/^(blob:|data:|https?:)/i.test(input)) return input;
  if (typeof window === 'undefined') return input;
  const basePath = inferBasePathFromWorkspacePath(window.location.pathname).replace(/\/+$/, '');
  const baseHref = `${window.location.origin}${basePath}/`;
  if (basePath && input.startsWith(`${basePath}/`)) {
    return new URL(input, window.location.origin).href;
  }
  const relativePath = input.startsWith('/') ? input.slice(1) : input.replace(/^\.\//, '');
  return new URL(relativePath, baseHref).href;
}

export function revealedRollIdsFromActivity(activity: PlayerViewModel['activity']): Set<string> {
  return new Set(activity.filter((event) => event.kind === 'roll').map(feedRollRevealId));
}

export function feedRollRevealId(event: PlayerViewModel['activity'][number]): string {
  return event.rollId ?? event.id;
}

export function toolTabLabel(tab: SharedToolsTab): string {
  const labels: Record<SharedToolsTab, string> = {
    scenes: 'Сцены',
    characters: 'Персонажи',
    combat: 'Конструктор боя',
    cards: 'Редактор карт',
    library: 'Компендиумы',
    notes: 'Заметки',
    handouts: 'Раздатка',
    settings: 'Настройки'
  };
  return labels[tab];
}

export function rollLogTitle(entry: RollLogEntry): string {
  if (entry.type === 'action') return `${entry.actorName}: ${entry.total}`;
  if (entry.type === 'damage') return `${entry.actorName}: ${entry.total} урона`;
  if ('total' in entry) return `${entry.actorName}: ${entry.total}`;
  return entry.title;
}

export function traitLabel(trait: TraitId): string {
  const labels: Record<TraitId, string> = {
    agility: 'Проворность',
    strength: 'Сила',
    finesse: 'Искусность',
    instinct: 'Инстинкт',
    presence: 'Влияние',
    knowledge: 'Знание'
  };
  return labels[trait];
}

export function compactDamageTypeLabel(type: string | null | undefined): string {
  const normalized = String(type ?? '').trim().toLowerCase();
  if (normalized === 'magic' || normalized === 'magical') return 'маг.';
  if (normalized === 'direct') return 'прям.';
  if (normalized === 'mixed') return 'смеш.';
  return 'физ.';
}

export function p2pStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    disconnected: 'Отключено',
    connecting: 'Подключение',
    connected: 'Подключено',
    degraded: 'Нестабильно',
    error: 'Ошибка'
  };
  return labels[status] ?? status;
}

export function currentSettingsInviteContext() {
  if (typeof window === 'undefined') {
    return { origin: 'http://localhost', basePath: '' };
  }
  return {
    origin: window.location.origin,
    basePath: inferBasePathFromWorkspacePath(window.location.pathname)
  };
}

export function buildPlayerRequestInput(input: {
  kind: 'actionRoll' | 'damageRoll' | 'card' | 'resourceChange';
  requesterId: string;
  requesterName: string;
  actorId: string | null;
  actorName: string;
  trait: TraitId;
  difficulty: number;
  damageFormula: string;
  damageType: DamageType;
  card: { id: string; name: string } | null;
  resource: 'hope' | 'hp' | 'stress' | 'armor';
  resourceDelta: number;
}): SubmitPlayerActionRequestInput {
  const common = {
    requesterId: input.requesterId,
    requesterName: input.requesterName.trim(),
    actorId: input.actorId,
    actorName: input.actorName
  };

  if (input.kind === 'damageRoll') {
    return {
      ...common,
      kind: 'damageRoll',
      title: `Урон: ${input.damageFormula || '1d8'}`,
      payload: {
        actorId: input.actorId,
        actorName: input.actorName,
        formula: input.damageFormula || '1d8',
        damageType: input.damageType
      }
    };
  }

  if (input.kind === 'card') {
    return {
      ...common,
      kind: 'card',
      title: `Карта: ${input.card?.name ?? 'без карты'}`,
      payload: {
        actorId: input.actorId,
        actorName: input.actorName,
        cardId: input.card?.id ?? null,
        cardName: input.card?.name ?? null
      }
    };
  }

  if (input.kind === 'resourceChange') {
    return {
      ...common,
      kind: 'resourceChange',
      title: `${resourceLabel(input.resource)} ${input.resourceDelta > 0 ? '+' : ''}${input.resourceDelta}`,
      payload: {
        actorId: input.actorId,
        actorName: input.actorName,
        resource: input.resource,
        delta: input.resourceDelta
      }
    };
  }

  return {
    ...common,
    kind: 'actionRoll',
    title: `Бросок: ${traitLabel(input.trait)} против ${input.difficulty}`,
    payload: {
      actorId: input.actorId,
      actorName: input.actorName,
      trait: input.trait,
      difficulty: input.difficulty
    }
  };
}

export function resourceLabel(resource: 'hope' | 'hp' | 'stress' | 'armor'): string {
  const labels = {
    hope: 'Надежда',
    hp: 'Раны',
    stress: 'Стресс',
    armor: 'Броня'
  };
  return labels[resource];
}

export function openWorkspace(workspace: 'combat' | 'cards'): void {
  window.dispatchEvent(new CustomEvent('daggerheart-play:open-workspace', { detail: { workspace } }));
}

export function openWorkspaceInNewTab(workspace: 'combat' | 'cards'): void {
  if (typeof window === 'undefined') return;
  const basePath = inferBasePathFromWorkspacePath(window.location.pathname)
    .replace(/\/tools\/(?:cards|combat)\/?$/, '')
    .replace(/\/$/, '');
  const route = workspace === 'cards' ? '/tools/cards' : '/tools/combat';
  const url = new URL(`${basePath}${route}`, window.location.origin);
  window.open(url.toString(), '_blank', 'noopener,noreferrer');
}

export function openGameTable(): void {
  window.dispatchEvent(new CustomEvent('daggerheart-play:open-workspace', { detail: { workspace: 'play' } }));
}

export function clampRollConfirmPosition(x: number, y: number, size: { width?: number; height?: number } = {}): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y };
  const width = size.width ?? 354;
  const height = size.height ?? 360;
  return {
    x: Math.min(Math.max(12, x), Math.max(12, window.innerWidth - width - 12)),
    y: Math.min(Math.max(72, y), Math.max(72, window.innerHeight - height - 18))
  };
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}
