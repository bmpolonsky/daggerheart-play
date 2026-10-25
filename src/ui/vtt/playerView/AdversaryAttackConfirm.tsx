/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';
import type { PlayerViewAdversarySummary } from '../../../domain/tabletop/playerView';
import { normalizeDamageType } from '../../../domain/rules/diceFormula';
import type { RollPublication } from '../../../domain/rules/types';
import { unifiedRollDraftService } from '../../../services/UnifiedRollDraftService';

export interface AdversaryAttackRollOptions {
  advantageCount: number;
  disadvantageCount: number;
  experienceIds: string[];
  spendFearForExperiences: boolean;
  publication: RollPublication;
}

export function prefillAdversaryAttack(adversary: PlayerViewAdversarySummary): void {
  unifiedRollDraftService.request({
    actor: { key: `adversary:${adversary.id}`, id: adversary.id, name: adversary.name, kind: 'adversary' },
    mode: 'gmAttack',
    title: adversary.standardAttack.name,
    formula: '1d20',
    attackModifier: adversary.attackModifier,
    damage: { formula: adversary.standardAttack.damage, damageType: normalizeDamageType(adversary.standardAttack.damageType) },
    notes: `Атака Мастера: ${adversary.standardAttack.name}`
  });
}

export function prefillAdversaryDamage(adversary: PlayerViewAdversarySummary): void {
  unifiedRollDraftService.request({
    actor: { key: `adversary:${adversary.id}`, id: adversary.id, name: adversary.name, kind: 'adversary' },
    mode: 'damage',
    title: adversary.standardAttack.name,
    formula: adversary.standardAttack.damage,
    damageType: normalizeDamageType(adversary.standardAttack.damageType),
    manualModifier: 0,
    advantageCount: 0,
    disadvantageCount: 0,
    experienceIds: [],
    spendHopeForExperiences: false,
    critical: false,
    notes: `Урон атаки Мастера: ${adversary.standardAttack.name}`
  });
}

/** Legacy attack entry point, rendered by the unified bottom tray only. */
export function AdversaryAttackConfirm({ adversary, onClose }: {
  adversary: PlayerViewAdversarySummary;
  onAttack: (options: AdversaryAttackRollOptions) => void;
  onClose: () => void;
  onDamage: (options: { critical: boolean; publication: RollPublication }) => void;
}) {
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    prefillAdversaryAttack(adversary);
    onClose();
  }, []);
  return null;
}
