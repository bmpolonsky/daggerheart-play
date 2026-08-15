import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { readSupabaseSessionConfig } from '../../src/domain/p2p/supabaseSession';

describe('Supabase session config', () => {
  it('reads the public Supabase endpoint used directly by Pages', () => {
    assert.deepEqual(readSupabaseSessionConfig({
      VITE_DAGGERHEART_SUPABASE_URL: 'https://project.supabase.co/',
      VITE_DAGGERHEART_SUPABASE_PUBLISHABLE_KEY: 'publishable-key'
    }), {
      url: 'https://project.supabase.co',
      publishableKey: 'publishable-key'
    });
  });

  it('rejects an insecure public endpoint', () => {
    assert.equal(readSupabaseSessionConfig({
      VITE_DAGGERHEART_SUPABASE_URL: 'http://project.supabase.co',
      VITE_DAGGERHEART_SUPABASE_PUBLISHABLE_KEY: 'publishable-key'
    }), null);
  });
});
