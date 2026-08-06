import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !publishableKey) return response;

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const url = request.nextUrl.clone();

  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) {
    return response;
  }

  if (!user) {
    if (url.pathname === '/') return response;
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role,is_onboarded')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role ?? 'student';
  if (url.pathname === '/') {
    url.pathname =
      role === 'hod'
        ? '/admin'
        : role === 'guide'
          ? '/admin/weekly-plan'
          : profile?.is_onboarded
            ? '/leaderboard'
            : '/onboarding';
    return NextResponse.redirect(url);
  }

  if (url.pathname.startsWith('/admin') && role === 'student') {
    url.pathname = profile?.is_onboarded ? '/leaderboard' : '/onboarding';
    return NextResponse.redirect(url);
  }

  if (url.pathname.startsWith('/admin') && role === 'guide') {
    const guideRoutes = ['/admin/weekly-plan'];
    if (!guideRoutes.some((route) => url.pathname.startsWith(route))) {
      url.pathname = '/admin/weekly-plan';
      return NextResponse.redirect(url);
    }
  }

  if (role === 'student') {
    if (!profile?.is_onboarded && url.pathname !== '/onboarding') {
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }
    if (profile?.is_onboarded && url.pathname === '/onboarding') {
      url.pathname = '/leaderboard';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
