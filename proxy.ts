import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  // UPDATED: Using getUser() for maximum security
  const { data: { user } } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();

  // Public routes (except root which we handle below)
  if (url.pathname.startsWith('/auth/')) return response;

  // Root login page
  if (url.pathname === '/') {
    if (user) {
      // If logged in, redirect to appropriate place
      const { data: isAdmin } = await supabase.rpc('is_admin', {
        user_email: user.email // UPDATED reference
      });
      if (isAdmin) {
        url.pathname = '/admin';
      } else {
        const { data: profile } = await supabase
          .from('users')
          .select('is_onboarded')
          .eq('id', user.id) // UPDATED reference
          .single();
        url.pathname = profile?.is_onboarded ? '/leaderboard' : '/onboarding';
      }
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Protected routes
  if (!user) { // UPDATED reference
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Admin routes
  if (url.pathname.startsWith('/admin')) {
    const { data: isAdmin } = await supabase.rpc('is_admin', {
      user_email: user.email // UPDATED reference
    });
    if (!isAdmin) {
      url.pathname = '/leaderboard';
      return NextResponse.redirect(url);
    }
  }

  // Check onboarding status for all other pages (skip static assets, api routes, admin pages, and onboarding itself)
  if (
    !url.pathname.startsWith('/admin') &&
    !url.pathname.startsWith('/api') &&
    !url.pathname.startsWith('/auth') &&
    url.pathname !== '/onboarding'
  ) {
    const { data: isAdmin } = await supabase.rpc('is_admin', {
      user_email: user.email
    });

    if (!isAdmin) {
      const { data: profile } = await supabase
        .from('users')
        .select('is_onboarded')
        .eq('id', user.id)
        .single();

      if (!profile?.is_onboarded) {
        url.pathname = '/onboarding';
        return NextResponse.redirect(url);
      }
    }
  }

  // Onboarding route
  if (url.pathname === '/onboarding') {
    const { data: profile } = await supabase
      .from('users')
      .select('is_onboarded')
      .eq('id', user.id) // UPDATED reference
      .single();
    if (profile?.is_onboarded) {
      url.pathname = '/leaderboard';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};