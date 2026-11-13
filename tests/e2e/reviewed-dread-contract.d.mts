import type { APIRequestContext } from '@playwright/test';
export interface DreadContract { id: string; hfCards: number; voidCards: number; hfStarterCards: number; restricted: boolean; fingerprint: string; }
export function dreadFingerprint(data: Record<string, unknown>[]): string;
export function reviewedDreadContract(data: Record<string, unknown>[]): DreadContract;
export function servedDreadContract(request: APIRequestContext): Promise<DreadContract>;
