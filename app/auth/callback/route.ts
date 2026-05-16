import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  console.log("DEBUG URL:", request.url, "|| CODE:", code);

  // Defensively match keys across both standard prefixes
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("CRITICAL ERROR: Supabase connection strings are missing entirely.");
    return NextResponse.redirect(`${origin}/auth/auth-code-error?reason=missing_base_keys`);
  }

  if (code) {
    const cookieStore = await cookies();

    // Secure client for standard user session exchange
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options });
          },
        },
      }
    );

    try {
      const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;

      if (session) {
        const user = session.user;
        const email = user.email;
        console.log('DEBUG: Auth Success - User:', email);

        // 🛑 SAFE GUARD: If Service Role Key isn't fully loaded by Netlify yet, 
        // bypass admin routines safely to prevent an application 500 error crash.
        if (!supabaseServiceKey) {
          console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY is missing. Routing safely to leaderboard.');
          return NextResponse.redirect(`${origin}/leaderboard`);
        }

        // Privileged client for admin and onboarding checks
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Check if admin status applies
        const { data: isAdmin, error: adminError } = await supabaseAdmin.rpc('is_admin', {
          user_email: email
        });

        if (isAdmin) {
          console.log('DEBUG: Redirecting to /admin');
          return NextResponse.redirect(`${origin}/admin`);
        }

        // 2. Ensure user records exist in core profile tables
        const { error: insertError } = await supabaseAdmin.from('users').insert({
          id: user.id,
          full_name: user.user_metadata.full_name || '',
        });

        if (insertError && insertError.code !== '23505') {
          console.error('DEBUG: User profile creation error:', insertError);
        }

        // 3. Evaluate dynamic onboarding flows
        const { data: profile } = await supabaseAdmin
          .from('users')
          .select('is_onboarded')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile || !profile.is_onboarded) {
          console.log('DEBUG: Redirecting to /onboarding');
          return NextResponse.redirect(`${origin}/onboarding`);
        }

        console.log('DEBUG: Production verified. Sending to /leaderboard');
        return NextResponse.redirect(`${origin}/leaderboard`);
      }
    } catch (err) {
      console.error('Auth callback error caught securely:', err);
      return NextResponse.redirect(`${origin}/auth/auth-code-error`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}