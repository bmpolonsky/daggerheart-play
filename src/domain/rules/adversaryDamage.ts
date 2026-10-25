import type { Adversary } from './types';

type DamageTarget = Pick<Adversary, 'id' | 'hp' | 'thresholds'>;
export interface AdversaryDamagePlan {
  valid: true;
  actorId: string;
  amount: number;
  major: number;
  severe: number;
  markedBefore: number;
  markedAfter: number;
  hpMax: number;
  wounds: number;
  appliedWounds: number;
}
export type AdversaryDamagePreview = AdversaryDamagePlan | { valid: false; reason: string };

/** The GM supplies damage after resolving special features/resistance manually.
 * This helper only compares that amount with this adversary's own thresholds. */
export function previewAdversaryDamage(target: DamageTarget, amount: number | null): AdversaryDamagePreview {
  if (amount === null) return { valid: false, reason: 'Введите полученный урон после всех поправок.' };
  if (!Number.isSafeInteger(amount) || amount < 0) return { valid: false, reason: 'Урон должен быть целым неотрицательным числом.' };
  const { major, severe } = target.thresholds;
  if (![major, severe].every(value => Number.isSafeInteger(value) && value >= 0) || severe < major) {
    return { valid: false, reason: 'Проверьте пороги противника перед применением урона.' };
  }
  const wounds = amount === 0 ? 0 : amount >= severe ? 3 : amount >= major ? 2 : 1;
  const markedAfter = Math.min(target.hp.max, target.hp.marked + wounds);
  return { valid: true, actorId: target.id, amount, major, severe, markedBefore: target.hp.marked,
    markedAfter, hpMax: target.hp.max, wounds, appliedWounds: markedAfter - target.hp.marked };
}

export function matchesAdversaryDamageBasis(target: DamageTarget, plan: AdversaryDamagePlan): boolean {
  return target.id === plan.actorId && target.hp.marked === plan.markedBefore && target.hp.max === plan.hpMax
    && target.thresholds.major === plan.major && target.thresholds.severe === plan.severe;
}
