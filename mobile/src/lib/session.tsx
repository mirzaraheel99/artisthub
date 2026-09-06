import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile, RoleCode } from './types';

const INSTALL_ID_KEY = 'artisthub.install_id';

/**
 * Phase 1 has no signup flow yet, but link clicks want a user_id when one
 * exists. This tracks whatever session is present and hands back null
 * otherwise, so Phase 2 can drop auth in without touching the screens.
 */
type SessionValue = {
  session: Session | null;
  userId: string | null;
  deviceId: string | null;
  profile: Profile | null;
  roles: RoleCode[];
  isStaff: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue>({
  session: null,
  userId: null,
  deviceId: null,
  profile: null,
  roles: [],
  isStaff: false,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<RoleCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async () => {
    if (!session) {
      setProfile(null);
      setRoles([]);
      setLoading(false);
      return;
    }

    // Roles are a list: a lounge employee who is also a signed artist holds
    // both. Read fresh rather than from the token, so revoking a role takes
    // effect on the next load rather than whenever the JWT happens to expire.
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
      supabase.from('user_roles').select('role_code').eq('user_id', session.user.id),
    ]);

    setProfile(profileRes.data ?? null);
    setRoles((rolesRes.data ?? []).map((r) => r.role_code as RoleCode));
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

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

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        session,
        userId: session?.user.id ?? null,
        deviceId,
        profile,
        roles,
        // Staff mode is hidden on this flag, but the database is what actually
        // refuses a non-staff redemption — see redeem_code in 0006.
        isStaff: roles.includes('staff') || roles.includes('admin'),
        loading,
        refresh: loadProfile,
        signOut,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
