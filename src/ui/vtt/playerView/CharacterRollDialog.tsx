/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';
import type { PlayerViewCharacterSummary } from '../../../domain/tabletop/playerView';
import { normalizeDamageType, scaleWeaponFormulaByProficiency } from '../../../domain/rules/diceFormula';
import type { UnifiedRollDraft, UnifiedRollActor } from '../../../domain/rules/unifiedRollDraft';
import type { PreparedDiceRoll, RollActor } from '../../../services/CharacterRollService';
import { unifiedRollDraftService } from '../../../services/UnifiedRollDraftService';
import { charactersStore, encounterStore } from '../../../stores/gameStores';
import type { PlayerRollDraft, TableViewRole } from './types';

export function prefillWeaponDamage(character: PlayerViewCharacterSummary, weapon: { name: string; damageFormula: string; damageType: string }, companion = false): void {
  unifiedRollDraftService.request({
    actor: { key: `character:${character.id}`, id: character.id, name: companion ? character.companion?.name ?? character.name : character.name, kind: 'character' },
    mode: 'damage', title: `${weapon.name}: Урон`, formula: scaleWeaponFormulaByProficiency(weapon.damageFormula, character.proficiency),
    damageType: normalizeDamageType(weapon.damageType), source: { label: companion ? 'Компаньон' : 'Оружие' },
    hint: 'Урон: без характеристики, Опытов и автоматической стоимости Надежды. Формулу можно изменить.'
  });
}

export function prefillCharacterRoll(character: PlayerViewCharacterSummary, draft: PlayerRollDraft): void {
    const companion = draft.kind === 'companion';
    const damage = draft.kind === 'weapon' || draft.kind === 'companion'
      ? { formula: scaleWeaponFormulaByProficiency(draft.damageFormula, character.proficiency), damageType: normalizeDamageType(draft.damageType) }
      : undefined;
    unifiedRollDraftService.request({
      actor: { key: `character:${character.id}`, id: character.id, name: companion ? character.companion?.name ?? character.name : character.name, kind: 'character' },
      mode: draft.rollType ?? 'action',
      title: draft.title,
      formula: '2d12',
      trait: draft.trait,
      difficulty: 'difficulty' in draft ? draft.difficulty : undefined,
      damage,
      notes: 'notes' in draft ? draft.notes : draft.kind === 'weapon' || companion ? `${companion ? 'Компаньон' : 'Оружие'}: ${draft.title}` : undefined,
      source: { cardId: draft.kind === 'card' ? draft.cardId : undefined, label: companion ? 'Компаньон' : draft.subtitle }
    });
}

/** Compatibility bridge: legacy callers now prefill the one bottom tray. */
export function CharacterRollDialog({ character, draft, onClose }: {
  character: PlayerViewCharacterSummary;
  draft: PlayerRollDraft;
  role: TableViewRole;
  embedded?: boolean;
  onTraitChange: (trait: PlayerRollDraft['trait']) => void;
  onClose: () => void;
}) {
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    prefillCharacterRoll(character, draft);
    onClose();
  }, []);
  return null;
}

export function prefillPreparedDiceRoll(actor: RollActor, draft: PreparedDiceRoll, role: TableViewRole): void {
    const context = draft as PreparedDiceRoll & Partial<Pick<UnifiedRollDraft, 'source' | 'quantity' | 'branches' | 'selectedBranchId' | 'hint'>>;
    unifiedRollDraftService.request({
      actor: capturedPreparedActor(actor, role),
      mode: draft.kind === 'damage' ? 'damage' : 'manual',
      title: draft.title,
      formula: draft.formula,
      damageType: draft.damageType,
      notes: draft.notes,
      source: context.source,
      quantity: context.quantity,
      branches: context.branches,
      selectedBranchId: context.selectedBranchId,
      hint: context.hint
    });
}

/** A prepared formula is never executed by opening it. */
export function PreparedDiceRollDialog({ actor, draft, role, onClose }: {
  actor: RollActor;
  draft: PreparedDiceRoll;
  role: TableViewRole;
  embedded?: boolean;
  onClose: () => void;
}) {
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    prefillPreparedDiceRoll(actor, draft, role);
    onClose();
  }, []);
  return null;
}

function capturedPreparedActor(actor: RollActor, role: TableViewRole): UnifiedRollActor {
  if (!actor.id) return { key: role === 'gm' ? 'gm' : 'unassigned', id: null, name: actor.name, kind: role === 'gm' ? 'gm' : 'unassigned' };
  const encounter = encounterStore.get();
  const kind = charactersStore.get().entities[actor.id] ? 'character'
    : encounter.adversaries[actor.id] ? 'adversary'
      : encounter.environments[actor.id] ? 'environment' : 'character';
  // Missing IDs stay captured; the submitter must reject them, never roll as GM.
  return { key: `${kind}:${actor.id}`, id: actor.id, name: actor.name, kind };
}
