import { charactersStore, encounterStore, gameStore } from '../stores/gameStores';
import { unifiedRollDraftError, unifiedRollPaysForExperiences, type UnifiedRollDraft } from '../domain/rules/unifiedRollDraft';
import type { RollPublication } from '../domain/rules/types';
import type { DiceService } from './DiceService';
import type { P2PSessionService } from './P2PSessionService';
import type { PlayerRollIntent } from './SyncService';
import { normalizeExtraDice } from '../domain/rules/extraDice';

export interface UnifiedRollExecutionResult { ok: boolean; error?: string; rollId?: string }
export interface EventRollDelegate {
  error(draft: UnifiedRollDraft, role: 'gm' | 'player', allowedActorIds: readonly string[]): string | null;
  execute(draft: UnifiedRollDraft, role: 'gm' | 'player', publication: RollPublication, allowedActorIds: readonly string[]): UnifiedRollExecutionResult | Promise<UnifiedRollExecutionResult>;
}

export class UnifiedRollExecutionService {
  constructor(private dice: Pick<DiceService, 'rollAction' | 'rollReaction' | 'rollDamage' | 'rollManualDice' | 'rollGmAttackCheck'>,
    private session: Pick<P2PSessionService, 'isConnectedPlayerSession' | 'submitPlayerRollIntent' | 'session$'> & { supportsExtraActionDice?: () => boolean }, private currentScope: () => string, private eventRolls?: EventRollDelegate) {}

  error(draft: UnifiedRollDraft, role: 'gm' | 'player', allowedActorIds: readonly string[]): string | null {
    if (draft.scopeKey !== this.currentScope()) return 'Игра или сессия изменилась. Подготовьте бросок заново.';
    const error = unifiedRollDraftError(draft);
    if (error) return error;
    if (normalizeExtraDice(draft.extraDice).length > 0 && role === 'player' && this.session.isConnectedPlayerSession() && !this.session.supportsExtraActionDice?.()) return 'Мастер не подтвердил поддержку дополнительных костей проверки. Обновите сессию мастера или явно выберите ручной бросок.';
    const session = this.session.session$.get();
    if (role === 'player' && session.role === 'player' && (!session.connected || session.status !== 'connected')) return 'Соединение с мастером ещё не готово. Бросок не выполнен локально.';
    const actor = draft.actor;
    if (role === 'player' && actor.id && !allowedActorIds.includes(actor.id)) return 'Этот персонаж больше не назначен вам. Подготовьте бросок заново.';
    if (actor.kind === 'character' && (!actor.id || !charactersStore.get().entities[actor.id])) return 'Персонаж этого броска больше недоступен.';
    if (actor.kind === 'adversary' && (!actor.id || !encounterStore.get().adversaries[actor.id])) return 'Противник этого броска больше недоступен.';
    if (actor.kind === 'environment' && (!actor.id || !encounterStore.get().environments[actor.id])) return 'Окружение этого броска больше недоступно.';
    if (draft.eventContext) {
      if (!this.eventRolls) return 'Обработка событийного броска недоступна. Бросок не выполнен.';
      return this.eventRolls.error(draft, role, allowedActorIds);
    }
    if ((draft.mode === 'action' || draft.mode === 'reaction') && actor.kind !== 'character' && actor.id) return 'Проверка Дуальности требует персонажа. Выберите атаку противника или ручной бросок.';
    if (draft.mode === 'gmAttack' && (role !== 'gm' || actor.kind !== 'adversary')) return 'Атака противника доступна мастеру от лица противника.';
    if (draft.mode === 'action' || draft.mode === 'reaction') {
      const character = actor.id ? charactersStore.get().entities[actor.id] : null;
      if (draft.source?.isCompanion === true && !character?.companion) return 'Компаньон этого броска больше недоступен.';
      const experiences = draft.source?.isCompanion === true ? character?.companion?.experiences : character?.experiences;
      const selected = experiences?.filter((item) => draft.experienceIds.includes(item.id)) ?? [];
      if (unifiedRollPaysForExperiences(draft) && selected.length > (character?.hope.value ?? 0)) return 'Недостаточно Надежды для выбранных Опытов.';
    }
    if (draft.mode === 'gmAttack') {
      const adversary = actor.id ? encounterStore.get().adversaries[actor.id] : null;
      const selected = adversary?.experiences.filter((item) => draft.experienceIds.includes(item.id)) ?? [];
      if (draft.spendHopeForExperiences && selected.length > gameStore.get().fear) return 'Недостаточно Страха для выбранных Опытов.';
    }
    return null;
  }

  async execute(draft: UnifiedRollDraft, role: 'gm' | 'player', publication: RollPublication, allowedActorIds: readonly string[]): Promise<UnifiedRollExecutionResult> {
    const error = this.error(draft, role, allowedActorIds);
    if (error) return { ok: false, error };
    if (draft.eventContext) {
      if (!this.eventRolls) return { ok: false, error: 'Обработка событийного броска недоступна. Бросок не выполнен.' };
      try { return await this.eventRolls.execute(draft, role, publication, allowedActorIds); }
      catch { return { ok: false, error: 'Не удалось применить событийный бросок. Обычный бросок не выполнен.' }; }
    }
    const actor = { actorId: draft.actor.id, actorName: draft.actor.name, publication };
    const extraDice = normalizeExtraDice(draft.extraDice);
    const formula = draft.manualModifier ? `${draft.formula}${draft.manualModifier > 0 ? '+' : ''}${draft.manualModifier}` : draft.formula;
    let intent: PlayerRollIntent;
    if (draft.mode === 'action' || draft.mode === 'reaction') {
      intent = { type: 'duality', rollType: draft.mode, trait: draft.trait, difficulty: draft.difficulty ?? 0,
        manualModifier: draft.manualModifier, advantageCount: draft.advantageCount, disadvantageCount: draft.disadvantageCount,
        ...(extraDice.length ? { extraDice } : {}),
        experienceIds: draft.experienceIds, spendHopeForExperiences: unifiedRollPaysForExperiences(draft), notes: draft.notes };
    } else if (draft.mode === 'damage') {
      intent = { type: 'damage', formula, critical: draft.critical, damageType: draft.damageType, notes: draft.notes };
    } else {
      intent = { type: 'manualDice', formula, label: draft.title, notes: draft.notes, advantageCount: draft.advantageCount, disadvantageCount: draft.disadvantageCount };
    }
    if (role === 'player' && draft.actor.id && this.session.isConnectedPlayerSession()) {
      try {
        const ok = await this.session.submitPlayerRollIntent({ ...actor, actorId: draft.actor.id, intent });
        return ok ? { ok } : { ok: false, error: this.session.session$.get().message || 'Бросок не принят мастером.' };
      } catch { return { ok: false, error: 'Не удалось отправить бросок мастеру. Локальный бросок не выполнен.' }; }
    }
    try {
      if (draft.mode === 'gmAttack') {
        const result = this.dice.rollGmAttackCheck({ adversaryId: draft.actor.id!, advantageCount: draft.advantageCount, disadvantageCount: draft.disadvantageCount,
          ...(extraDice.length ? { extraDice } : {}),
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
