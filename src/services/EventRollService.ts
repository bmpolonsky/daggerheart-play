import { unifiedRollExecutionFormula } from '../domain/rules/unifiedRollPresentation';
import { characterLevelRank } from '../domain/rules/levelUp';
import { restMoveOperation, restMoveRequiresRoll } from '../domain/rules/rest';
import { riskItAllOutcome } from '../domain/rules/deathMoves';
import { isSharedTagTeam, teamworkParticipantRoleRevision, teamworkParticipantRollTrait } from '../domain/rules/teamwork';
import { eventRollCompatibility, type EventRollContext, type EventRollRequest } from '../domain/rules/eventRoll';
import { unifiedRollDraftError, unifiedRollPaysForExperiences, type UnifiedRollDraft, type UnifiedRollDraftInput } from '../domain/rules/unifiedRollDraft';
import type { ActionRollEntry, ManualDiceRollEntry, ReactionRollEntry, RollPublication } from '../domain/rules/types';
import type { CharacterService } from './CharacterService';
import type { DiceService } from './DiceService';
import type { FeedService } from './FeedService';
import type { P2PSessionService } from './P2PSessionService';
import type { TabletopService } from './TabletopService';

export interface EventRollDependencies {
  diceService: Pick<DiceService, 'rollAction' | 'rollReaction' | 'rollManualDice'>;
  characterService: Pick<CharacterService, 'getCharacter' | 'chooseAvoidDeath' | 'chooseRiskItAll'>;
  feedService: Pick<FeedService, 'feed$' | 'updateDeathMove' | 'recordTeamworkParticipantResult'>;
  tabletopService: Pick<TabletopService, 'resolveRestMove'>;
  session: Pick<P2PSessionService, 'isConnectedPlayerSession' | 'session$'>;
  currentScopeKey: () => string;
  autoApplyRollConsequences?: () => boolean;
}
export type PreparedEventRoll = { ok: true; input: UnifiedRollDraftInput } | { ok: false; error: string };
export interface EventRollExecutionResult { ok: boolean; error?: string; rollId?: string }

function signature(value: unknown): string { return JSON.stringify(value); }
function contextSignature(context: EventRollContext): string {
  const { manualOverride: _override, ...identity } = context;
  return signature(Object.entries(identity).sort(([left], [right]) => left.localeCompare(right)));
}
function requestFor(context: EventRollContext): EventRollRequest {
  if (context.kind === 'rest') return { kind: 'rest', entryId: context.entryId, actorId: context.actorId, choiceId: context.choiceId };
  if (context.kind === 'death') return { kind: 'death', entryId: context.entryId, actorId: context.actorId, deathChoice: context.deathChoice };
  return { kind: 'teamwork', entryId: context.entryId, actorId: context.actorId, trait: context.trait };
}

/** Local GM/offline event transaction: validate, one roll, then commit that roll. */
export class EventRollService {
  private active = new Set<string>();
  private rolled = new Map<string, { rollId: string; committed: boolean }>();
  constructor(private dependencies: EventRollDependencies) {}

