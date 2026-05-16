import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  console.log("DEBUG URL:", request.url, "|| CODE:", code);

  if (code) {
    // Note: If you are using Next.js 15, this MUST be changed to: const cookieStore = await cookies();
    const cookieStore = await cookies();

    // Client for session exchange (must use cookies)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            // FIX 1: Use delete() instead of setting an empty value
            cookieStore.delete({ name, ...options });
          },
        },
      }
    );

    // Privileged client for admin checks (bypasses RLS)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
      const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) throw error;

      if (session) {
        const user = session.user;
        const email = user.email;
        console.log('DEBUG: Auth Success - User:', user.email);

        // 1. Check if admin using Service Role Key
        const { data: isAdmin, error: adminError } = await supabaseAdmin.rpc('is_admin', {
          user_email: email
        });

        console.log('DEBUG: Admin Check - Result:', isAdmin, 'Error:', adminError);

        if (isAdmin) {
          console.log('DEBUG: Redirecting to /admin');
          return NextResponse.redirect(`${origin}/admin`);
        }

        // 2. Ensure user exists in 'users' table
        const { error: insertError } = await supabaseAdmin.from('users').insert({
          id: user.id,
          full_name: user.user_metadata.full_name || '',
        });

        if (insertError && insertError.code !== '23505') {
          console.error('DEBUG: User insert error:', insertError);
        }

        // FIX 2: Use supabaseAdmin here to bypass RLS and avoid the propagation bug
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('users')
          .select('is_onboarded')
          .eq('id', user.id)
          .maybeSingle();

        console.log('DEBUG: Student Profile:', profile, 'Error:', profileError);

        if (!profile || !profile.is_onboarded) {
          console.log('DEBUG: Redirecting to /onboarding');
          return NextResponse.redirect(`${origin}/onboarding`);
        }

        console.log('DEBUG: Student onboarded - Redirecting to /leaderboard');
        return NextResponse.redirect(`${origin}/leaderboard`);
      }
    } catch (err) {
      console.error('Auth callback error:', err);
      return NextResponse.redirect(`${origin}/auth/auth-code-error`);
    }
  }

  // If no code is present
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}