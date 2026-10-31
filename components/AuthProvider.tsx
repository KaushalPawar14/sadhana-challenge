'use client';

import { useEffect, useState, ReactNode } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useAuthStore, type AdminRoleName } from '@/store/authStore';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const { setUser, setAdminRole, setIsOnboarded } = useAuthStore();

  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          setUser(user);
          const [{ data: profile }, { data: role }] = await Promise.all([
            supabase.from('users').select('is_onboarded').eq('id', user.id).maybeSingle(),
            supabase.rpc('current_admin_role'),
          ]);
          setAdminRole((role as AdminRoleName | null) ?? null);
          setIsOnboarded(profile?.is_onboarded ?? false);
        } else {
          setUser(null);
          setAdminRole(null);
          setIsOnboarded(false);
        }
      } catch {
        // fall through: the proxy already guards protected routes
      } finally {
        setIsInitializing(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setAdminRole(null);
        setIsOnboarded(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, setUser, setAdminRole, setIsOnboarded]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium animate-pulse">Restoring your session...</p>
      </div>
    );
  }

  return <>{children}</>;
};
