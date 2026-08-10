import type { User } from '@supabase/supabase-js';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type AccountRole = 'Owner' | 'Manager' | 'Collector' | 'Viewer';

export type Account = {
  id: string;
  email: string;
  fullName: string;
  role: AccountRole;
  organizationId?: string;
  demo?: boolean;
};

type AuthResult = { requiresEmailVerification?: boolean };

type AuthContextValue = {
  account: Account | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  continueInDemo: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const accountFromUser = async (user: User): Promise<Account> => {
  const base: Account = {
    id: user.id,
    email: user.email ?? '',
    fullName: String(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Property manager'),
    role: (user.user_metadata?.role as AccountRole | undefined) ?? 'Owner',
  };
  if (!supabase) return base;

  const { data } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return base;
  return {
    ...base,
    organizationId: data.organization_id,
    role: `${data.role.charAt(0).toUpperCase()}${data.role.slice(1)}` as AccountRole,
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (active) {
        setAccount(data.session?.user ? await accountFromUser(data.session.user) : null);
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session?.user) {
        setAccount(null);
        return;
      }
      setTimeout(() => {
        accountFromUser(session.user).then((nextAccount) => {
          if (active) setAccount(nextAccount);
        });
      }, 0);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    account,
    loading,
    configured: isSupabaseConfigured,
    signIn: async (email, password) => {
      if (!supabase) throw new Error('Connect the database before creating live accounts.');
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    },
    signUp: async (fullName, email, password) => {
      if (!supabase) throw new Error('Connect the database before creating live accounts.');
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), role: 'Owner' } },
      });
      if (error) throw error;
      return { requiresEmailVerification: !data.session };
    },
    signOut: async () => {
      if (account?.demo || !supabase) {
        setAccount(null);
        return;
      }
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    continueInDemo: () => setAccount({
      id: 'demo-owner',
      email: 'ray@example.com',
      fullName: 'Ray Kamau',
      role: 'Owner',
      demo: true,
    }),
  }), [account, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
