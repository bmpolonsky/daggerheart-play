import { scaleWeaponFormulaByProficiency } from '../domain/rules/diceFormula';
import type { ActionComposerRollOptions } from '../domain/rules/actionComposer';
import type { DamageType, DiceVisualTone, RollPublication, TraitId } from '../domain/rules/types';
import type { PlayerRollIntent } from './SyncService';
import type { DiceService } from './DiceService';
import type { P2PSessionService } from './P2PSessionService';
import type { UnifiedRollDraft } from '../domain/rules/unifiedRollDraft';

export interface RollActor {
  id: string | null;
  name: string;
}

export type PreparedDiceRoll = {
  kind: 'manualDice' | 'damage';
  title: string;
  formula: string;
  damageType?: DamageType;
  notes?: string;
  source?: UnifiedRollDraft['source'];
  quantity?: UnifiedRollDraft['quantity'];
  branches?: UnifiedRollDraft['branches'];
  selectedBranchId?: string;
  hint?: string;
};

export interface CharacterActionDraft {
  kind: string;
  title: string;
  trait?: TraitId | null;
  difficulty?: number;
  notes?: string;
}

/** Shared execution for sheet, feed and preview. Preparing a draft never rolls. */
export class CharacterRollService {
  constructor(private dependencies: {
    dice: Pick<DiceService, 'rollAction' | 'rollReaction' | 'rollDamage' | 'rollManualDice'>;
    session: Pick<P2PSessionService, 'isConnectedPlayerSession' | 'submitPlayerRollIntent'>;
    autoApplyConsequences: () => boolean;
  }) {}

  action(actor: RollActor, draft: CharacterActionDraft, options: ActionComposerRollOptions, rollType: 'action' | 'reaction', publication: RollPublication, role: 'player' | 'gm'): void {
    this.execute(actor, {
      type: 'duality', rollType, trait: draft.trait, difficulty: draft.difficulty ?? 0,
      ...options, notes: draft.notes
    }, publication, role);
  }

  weaponDamage(actor: RollActor, draft: { kind: string; title: string; damageFormula: string; damageType: string }, proficiency: number, publication: RollPublication, role: 'player' | 'gm'): void {
    this.execute(actor, {
      type: 'damage',
      formula: scaleWeaponFormulaByProficiency(draft.damageFormula, proficiency),
      damageType: draft.damageType as DamageType,
      notes: `${draft.kind === 'companion' ? 'Компаньон' : 'Оружие'}: ${draft.title}`
    }, publication, role);
  }

  dice(actor: RollActor, draft: PreparedDiceRoll, publication: RollPublication, role: 'player' | 'gm', critical = false): void {
    this.execute(actor, draft.kind === 'damage'
      ? { type: 'damage', formula: draft.formula, damageType: draft.damageType, notes: draft.notes, critical }
      : { type: 'manualDice', formula: draft.formula, label: draft.title, notes: draft.notes }, publication, role);
  }

  manual(actor: RollActor, input: { formula: string; label?: string; advantageCount?: number; disadvantageCount?: number; diceTones?: DiceVisualTone[] }, publication: RollPublication, role: 'player' | 'gm'): void {
    this.execute(actor, { type: 'manualDice', ...input }, publication, role);
  }

  private execute(actor: RollActor, intent: PlayerRollIntent, publication: RollPublication, role: 'player' | 'gm'): void {
    if (role === 'player' && actor.id && this.dependencies.session.isConnectedPlayerSession()) {
      void this.dependencies.session.submitPlayerRollIntent({ actorId: actor.id, actorName: actor.name, publication, intent });
      return;
    }
    const actorContext = { actorId: actor.id, actorName: actor.name, publication };
    if (intent.type === 'duality') {
      const { type: _type, rollType, ...options } = intent;
      if (rollType === 'reaction') this.dependencies.dice.rollReaction({ ...actorContext, ...options });
      else this.dependencies.dice.rollAction({ ...actorContext, ...options, applyConsequences: this.dependencies.autoApplyConsequences() });
    } else if (intent.type === 'damage') {
      this.dependencies.dice.rollDamage({ ...actorContext, ...intent });
    } else {
      this.dependencies.dice.rollManualDice({ ...actorContext, ...intent });
    }
  }
}