  prepare(request: EventRollRequest, role: 'gm' | 'player'): PreparedEventRoll {
    if (role === 'player' && this.dependencies.session.isConnectedPlayerSession()) return { ok: false, error: 'Отправьте выбор мастеру. Связанный бросок применяет мастер.' };
    const character = this.dependencies.characterService.getCharacter(request.actorId);
    if (!character) return { ok: false, error: 'Персонаж события больше недоступен.' };
    const scopeKey = this.dependencies.currentScopeKey();
    const actor = { key: `character:${character.id}`, id: character.id, name: character.name, kind: 'character' as const };
    const feed = this.dependencies.feedService.feed$.get();
    if (request.kind === 'rest') {
      const entry = feed.find((entry) => entry.type === 'rest' && (entry.id === request.entryId || entry.rest.id === request.entryId));
      if (!entry || entry.type !== 'rest' || entry.rest.status === 'resolved' || entry.rest.status === 'cancelled') return { ok: false, error: 'Отдых завершён, отменён или больше недоступен.' };
      const participant = entry.rest.participants.find((participant) => participant.actorId === character.id);
      const choice = participant?.choices.find((choice) => choice.id === request.choiceId);
      if (!choice || choice.status === 'resolved' || !restMoveRequiresRoll(choice.label)) return { ok: false, error: 'Ход отдыха уже применён, изменён или не требует броска.' };
      const count = Math.max(1, Math.trunc(choice.count));
      const rank = characterLevelRank(character.level);
      const formula = `${count}d4+${count * rank}`;
      const eventContext: EventRollContext = { kind: 'rest', scopeKey, entryId: entry.id, actorId: character.id, choiceId: choice.id, formula,
        fingerprint: signature([entry.rest.restType, choice.id, choice.label, choice.count, choice.status, rank, restMoveOperation(choice.label)]) };
      return { ok: true, input: { actor, scopeKey, mode: 'manual', formula, title: choice.label, eventContext,
        source: { label: 'Отдых' }, hint: 'Результат применится к выбранному ходу отдыха один раз. Изменённый итог требует явного разрешения мастера.' } };
    }
    if (request.kind === 'death') {
      const entry = feed.find((entry) => entry.type === 'deathMove' && (entry.id === request.entryId || entry.deathMove.id === request.entryId));
      if (!entry || entry.type !== 'deathMove' || entry.deathMove.status === 'resolved' || entry.deathMove.status === 'cancelled') return { ok: false, error: 'Предсмертный ход уже завершён, отменён или больше недоступен.' };
      if (entry.deathMove.actor.actorId !== character.id || (entry.deathMove.choice && entry.deathMove.choice !== request.deathChoice)) return { ok: false, error: 'Исполнитель или выбор предсмертного хода изменился.' };
      const eventContext: EventRollContext = { kind: 'death', scopeKey, entryId: entry.id, actorId: character.id, deathChoice: request.deathChoice,
        fingerprint: signature([entry.deathMove.status, entry.deathMove.choice ?? null]) };
      return { ok: true, input: { actor, scopeKey, mode: 'manual', formula: request.deathChoice === 'avoidDeath' ? '1d12' : '2d12',
        title: request.deathChoice === 'avoidDeath' ? 'Избежать смерти' : 'Рискнуть всем', eventContext, source: { label: 'Предсмертный ход' },
        hint: 'Предсмертный ход связан с этим персонажем и использует только указанный набор d12 без модификаторов.' } };
    }
    const entry = feed.find((entry) => entry.type === 'teamwork' && (entry.id === request.entryId || entry.teamwork.id === request.entryId));
    if (!entry || entry.type !== 'teamwork' || entry.teamwork.status === 'resolved' || entry.teamwork.status === 'cancelled') return { ok: false, error: 'Совместный бросок завершён, отменён или больше недоступен.' };
    const participant = entry.teamwork.participants.find((participant) => participant.actorId === character.id);
    if (!participant || participant.result) return { ok: false, error: 'Участник недоступен или его результат уже записан.' };
    if (isSharedTagTeam(entry.teamwork) && entry.teamwork.participants.length !== 2) return { ok: false, error: 'Выберите двух участников командного броска.' };
    const trait = teamworkParticipantRollTrait(participant, request.trait);
    const supports = entry.teamwork.participants.filter((participant) => participant.role === 'support');
    const supportModifier = entry.teamwork.kind === 'groupAction' && participant.role === 'leader'
      ? supports.reduce((sum, participant) => sum + (participant.result ? participant.result.success ? 1 : -1 : 0), 0) : 0;
    const rollType = participant.role === 'support' ? 'reaction' : 'action';
    const eventContext: EventRollContext = { kind: 'teamwork', scopeKey, entryId: entry.id, actorId: character.id,
      teamworkRole: participant.role, teamworkRevision: teamworkParticipantRoleRevision(participant), rollType, trait, difficulty: entry.teamwork.difficulty, supportModifier,
      fingerprint: signature([entry.teamwork.kind, participant.role, entry.teamwork.difficulty, participant.pendingRoll ?? null, trait,
        participant.role === 'leader' ? supports.map((support) => [support.actorId, support.result?.rollId ?? null, support.result?.success ?? null]) : []]) };
    return { ok: true, input: { actor, scopeKey, mode: rollType, formula: '2d12', trait, difficulty: entry.teamwork.difficulty,
      manualModifier: supportModifier, spendHopeForExperiences: true, eventContext, title: entry.title,
      notes: `${entry.title}: ${rollType === 'reaction' ? 'бросок реакции' : 'бросок действия'}`, source: { label: entry.teamwork.kind === 'groupAction' ? 'Групповой бросок' : 'Командный бросок' },
      hint: isSharedTagTeam(entry.teamwork) ? 'Это кандидат: общий результат выбирается после обоих бросков.' : 'Результат запишется выбранному участнику. Ручной итог требует отдельного подтверждения мастера.' } };
  }

