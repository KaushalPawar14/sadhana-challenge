import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase connection settings are missing.');
    return NextResponse.redirect(`${origin}/auth/auth-code-error?reason=missing_base_keys`);
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { cookieStore.delete({ name, ...options }); },
      },
    });

    try {
      const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;

      if (session) {
        const user = session.user;
        if (!supabaseServiceKey) {
          console.warn('SUPABASE_SERVICE_ROLE_KEY is missing; routing to the leaderboard.');
          return NextResponse.redirect(`${origin}/leaderboard`);
        }
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

        // Admin? (role is looked up by the verified session email, case-insensitively)
        const { data: adminRow } = await supabaseAdmin
          .from('admin_emails').select('id').ilike('email', user.email ?? '').maybeSingle();
        if (adminRow) return NextResponse.redirect(`${origin}/admin`);

        // Student: make sure a profile row exists (duplicate error 23505 is fine)
        const { error: insertError } = await supabaseAdmin.from('users').insert({
          id: user.id,
          full_name: user.user_metadata.full_name || '',
        });
        if (insertError && insertError.code !== '23505') console.error('User profile creation error:', insertError.message);

        const { data: profile } = await supabaseAdmin.from('users').select('is_onboarded').eq('id', user.id).maybeSingle();
        return NextResponse.redirect(`${origin}${profile?.is_onboarded ? '/leaderboard' : '/onboarding'}`);
      }
    } catch (err) {
      console.error('Auth callback error:', (err as Error)?.message);
      return NextResponse.redirect(`${origin}/auth/auth-code-error`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
