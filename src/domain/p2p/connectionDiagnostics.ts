export type ConnectionStageId = 'auth-session' | 'auth-sign-in' | 'auth-bind' | 'room-open' | 'room-join' | 'realtime' | 'state' | 'events' | 'roster' | 'handshake' | 'p2p-supabase' | 'p2p-nostr' | 'p2p-torrent';
export type ConnectionStageStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'timed-out' | 'cancelled';
export type ConnectionErrorCode = 'timeout' | 'cancelled' | 'network_error' | 'auth_required' | 'auth_failed' | 'room_not_found' | 'master_offline' | 'room_in_use' | 'participant_in_use' | 'rate_limited' | 'realtime_closed' | 'realtime_error' | 'server_error';
export interface ConnectionStageDiagnostic {
  id: ConnectionStageId;
  attempt?: number;
  status: ConnectionStageStatus;
  startedAt: number | null;
  finishedAt: number | null;
  timeoutMs: number;
  errorCode?: ConnectionErrorCode;
  httpStatus?: number;
}
export const CONNECTION_STAGE_TIMEOUT_MS = 15_000;
export function connectionErrorCode(error: unknown): ConnectionErrorCode {
  const value = error as { code?: unknown; name?: unknown; status?: unknown } | null;
  const known: ConnectionErrorCode[] = ['timeout', 'cancelled', 'network_error', 'auth_required', 'auth_failed', 'room_not_found', 'master_offline', 'room_in_use', 'participant_in_use', 'rate_limited', 'realtime_closed', 'realtime_error'];
  if (known.includes(value?.code as ConnectionErrorCode)) return value!.code as ConnectionErrorCode;
  if (value?.name === 'AbortError') return 'cancelled';
  if (value?.name === 'TypeError' || value?.name === 'AuthRetryableFetchError' && value?.status === 0) return 'network_error';
  if (value?.status === 401 || value?.status === 403) return 'auth_failed';
  if (value?.status === 429) return 'rate_limited';
  return 'server_error';
}

let connectionAttempt = 0;
/** Local sequence only; never derived from a room, user, credential or device identifier. */
export function nextConnectionAttempt(): number {
  connectionAttempt = connectionAttempt >= Number.MAX_SAFE_INTEGER ? 1 : connectionAttempt + 1;
  return connectionAttempt;
}

export function observedHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { name?: string; status?: unknown; observedStatus?: unknown };
  const status = record.name === 'RelayTransportError' ? record.observedStatus : record.status;
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}
