// Must be imported before @supabase/supabase-js: React Native has no complete
// URL implementation, and supabase-js builds request URLs with it.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database';
import { isSupabaseConfigured, supabaseConfig } from './env';

export type CompassClient = SupabaseClient<Database>;

/**
 * The client is null when credentials are not configured yet (see env.ts).
 * Every call site is expected to handle that rather than assume a client —
 * `useSupabase()` in the auth context is the normal way in.
 */
export const supabase: CompassClient | null = isSupabaseConfigured
  ? createClient<Database>(supabaseConfig!.url, supabaseConfig!.anonKey, {
      auth: {
        // Sessions live in AsyncStorage so a user is not asked to sign in on
        // every launch. Nothing else is persisted client-side.
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        // No OAuth redirect handling in Phase 1; email + password only, and a
        // React Native app has no URL bar to detect a session in.
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * supabase-js refreshes tokens on a timer, which React Native suspends in the
 * background. Supabase's own guidance is to drive the refresh loop from
 * AppState so a session does not silently expire while the app is backgrounded.
 *
 * Returns a cleanup function for the caller's effect.
 */
export function startAuthAutoRefresh(): () => void {
  const client = supabase;
  if (!client) return () => {};

  const handleChange = (state: AppStateStatus) => {
    if (state === 'active') {
      void client.auth.startAutoRefresh();
    } else {
      void client.auth.stopAutoRefresh();
    }
  };

  handleChange(AppState.currentState);
  const subscription = AppState.addEventListener('change', handleChange);

  return () => {
    subscription.remove();
    void client.auth.stopAutoRefresh();
  };
}

/**
 * Turns a Supabase error into something worth showing a person.
 *
 * Copy rule (§7): plain and honest, no blame, no guilt. Where Supabase's own
 * message is already clear we pass it through rather than inventing our own.
 */
export function describeError(error: unknown, fallback: string): string {
  // Log the whole object, not just the message. PostgREST puts the actionable
  // fix in `hint` (for a permission error, literally the GRANT statement that
  // would resolve it), which is invaluable while the RLS policies are being
  // worked on and invisible if you only read `message`.
  if (error) console.error(error);

  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message).trim();
    // `hint` is deliberately not surfaced to the user: for permission errors it
    // contains raw SQL, which is noise to a person and a detail we should not
    // put on screen.
    if (message.length > 0) return message;
  }
  return fallback;
}
