import { isCombatBuilderEncounterSnapshot, type CombatBuilderEncounterSnapshot } from '../combatBuilderBridge/index';
import { normalizeCardCreatorCustomCardPayload, type CardCreatorCustomCardPayload, type NormalizedCardCreatorCustomCard } from '../cardCreatorBridge/index';

export type ToolBridgeSource = 'card-creator' | 'combat-builder';
export type ToolBridgeTarget = 'tabletop';
export type ToolBridgeEventType = 'card-creator/custom-card.export' | 'combat-builder/encounter.export';

export interface ToolBridgeEventBase<TType extends ToolBridgeEventType, TSource extends ToolBridgeSource, TPayload> {
  version: 1;
  source: TSource;
  target: ToolBridgeTarget;
  type: TType;
  payload: TPayload;
  createdAt?: string;
  correlationId?: string;
}

export type CardCreatorBridgeEvent = ToolBridgeEventBase<'card-creator/custom-card.export', 'card-creator', CardCreatorCustomCardPayload>;
export type CombatBuilderBridgeEvent = ToolBridgeEventBase<'combat-builder/encounter.export', 'combat-builder', CombatBuilderEncounterSnapshot>;
export type ToolBridgeEvent = CardCreatorBridgeEvent | CombatBuilderBridgeEvent;

export interface NormalizedCardCreatorBridgeEvent extends Omit<CardCreatorBridgeEvent, 'payload'> {
  payload: NormalizedCardCreatorCustomCard;
}

export type NormalizedCombatBuilderBridgeEvent = CombatBuilderBridgeEvent;
export type NormalizedToolBridgeEvent = NormalizedCardCreatorBridgeEvent | NormalizedCombatBuilderBridgeEvent;

export interface ToolBridgeNormalizeResult {
  ok: boolean;
  event: NormalizedToolBridgeEvent | null;
  warnings: string[];
}

export function createCardCreatorBridgeEvent(payload: CardCreatorCustomCardPayload, input?: Partial<Omit<CardCreatorBridgeEvent, 'version' | 'source' | 'target' | 'type' | 'payload'>>): CardCreatorBridgeEvent {
  return {
    version: 1,
    source: 'card-creator',
    target: 'tabletop',
    type: 'card-creator/custom-card.export',
    payload,
    ...input
  };
}

export function createCombatBuilderBridgeEvent(payload: CombatBuilderEncounterSnapshot, input?: Partial<Omit<CombatBuilderBridgeEvent, 'version' | 'source' | 'target' | 'type' | 'payload'>>): CombatBuilderBridgeEvent {
  return {
    version: 1,
    source: 'combat-builder',
    target: 'tabletop',
    type: 'combat-builder/encounter.export',
    payload,
    ...input
  };
}

export function isToolBridgeEvent(value: unknown): value is ToolBridgeEvent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ToolBridgeEvent>;
  return candidate.version === 1 &&
    candidate.target === 'tabletop' &&
    isKnownBridgeRoute(candidate.source, candidate.type) &&
    'payload' in candidate;
}

export function normalizeToolBridgeEvent(value: unknown): ToolBridgeNormalizeResult {
  if (!isToolBridgeEvent(value)) {
    return { ok: false, event: null, warnings: ['Событие Tool Bridge имеет неизвестный формат.'] };
  }

  if (value.type === 'combat-builder/encounter.export') {
    if (!isCombatBuilderEncounterSnapshot(value.payload)) {
      return { ok: false, event: null, warnings: ['Payload combat-builder не похож на snapshot боя.'] };
    }
    return { ok: true, event: value, warnings: [] };
  }

  const normalized = normalizeCardCreatorCustomCardPayload(value.payload);
  if (!normalized.card) {
    return { ok: false, event: null, warnings: normalized.warnings };
  }

  return {
    ok: normalized.ok,
    event: {
      ...value,
      payload: normalized.card
    },
    warnings: normalized.warnings
  };
}

function isKnownBridgeRoute(source: unknown, type: unknown): boolean {
  return (source === 'card-creator' && type === 'card-creator/custom-card.export') ||
    (source === 'combat-builder' && type === 'combat-builder/encounter.export');
}
