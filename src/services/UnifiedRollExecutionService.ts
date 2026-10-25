import { charactersStore, encounterStore, gameStore } from '../stores/gameStores';
import { unifiedRollDraftError, type UnifiedRollDraft } from '../domain/rules/unifiedRollDraft';
import type { RollPublication } from '../domain/rules/types';
import type { DiceService } from './DiceService';
import type { P2PSessionService } from './P2PSessionService';
import type { PlayerRollIntent } from './SyncService';

export class UnifiedRollExecutionService {
  constructor(private dice: DiceService, private session: P2PSessionService, private currentScope: () => string) {}

  error(draft: UnifiedRollDraft, role: 'gm' | 'player', allowedActorIds: readonly string[]): string | null {
    if (draft.scopeKey !== this.currentScope()) return 'Игра или сессия изменилась. Подготовьте бросок заново.';
    const error = unifiedRollDraftError(draft);
    if (error) return error;
    const actor = draft.actor;
    if (role === 'player' && actor.id && !allowedActorIds.includes(actor.id)) return 'Этот персонаж больше не назначен вам. Подготовьте бросок заново.';
    if (actor.kind === 'character' && (!actor.id || !charactersStore.get().entities[actor.id])) return 'Персонаж этого броска больше недоступен.';
    if (actor.kind === 'adversary' && (!actor.id || !encounterStore.get().adversaries[actor.id])) return 'Противник этого броска больше недоступен.';
    if (actor.kind === 'environment' && (!actor.id || !encounterStore.get().environments[actor.id])) return 'Окружение этого броска больше недоступно.';
    if ((draft.mode === 'action' || draft.mode === 'reaction') && actor.kind !== 'character' && actor.id) return 'Проверка Дуальности требует персонажа. Выберите атаку противника или ручной бросок.';
    if (draft.mode === 'gmAttack' && (role !== 'gm' || actor.kind !== 'adversary')) return 'Атака противника доступна мастеру от лица противника.';
    if (draft.mode === 'action' || draft.mode === 'reaction') {
      const character = actor.id ? charactersStore.get().entities[actor.id] : null;
      const experiences = draft.source?.label === 'Компаньон' ? character?.companion?.experiences : character?.experiences;
      const selected = experiences?.filter((item) => draft.experienceIds.includes(item.id)) ?? [];
      if (draft.spendHopeForExperiences && selected.length > (character?.hope.value ?? 0)) return 'Недостаточно Надежды для выбранных Опытов.';
    }
    if (draft.mode === 'gmAttack') {
      const adversary = actor.id ? encounterStore.get().adversaries[actor.id] : null;
      const selected = adversary?.experiences.filter((item) => draft.experienceIds.includes(item.id)) ?? [];
      if (draft.spendHopeForExperiences && selected.length > gameStore.get().fear) return 'Недостаточно Страха для выбранных Опытов.';
    }
    return null;
  }

  async execute(draft: UnifiedRollDraft, role: 'gm' | 'player', publication: RollPublication, allowedActorIds: readonly string[]): Promise<{ ok: boolean; error?: string }> {
    const error = this.error(draft, role, allowedActorIds);
    if (error) return { ok: false, error };
    const actor = { actorId: draft.actor.id, actorName: draft.actor.name, publication };
    const formula = draft.manualModifier ? `${draft.formula}${draft.manualModifier > 0 ? '+' : ''}${draft.manualModifier}` : draft.formula;
    let intent: PlayerRollIntent;
    if (draft.mode === 'action' || draft.mode === 'reaction') {
      intent = { type: 'duality', rollType: draft.mode, trait: draft.trait, difficulty: draft.difficulty ?? 0,
        manualModifier: draft.manualModifier, advantageCount: draft.advantageCount, disadvantageCount: draft.disadvantageCount,
        experienceIds: draft.experienceIds, spendHopeForExperiences: draft.spendHopeForExperiences, notes: draft.notes };
    } else if (draft.mode === 'damage') {
      intent = { type: 'damage', formula, critical: draft.critical, damageType: draft.damageType, notes: draft.notes };
    } else {
      intent = { type: 'manualDice', formula, label: draft.title, notes: draft.notes, advantageCount: draft.advantageCount, disadvantageCount: draft.disadvantageCount };
    }
    if (role === 'player' && draft.actor.id && this.session.isConnectedPlayerSession()) {
      const ok = await this.session.submitPlayerRollIntent({ ...actor, actorId: draft.actor.id, intent });
      return ok ? { ok } : { ok: false, error: this.session.session$.get().message || 'Бросок не принят мастером.' };
    }
    try {
      if (draft.mode === 'gmAttack') {
        const result = this.dice.rollGmAttackCheck({ adversaryId: draft.actor.id!, advantageCount: draft.advantageCount, disadvantageCount: draft.disadvantageCount,
          experienceIds: draft.experienceIds, spendFearForExperiences: draft.spendHopeForExperiences, manualModifier: draft.manualModifier, publication, notes: draft.notes });
        return result ? { ok: true } : { ok: false, error: 'Противник больше недоступен.' };
      }
      if (intent.type === 'duality') {
        const { type: _type, rollType, ...options } = intent;
        if (rollType === 'reaction') this.dice.rollReaction({ ...actor, ...options });
        else this.dice.rollAction({ ...actor, ...options, applyConsequences: gameStore.get().autoApplyRollConsequences });
      } else if (intent.type === 'damage') this.dice.rollDamage({ ...actor, ...intent });
      else this.dice.rollManualDice({ ...actor, ...intent });
      return { ok: true };
    } catch (caught) { return { ok: false, error: caught instanceof Error ? caught.message : 'Не удалось выполнить бросок.' }; }
  }
}
