import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Route gate (Next 16 "proxy", formerly middleware). It verifies the session on every request, but the
// two database look-ups (admin role, onboarded flag) are cached for 5 minutes in a short-lived, signed,
// httpOnly cookie so most requests cost zero extra DB round trips. The cache is only a routing convenience:
// every API route and every database policy re-checks the real role, so a stale cache can never grant access.
const CTX_COOKIE = 'sadhana_ctx';
const CTX_TTL_MS = 5 * 60 * 1000;

type Ctx = { u: string; r: string | null; o: boolean; e: number };

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(data: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

async function readCtx(raw: string | undefined, uid: string, secret?: string): Promise<Ctx | null> {
  if (!raw || !secret) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig || (await hmac(payload, secret)) !== sig) return null;
  try {
    const ctx = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Ctx;
    return ctx.u === uid && ctx.e > Date.now() ? ctx : null;
  } catch { return null; }
}

async function writeCtx(res: NextResponse, ctx: Ctx, secret?: string) {
  if (!secret) return;
  const payload = b64url(new TextEncoder().encode(JSON.stringify(ctx)));
  res.cookies.set({
    name: CTX_COOKIE, value: `${payload}.${await hmac(payload, secret)}`,
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: CTX_TTL_MS / 1000,
  });
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const url = request.nextUrl.clone();
  const path = url.pathname;

  if (path.startsWith('/auth/')) return response;

  const redirect = (to: string) => { url.pathname = to; return NextResponse.redirect(url); };

  if (!user) {
    if (path === '/') return response;
    if (path.startsWith('/api')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return redirect('/');
  }

  // role + onboarded flag, cached
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let ctx = await readCtx(request.cookies.get(CTX_COOKIE)?.value, user.id, secret);
  let fresh = false;
  if (!ctx) {
    const { data: role } = await supabase.rpc('current_admin_role');
    let onboarded = false;
    if (!role) {
      const { data: profile } = await supabase.from('users').select('is_onboarded').eq('id', user.id).maybeSingle();
      onboarded = !!profile?.is_onboarded;
    }
    ctx = { u: user.id, r: (role as string | null) ?? null, o: onboarded, e: Date.now() + CTX_TTL_MS };
    // only cache a positive answer, so a brand-new student is re-checked until onboarding completes
    fresh = !!ctx.r || ctx.o;
  }
  const isAdmin = !!ctx.r;
  const finish = async (res: NextResponse) => { if (fresh) await writeCtx(res, ctx!, secret); return res; };

  if (path === '/') return finish(redirect(isAdmin ? '/admin' : ctx.o ? '/leaderboard' : '/onboarding'));

  if (path.startsWith('/admin') && !isAdmin) return finish(redirect('/leaderboard'));

  if (!isAdmin && !ctx.o && !path.startsWith('/admin') && !path.startsWith('/api') && path !== '/onboarding') {
    return finish(redirect('/onboarding'));
  }

  if (path === '/onboarding' && (ctx.o || isAdmin)) return finish(redirect(isAdmin ? '/admin' : '/leaderboard'));

  return finish(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|animations/|avatars/|levels/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|lottie|json|mp3)$).*)'],
};
