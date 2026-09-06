import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const INSTALL_ID_KEY = 'artisthub.install_id';

/**
 * Phase 1 has no signup flow yet, but link clicks want a user_id when one
 * exists. This tracks whatever session is present and hands back null
 * otherwise, so Phase 2 can drop auth in without touching the screens.
 */
const SessionContext = createContext<{
  session: Session | null;
  userId: string | null;
  deviceId: string | null;
}>({ session: null, userId: null, deviceId: null });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  // A stable id for this install. Not an identity and never treated as one:
  // households legitimately share a device, so repeats are a signal for review
  // rather than grounds for a block.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        let id = await AsyncStorage.getItem(INSTALL_ID_KEY);
        if (!id) {
          id = Crypto.randomUUID();
          await AsyncStorage.setItem(INSTALL_ID_KEY, id);
        }
        if (!cancelled) setDeviceId(id);
      } catch {
        // Storage can fail; a missing device id costs one analytics dimension
        // and must never stop the app loading.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, userId: session?.user.id ?? null, deviceId }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
