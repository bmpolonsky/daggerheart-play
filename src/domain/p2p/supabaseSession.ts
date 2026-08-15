export interface SupabaseSessionConfig {
  url: string;
  publishableKey: string;
}

export function readSupabaseSessionConfig(env: Partial<ImportMetaEnv> = import.meta.env): SupabaseSessionConfig | null {
  const url = env.VITE_DAGGERHEART_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_DAGGERHEART_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { url: url.replace(/\/$/, ''), publishableKey };
}
