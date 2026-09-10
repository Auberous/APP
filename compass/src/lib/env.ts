/**
 * Supabase configuration, read from Expo public env vars.
 *
 * These are the project URL and the *anon* key. Both are meant to be visible
 * in a shipped client — the anon key grants nothing on its own, because every
 * table's access is decided by the Row Level Security policies in
 * supabase/migrations (§8). The service-role key must never appear in this app.
 *
 * Phase 1 is expected to run before real credentials exist. Rather than
 * crashing on a missing value or, worse, silently pointing at nothing, the app
 * reports its own configuration state and shows a plain explanation on screen.
 */

const RAW_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const RAW_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Placeholder values from .env.example, which must not be treated as real. */
const PLACEHOLDERS = new Set([
  '',
  'YOUR_SUPABASE_URL',
  'YOUR_SUPABASE_ANON_KEY',
  'https://YOUR-PROJECT-REF.supabase.co',
]);

function clean(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return PLACEHOLDERS.has(trimmed) ? null : trimmed;
}

const url = clean(RAW_URL);
const anonKey = clean(RAW_ANON_KEY);

export type SupabaseConfig = { url: string; anonKey: string };

/**
 * True once both values are present and non-placeholder. When false the app
 * runs in an explicitly unconfigured state instead of pretending to work.
 */
export const isSupabaseConfigured: boolean = url !== null && anonKey !== null;

export const supabaseConfig: SupabaseConfig | null = isSupabaseConfigured
  ? { url: url as string, anonKey: anonKey as string }
  : null;

/** Which specific variables are missing — used by the setup notice screen. */
export function missingEnvVars(): string[] {
  const missing: string[] = [];
  if (url === null) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (anonKey === null) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  return missing;
}
