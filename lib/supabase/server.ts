import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** Supabase client bound to the signed-in user's cookies (runs as `authenticated`, RLS applies). */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set(name, value, options) {
        try { cookieStore.set({ name, value, ...options }); } catch { /* read-only in some contexts */ }
      },
      remove(name, options) {
        try { cookieStore.delete({ name, ...options }); } catch { /* read-only in some contexts */ }
      },
    },
  });
}

/** Service-role client. SERVER ONLY. Bypasses RLS - only use after checking the caller yourself. */
export function createSupabaseAdmin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminRole = 'HOD' | 'FOLK_GUIDE' | 'FOLK_ENABLER_MALE' | 'FOLK_ENABLER_FEMALE';
export const ADMIN_ROLES: AdminRole[] = ['HOD', 'FOLK_GUIDE', 'FOLK_ENABLER_MALE', 'FOLK_ENABLER_FEMALE'];

export interface Caller {
  user: User | null;
  role: AdminRole | null;
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>;
}

/** Verified session user (getUser hits Supabase Auth) + admin role from the database function. */
export async function getCaller(): Promise<Caller> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, role: null, supabase };
  const { data } = await supabase.rpc('current_admin_role');
  return { user, role: (data as AdminRole | null) ?? null, supabase };
}