  error(draft: UnifiedRollDraft, role: 'gm' | 'player', allowedActorIds: readonly string[]): string | null {
    const context = draft.eventContext;
    if (!context) return 'Нет связанного события.';
    if (draft.scopeKey !== this.dependencies.currentScopeKey() || context.scopeKey !== draft.scopeKey) return 'Игра или сессия изменилась. Подготовьте связанный бросок заново.';
    if (role === 'player' && (!allowedActorIds.includes(context.actorId) || this.dependencies.session.isConnectedPlayerSession())) return 'Связанный бросок применяет мастер; игрок отправляет выбор своего персонажа.';
    const session = this.dependencies.session.session$.get();
    if (role === 'player' && session.role === 'player' && (!session.connected || session.status !== 'connected')) return 'Соединение с мастером ещё не готово. Событие не применяется локально.';
    const previousRoll = this.rolled.get(this.key(context));
    if (previousRoll) return previousRoll.committed ? 'Этот результат уже применён к событию.' : 'Для события уже записан бросок, который не удалось применить. Новый бросок автоматически не выполняется.';
    const current = this.prepare(requestFor(context), role);
    if (!current.ok) return current.error;
    if (!current.input.eventContext || contextSignature(current.input.eventContext) !== contextSignature(context)) return 'Событие, роль, выбор или заявка изменились. Подготовьте бросок заново.';
    const compatibility = eventRollCompatibility(context, draft);
    if (compatibility.error) return compatibility.error;
    if (compatibility.manualOverrideRequired && (role !== 'gm' || context.manualOverride !== true)) return context.kind === 'teamwork'
      ? 'Ручной итог командного броска требует явного подтверждения мастера.' : 'Изменённый итог восстановления требует явного подтверждения мастера.';
    const genericError = unifiedRollDraftError(draft);
    if (genericError) return genericError;
    const character = this.dependencies.characterService.getCharacter(context.actorId)!;
    if (draft.mode === 'action' || draft.mode === 'reaction') {
      const selected = character.experiences.filter((experience) => draft.experienceIds.includes(experience.id));
      if (unifiedRollPaysForExperiences(draft) && selected.length > character.hope.value) return 'Недостаточно Надежды для выбранных Опытов.';
    }
    return null;
  }

  execute(draft: UnifiedRollDraft, role: 'gm' | 'player', publication: RollPublication, allowedActorIds: readonly string[]): EventRollExecutionResult {
    const error = this.error(draft, role, allowedActorIds);
    if (error) return { ok: false, error };
    const context = draft.eventContext!;
    const key = this.key(context);
    if (this.active.has(key)) return { ok: false, error: 'Этот бросок уже применяется.' };
    this.active.add(key);
    try {
      // No await between this preflight and commit: another browser command cannot
      // spend resources or close the event in the middle of this local operation.
      const character = this.dependencies.characterService.getCharacter(context.actorId)!;
      const actor = { actorId: character.id, actorName: character.name, publication };
      if (context.kind === 'teamwork' && draft.mode !== 'manual') {
        const request = { ...actor, trait: context.trait, difficulty: context.difficulty, manualModifier: draft.manualModifier,
          extraDice: draft.extraDice,
          advantageCount: draft.advantageCount, disadvantageCount: draft.disadvantageCount,
          experienceIds: draft.experienceIds, spendHopeForExperiences: unifiedRollPaysForExperiences(draft), notes: draft.notes };
        const roll = context.rollType === 'reaction' ? this.dependencies.diceService.rollReaction(request)
          : this.dependencies.diceService.rollAction({ ...request, applyConsequences: this.isSharedCandidate(context.entryId) ? false : this.dependencies.autoApplyRollConsequences?.() ?? false });
        this.rolled.set(key, { rollId: roll.id, committed: false });
        if (!this.canCommit(context, role)) return { ok: false, error: 'Событие изменилось после броска. Результат записан, повторного броска нет.', rollId: roll.id };
        return this.commitTeamwork(context, roll);
      }
      const formula = unifiedRollExecutionFormula(draft);
      const roll = this.dependencies.diceService.rollManualDice({ ...actor, formula, label: context.manualOverride ? `Ручной итог: ${draft.title}` : draft.title,
        advantageCount: draft.advantageCount, disadvantageCount: draft.disadvantageCount,
        diceTones: context.kind === 'death' ? context.deathChoice === 'avoidDeath' ? ['hope'] : ['hope', 'fear'] : undefined, notes: draft.notes });
      this.rolled.set(key, { rollId: roll.id, committed: false });
      if (!this.canCommit(context, role)) return { ok: false, error: 'Событие изменилось после броска. Результат записан, повторного броска нет.', rollId: roll.id };
      let committed = false;
      if (context.kind === 'rest') {
        committed = this.dependencies.tabletopService.resolveRestMove(context.entryId, context.actorId, context.choiceId,
          { rolled: roll, manualOverride: context.manualOverride === true }).applied;
      } else if (context.kind === 'death') committed = this.commitDeath(context, roll);
      else return this.commitTeamwork(context, roll);
      if (!committed) return { ok: false, error: 'Бросок записан, но событие изменилось до применения. Новый бросок автоматически не выполняется.', rollId: roll.id };
      this.rolled.set(key, { rollId: roll.id, committed: true });
      return { ok: true, rollId: roll.id };
    } catch (caught) { return { ok: false, error: caught instanceof Error ? caught.message : 'Не удалось применить связанный бросок.' }; }
    finally { this.active.delete(key); }
  }

