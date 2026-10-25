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
    unifiedRollDraftService.request({
      actor: { key: `adversary:${adversary.id}`, id: adversary.id, name: adversary.name, kind: 'adversary' },
      mode: 'gmAttack',
      title: adversary.standardAttack.name,
      formula: '1d20',
      attackModifier: adversary.attackModifier,
      damage: { formula: adversary.standardAttack.damage, damageType: normalizeDamageType(adversary.standardAttack.damageType) },
      notes: `Атака Мастера: ${adversary.standardAttack.name}`
    });
    onClose();
  }, []);
  return null;
}
