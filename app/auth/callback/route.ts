import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

function safeNextPath(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : null;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const requestedNext = safeNextPath(searchParams.get('next'));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!code || !supabaseUrl || !publishableKey) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  if (requestedNext) {
    return NextResponse.redirect(`${origin}${requestedNext}`);
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role,is_onboarded')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profile?.role === 'hod') {
    return NextResponse.redirect(`${origin}/admin`);
  }
  if (profile?.role === 'guide') {
    return NextResponse.redirect(`${origin}/admin/weekly-plan`);
  }
  return NextResponse.redirect(
    `${origin}${profile?.is_onboarded ? '/leaderboard' : '/onboarding'}`,
  );
}