  private canCommit(context: EventRollContext, role: 'gm' | 'player'): boolean {
    const current = this.prepare(requestFor(context), role);
    return current.ok && Boolean(current.input.eventContext) && contextSignature(current.input.eventContext!) === contextSignature(context);
  }
  private isSharedCandidate(entryId: string): boolean {
    return this.dependencies.feedService.feed$.get().some(entry => entry.type === 'teamwork' && entry.id === entryId && isSharedTagTeam(entry.teamwork));
  }
  private key(context: EventRollContext): string {
    return `${context.scopeKey}:${context.kind}:${context.entryId}:${context.actorId}:${context.kind === 'rest' ? context.choiceId : context.kind === 'death' ? context.deathChoice : `participant:${context.teamworkRole}:${context.teamworkRevision ?? 0}`}`;
  }
  private commitTeamwork(context: Extract<EventRollContext, { kind: 'teamwork' }>, roll: ActionRollEntry | ReactionRollEntry | ManualDiceRollEntry): EventRollExecutionResult {
    const manual = roll.type === 'manual';
    const result = manual ? {
      rollId: roll.id, rollType: context.rollType, total: roll.total, difficulty: context.difficulty,
      success: roll.total >= context.difficulty, note: `Ручной итог: ${roll.actorName}: ${roll.total}`
    } : {
      rollId: roll.id, rollType: context.rollType, trait: roll.trait, total: roll.total, difficulty: roll.difficulty,
      success: roll.success, outcome: roll.outcome, consequencesApplied: roll.consequenceApplied, note: `${roll.actorName}: ${roll.total} ${roll.success ? 'успех' : 'провал'}`
    };
    const committed = this.dependencies.feedService.recordTeamworkParticipantResult(context.entryId, context.actorId, result);
    if (!committed) return { ok: false, error: 'Бросок записан, но результат участника уже недоступен.', rollId: roll.id };
    this.rolled.set(this.key(context), { rollId: roll.id, committed: true });
    return { ok: true, rollId: roll.id };
  }
  private commitDeath(context: Extract<EventRollContext, { kind: 'death' }>, roll: ManualDiceRollEntry): boolean {
    const values = roll.terms.flatMap((term) => 'rolls' in term ? term.rolls : []);
    const expectedCount = context.deathChoice === 'avoidDeath' ? 1 : 2;
    if (values.length !== expectedCount || values.some((value) => !Number.isInteger(value) || value < 1 || value > 12)) return false;
    const result = context.deathChoice === 'avoidDeath'
      ? this.dependencies.characterService.chooseAvoidDeath(context.actorId, values[0])
      : this.dependencies.characterService.chooseRiskItAll(context.actorId, { kind: 'riskItAll', hopeDie: values[0], fearDie: values[1], outcome: riskItAllOutcome(values[0], values[1]) });
    if (!result) return false;
    return Boolean(this.dependencies.feedService.updateDeathMove(context.entryId, { status: 'resolved', choice: context.deathChoice, roll: result, rollId: roll.id }, { actorId: context.actorId }));
  }
}
