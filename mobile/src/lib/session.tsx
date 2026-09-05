import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Phase 1 has no signup flow yet, but link clicks want a user_id when one
 * exists. This tracks whatever session is present and hands back null
 * otherwise, so Phase 2 can drop auth in without touching the screens.
 */
const SessionContext = createContext<{ session: Session | null; userId: string | null }>({
  session: null,
  userId: null,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={{ session, userId: session?.user.id ?? null }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
