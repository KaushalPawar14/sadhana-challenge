import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function serverConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) return null;
  return { url, publishableKey, serviceRoleKey };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected server error';
}

async function checkAdminAuth() {
  const configuration = serverConfiguration();
  if (!configuration) {
    return { authorized: false, error: 'Supabase server configuration is unavailable' };
  }
  const cookieStore = await cookies();
  const supabase = createServerClient(
    configuration.url,
    configuration.publishableKey,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name, options) {
          cookieStore.delete({ name, ...options });
        },
      },
    }
  );
  const supabaseAdmin = createClient(
    configuration.url,
    configuration.serviceRoleKey,
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { authorized: false, error: 'Unauthorized' };
  }

  // Check if the current user is whitelisted as an admin
  const { data: adminCheck, error: adminErr } = await supabaseAdmin
    .from('admin_emails')
    .select('id')
    .eq('email', user.email)
    .maybeSingle();

  if (adminErr || !adminCheck) {
    return { authorized: false, error: 'Forbidden: Admins only' };
  }

  return { authorized: true };
}

function getAdminClient() {
  const configuration = serverConfiguration();
  return configuration
    ? createClient(configuration.url, configuration.serviceRoleKey)
    : null;
}

// GET all admin emails
export async function GET() {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    const { data, error } = await supabaseAdmin
      .from('admin_emails')
      .select('*')
      .order('email', { ascending: true });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

// POST: Add new admin email
export async function POST(request: Request) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('admin_emails')
      .insert({ email })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

// DELETE: Remove admin email
export async function DELETE(request: Request) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('admin_emails')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
