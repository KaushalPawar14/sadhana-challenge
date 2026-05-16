'use client';

import { useEffect, useState, ReactNode } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useAuthStore } from '@/store/authStore';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const { setUser, setIsAdmin, setIsOnboarded } = useAuthStore();

  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));

  useEffect(() => {
    console.log("🔴 DEBUG: AuthProvider Hook Started");

    const initializeAuth = async () => {
      try {
        console.log("🔴 DEBUG 1: Fetching user from server cookies...");
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
          console.error("🔴 DEBUG 1b: getUser error:", error.message);
        }

        if (user) {
          console.log("🔴 DEBUG 2: User found (" + user.email + "). Fetching profile from 'users' table...");
          setUser(user);

          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('is_onboarded')
            .eq('id', user.id)
            .maybeSingle();

          if (profileError) {
            console.error("🔴 DEBUG 2b: Profile fetch error:", profileError.message);
          }

          console.log("🔴 DEBUG 3: Profile fetched:", profile, "Checking admin status...");
          const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin', {
            user_email: user.email
          });

          if (adminError) {
            console.error("🔴 DEBUG 3b: Admin RPC error:", adminError.message);
          }

          console.log("🔴 DEBUG 4: Admin check completed. Result:", isAdmin);
          setIsAdmin(!!isAdmin);
          setIsOnboarded(profile?.is_onboarded ?? false);
        } else {
          console.log("🔴 DEBUG 2: No user session found in cookies.");
          setUser(null);
          setIsAdmin(false);
          setIsOnboarded(false);
        }
      } catch (error) {
        console.error("🔴 DEBUG CRITICAL ERROR:", error);
      } finally {
        console.log("🔴 DEBUG 5: Unconditionally turning off the loading screen.");
        setIsInitializing(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("🔴 DEBUG ONAUTHSTATECHANGE EVENT:", event);
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsAdmin(false);
          setIsOnboarded(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4">
        </div>
        <p className="text-slate-500 font-medium animate-pulse">
          Restoring your session (Diagnostic Mode)...
        </p>
      </div>
    );
  }

  return <>{children}</>;
};