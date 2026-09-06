import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile, RoleCode } from './types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  roles: RoleCode[];
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<RoleCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!session) {
      setProfile(null);
      setRoles([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // A person can hold several roles at once — a lounge employee who is also a
    // signed artist is a real case — so this is a list, not a single value.
    void (async () => {
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
        supabase.from('user_roles').select('role_code').eq('user_id', session.user.id),
      ]);
      if (cancelled) return;

      setProfile(profileRes.data ?? null);
      setRoles((rolesRes.data ?? []).map((r) => r.role_code as RoleCode));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, profile, roles, isAdmin: roles.includes('admin'), loading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
