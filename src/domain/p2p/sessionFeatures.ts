import type { PersistedState } from '../rules/types';

/** Ephemeral GM snapshot metadata. Never hydrated into game stores or imported
 * as permission; it describes the current room implementation's wire support. */
export interface SessionFeatures {
  gmPeerId: string;
  extraActionDiceV1: true;
}

export function readSessionFeatures(value: unknown): SessionFeatures | null {
  if (!value || typeof value !== 'object') return null;
  const features = (value as { sessionFeatures?: unknown }).sessionFeatures;
  if (!features || typeof features !== 'object') return null;
  const input = features as Partial<SessionFeatures>;
  return typeof input.gmPeerId === 'string' && input.gmPeerId.length > 0 && input.gmPeerId.length <= 256
    && input.extraActionDiceV1 === true ? { gmPeerId: input.gmPeerId, extraActionDiceV1: true } : null;
}

export function withSessionFeatures(snapshot: PersistedState, gmPeerId: string): PersistedState & { sessionFeatures: SessionFeatures } {
  return { ...snapshot, sessionFeatures: { gmPeerId, extraActionDiceV1: true } };
}
