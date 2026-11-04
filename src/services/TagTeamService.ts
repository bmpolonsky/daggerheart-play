import { batchStoreUpdates } from '../core/store/Store';
import { nowIso } from '../core/utils/date';
import { isSharedTagTeam, tagTeamReadyForSelection } from '../domain/rules/teamwork';
import type { ActionRollOutcome, TeamworkRollFeedEntry } from '../domain/rules/types';
import { charactersStore, feedStore, gameStore } from '../stores/gameStores';
import type { DiceService } from './DiceService';

type Selection = { entryId: string; actorId: string; rollId: string; scopeKey: string };
type Result = { ok: true; applied: boolean } | { ok: false; error: string };
const outcomes = new Set<ActionRollOutcome>(['criticalSuccess', 'successWithHope', 'successWithFear', 'failureWithHope', 'failureWithFear']);

/** Only the explicit GM choice resolves a new Tag Team; loading a feed never does. */
export class TagTeamService {
  private active = new Set<string>();
  constructor(private readonly dependencies: {
    dice: Pick<DiceService, 'applySharedActionConsequences'>;
    currentScopeKey: () => string;
    isConnectedPlayer: () => boolean;
  }) {}

  resolve(input: Selection, role: 'gm' | 'player'): Result {
    const error = this.authorize(input.scopeKey, role);
    if (error) return { ok: false, error };
    const entry = this.find(input.entryId);
    if (!entry || !isSharedTagTeam(entry.teamwork)) return { ok: false, error: 'Этот командный бросок не поддерживает общий выбор.' };
    const previous = entry.teamwork.sharedResult;
    if (previous) return previous.actorId === input.actorId && previous.result.rollId === input.rollId
      ? { ok: true, applied: false } : { ok: false, error: 'Для команды уже выбран другой результат.' };
    if (this.active.has(entry.id)) return { ok: false, error: 'Общий результат уже применяется.' };
    if (!tagTeamReadyForSelection(entry.teamwork)) return { ok: false, error: 'Сначала нужны оба броска участников.' };
    const participant = entry.teamwork.participants.find(actor => actor.actorId === input.actorId);
    if (!participant?.result || participant.result.rollId !== input.rollId) return { ok: false, error: 'Результат участника изменился. Выберите его заново.' };
    const results = entry.teamwork.participants.map(actor => actor.result!);
    if (new Set(results.map(result => result.rollId)).size !== 2 || results.some(result => result.rollType !== 'action'
      || !Number.isFinite(result.total) || result.difficulty !== entry.teamwork.difficulty || result.consequencesApplied === true
      || result.success !== (result.outcome === 'criticalSuccess' || result.total >= result.difficulty)
      || (result.outcome !== undefined && !outcomes.has(result.outcome)))) return { ok: false, error: 'Кандидаты общего броска некорректны или уже применены.' };
    const actorIds = entry.teamwork.participants.map(actor => actor.actorId);
    if (actorIds.some(id => !charactersStore.get().entities[id])) return { ok: false, error: 'Один из участников больше недоступен.' };
    const result = { ...participant.result };
    const automatic = gameStore.get().autoApplyRollConsequences && result.outcome !== undefined;
    const resolvedAt = nowIso();
    const next: TeamworkRollFeedEntry = { ...entry, teamwork: { ...entry.teamwork, status: 'resolved', resolvedAt,
      sharedResult: { actorId: participant.actorId, actorName: participant.actorName, result,
        consequences: automatic ? 'automatic' : 'manual', resolvedAt } } };
    const before = { characters: charactersStore.get(), game: gameStore.get(), feed: feedStore.get() };
    this.active.add(entry.id);
    try {
      return batchStoreUpdates(() => {
        try {
          if (automatic) this.dependencies.dice.applySharedActionConsequences(actorIds, { outcome: result.outcome!, success: result.success });
          feedStore.update(feed => feed.map(item => item.id === entry.id ? next : item));
          return { ok: true, applied: true } as const;
        } catch (caught) {
          charactersStore.set(before.characters); gameStore.set(before.game); feedStore.set(before.feed);
          return { ok: false, error: caught instanceof Error ? caught.message : 'Не удалось применить общий результат.' } as const;
        }
      });
    } finally { this.active.delete(entry.id); }
  }

  cancel(entryId: string, scopeKey: string, role: 'gm' | 'player'): Result {
    const error = this.authorize(scopeKey, role);
    if (error) return { ok: false, error };
    const entry = this.find(entryId);
    if (!entry || !isSharedTagTeam(entry.teamwork) || this.active.has(entry.id)) return { ok: false, error: 'Командный бросок недоступен.' };
    if (entry.teamwork.status === 'cancelled') return { ok: true, applied: false };
    if (entry.teamwork.status === 'resolved' || entry.teamwork.sharedResult) return { ok: false, error: 'Общий результат уже выбран.' };
    feedStore.update(feed => feed.map(item => item.id === entry.id ? { ...entry, teamwork: { ...entry.teamwork, status: 'cancelled', resolvedAt: nowIso() } } : item));
    return { ok: true, applied: true };
  }

  private find(id: string): TeamworkRollFeedEntry | undefined {
    return feedStore.get().find((entry): entry is TeamworkRollFeedEntry => entry.type === 'teamwork' && (entry.id === id || entry.teamwork.id === id));
  }
  private authorize(scopeKey: string, role: 'gm' | 'player'): string | null {
    if (role !== 'gm' || this.dependencies.isConnectedPlayer()) return 'Общий результат подтверждает мастер.';
    return scopeKey === this.dependencies.currentScopeKey() ? null : 'Игра изменилась. Откройте командный бросок заново.';
  }
}
