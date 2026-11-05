import { recordNetworkStage } from '../../core/observability/technicalJournal';
import { CONNECTION_STAGE_TIMEOUT_MS, connectionErrorCode, nextConnectionAttempt, observedHttpStatus, type ConnectionStageDiagnostic, type ConnectionStageId } from '../../domain/p2p/connectionDiagnostics';

export class ConnectionStageError extends Error {
  constructor(readonly code: 'timeout' | 'cancelled', readonly stage: ConnectionStageId) {
    super(code === 'timeout' ? `Превышено время ожидания этапа ${stage}.` : 'Подключение отменено.');
    this.name = 'ConnectionStageError';
  }
}

/** Local, allow-listed diagnostics. Never records requests, tokens, identities or raw errors. */
export class ConnectionDiagnostics {
  private stages = new Map<ConnectionStageId, ConnectionStageDiagnostic>();
  private active = new Map<ConnectionStageId, AbortController>();
  private generation = 0;
  private attempt = nextConnectionAttempt();
  constructor(private changed: () => void) {}
  snapshot(): ConnectionStageDiagnostic[] { return [...this.stages.values()].map(stage => ({ ...stage })); }
  reset(ids: ConnectionStageId[], attempt = nextConnectionAttempt()): void {
    this.cancel();
    this.attempt = attempt;
    this.stages = new Map(ids.map(id => [id, { id, attempt: this.attempt, status: 'pending', startedAt: null, finishedAt: null, timeoutMs: CONNECTION_STAGE_TIMEOUT_MS }]));
    this.changed();
  }
  cancel(): void {
    this.generation += 1;
    this.active.forEach(controller => controller.abort());
    this.active.clear();
  }
  async run<T>(id: ConnectionStageId, operation: (signal: AbortSignal) => PromiseLike<T>, timeoutMs = CONNECTION_STAGE_TIMEOUT_MS): Promise<T> {
    const generation = this.generation;
    const controller = new AbortController();
    const stage: ConnectionStageDiagnostic = { id, attempt: this.attempt, status: 'running', startedAt: Date.now(), finishedAt: null, timeoutMs };
    this.stages.set(id, stage);
    this.active.set(id, controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const cancelled = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new ConnectionStageError(timedOut ? 'timeout' : 'cancelled', id)), { once: true });
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    });
    recordNetworkStage(stage);
    this.changed();
    try {
      const result = await Promise.race([Promise.resolve().then(() => {
        if (generation !== this.generation || controller.signal.aborted) throw new ConnectionStageError('cancelled', id);
        return operation(controller.signal);
      }), cancelled]);
      if (generation !== this.generation || controller.signal.aborted) throw new ConnectionStageError('cancelled', id);
      stage.status = 'succeeded';
      return result;
    } catch (error) {
      stage.errorCode = connectionErrorCode(error);
      stage.httpStatus = observedHttpStatus(error);
      stage.status = timedOut || stage.errorCode === 'timeout' ? 'timed-out' : generation !== this.generation || controller.signal.aborted ? 'cancelled' : 'failed';
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      stage.finishedAt = Date.now();
      recordNetworkStage(stage);
      if (this.active.get(id) === controller) this.active.delete(id);
      if (this.stages.get(id) === stage) this.changed();
    }
  }
}
