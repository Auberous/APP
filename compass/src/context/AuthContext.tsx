import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase, startAuthAutoRefresh, type CompassClient } from '../lib/supabase';

type AuthResult = { ok: true } | { ok: false; message: string };

interface AuthContextValue {
  /** null until the stored session has been checked, so we don't flash a login screen. */
  initialising: boolean;
  session: Session | null;
  user: User | null;
  signUp(input: { email: string; password: string; displayName: string }): Promise<AuthResult>;
  logIn(input: { email: string; password: string }): Promise<AuthResult>;
  logOut(): Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const NOT_CONFIGURED =
  'Compass is not connected to a Supabase project yet, so accounts cannot be created or used.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialising, setInitialising] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setInitialising(false);
      return;
    }

    let cancelled = false;

    // Read whatever session AsyncStorage already holds before rendering routes.
    void client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setInitialising(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    const stopAutoRefresh = startAuthAutoRefresh();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      stopAutoRefresh();
    };
  }, []);

  const signUp = useCallback<AuthContextValue['signUp']>(async ({ email, password, displayName }) => {
    const client = supabase;
    if (!client) return { ok: false, message: NOT_CONFIGURED };

    // display_name rides along in user metadata; the on_auth_user_created
    // trigger copies it into public.users so there is never a signed-in user
    // without a profile row.
    const { error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });

    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }, []);

  const logIn = useCallback<AuthContextValue['logIn']>(async ({ email, password }) => {
    const client = supabase;
    if (!client) return { ok: false, message: NOT_CONFIGURED };

    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }, []);

  const logOut = useCallback<AuthContextValue['logOut']>(async () => {
    const client = supabase;
    if (!client) return { ok: false, message: NOT_CONFIGURED };

    const { error } = await client.auth.signOut();
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      initialising,
      session,
      user: session?.user ?? null,
      signUp,
      logIn,
      logOut,
    }),
    [initialising, session, signUp, logIn, logOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

/**
 * Screens that talk to the database use this rather than importing the client
 * directly, so the unconfigured case has to be handled explicitly.
 */
export function useSupabase(): CompassClient | null {
  return supabase;
}
