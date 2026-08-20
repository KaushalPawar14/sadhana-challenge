import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Initialize the Supabase Service Role client to bypass RLS securely on the server
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAdminAuth() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { authorized: false, error: 'Unauthorized', userEmail: null, userRole: null };
  }

  // Check if the current user is whitelisted as an admin and fetch role
  const { data: adminCheck, error: adminErr } = await supabaseAdmin
    .from('admin_emails')
    .select('id, role')
    .eq('email', user.email)
    .maybeSingle();

  if (adminErr || !adminCheck) {
    return { authorized: false, error: 'Forbidden: Admins only', userEmail: user.email, userRole: null };
  }

  const role = adminCheck.role || 'HOD';
  return { authorized: true, userEmail: user.email, userRole: role };
}

// Permission matrix for creating / managing roles
function canAssignRole(creatorRole: string, targetRole: string): boolean {
  if (creatorRole === 'HOD') return true;
  if (creatorRole === 'FOLK_GUIDE') {
    return targetRole === 'FOLK_GUIDE' || targetRole === 'FOLK_ENABLER_MALE';
  }
  if (creatorRole === 'FOLK_ENABLER_MALE') {
    return targetRole === 'FOLK_ENABLER_MALE';
  }
  if (creatorRole === 'FOLK_ENABLER_FEMALE') {
    return targetRole === 'FOLK_ENABLER_FEMALE';
  }
  return false;
}

// Permission matrix for viewing admin roster emails
function canSeeAdminRole(viewerRole: string, targetRole: string): boolean {
  if (viewerRole === 'HOD') return true;
  if (viewerRole === 'FOLK_GUIDE') {
    return targetRole === 'FOLK_GUIDE' || targetRole === 'FOLK_ENABLER_MALE';
  }
  if (viewerRole === 'FOLK_ENABLER_MALE') {
    return targetRole === 'FOLK_ENABLER_MALE';
  }
  if (viewerRole === 'FOLK_ENABLER_FEMALE') {
    return targetRole === 'FOLK_ENABLER_FEMALE';
  }
  return false;
}

// GET all admin emails with role/category filtered by viewer permissions
export async function GET() {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('admin_emails')
      .select('id, email, role')
      .order('email', { ascending: true });

    if (error) {
      // Fallback if role column is missing from existing schema
      const { data: fallbackData, error: fallbackErr } = await supabaseAdmin
        .from('admin_emails')
        .select('id, email')
        .order('email', { ascending: true });

      if (fallbackErr) throw fallbackErr;

      const formatted = (fallbackData || []).map(a => ({
        ...a,
        role: 'HOD'
      }));
      return NextResponse.json({ 
        admins: formatted, 
        currentUserRole: auth.userRole || 'HOD', 
        currentUserEmail: auth.userEmail 
      });
    }

    const formatted = (data || [])
      .map(a => ({
        ...a,
        role: a.role === 'FOLK_ENABLER' ? 'FOLK_ENABLER_MALE' : (a.role || 'HOD')
      }))
      .filter(a => canSeeAdminRole(auth.userRole || 'HOD', a.role));

    return NextResponse.json({ 
      admins: formatted, 
      currentUserRole: auth.userRole || 'HOD', 
      currentUserEmail: auth.userEmail 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Add new admin email with role/category permission check
export async function POST(request: Request) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const { email, role } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const validRoles = ['HOD', 'FOLK_GUIDE', 'FOLK_ENABLER_MALE', 'FOLK_ENABLER_FEMALE'];
    const assignedRole = validRoles.includes(role) ? role : 'FOLK_ENABLER_MALE';

    if (!canAssignRole(auth.userRole || 'HOD', assignedRole)) {
      return NextResponse.json({
        error: `Forbidden: As a ${auth.userRole}, you cannot create an admin with role ${assignedRole}.`
      }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('admin_emails')
      .insert({ email: email.trim().toLowerCase(), role: assignedRole })
      .select()
      .single();

    if (error) {
      // Fallback if role column is missing
      const { data: fbData, error: fbErr } = await supabaseAdmin
        .from('admin_emails')
        .insert({ email: email.trim().toLowerCase() })
        .select()
        .single();

      if (fbErr) throw fbErr;
      return NextResponse.json({ ...fbData, role: assignedRole });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT: Update admin category / role
export async function PUT(request: Request) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const { id, role } = await request.json();
    if (!id || !role) {
      return NextResponse.json({ error: 'ID and role are required' }, { status: 400 });
    }

    const validRoles = ['HOD', 'FOLK_GUIDE', 'FOLK_ENABLER_MALE', 'FOLK_ENABLER_FEMALE'];
    const assignedRole = validRoles.includes(role) ? role : 'FOLK_ENABLER_MALE';

    if (!canAssignRole(auth.userRole || 'HOD', assignedRole)) {
      return NextResponse.json({
        error: `Forbidden: As a ${auth.userRole}, you cannot assign role ${assignedRole}.`
      }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('admin_emails')
      .update({ role: assignedRole })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Remove admin email (Folk HOD Only)
export async function DELETE(request: Request) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  if (auth.userRole !== 'HOD') {
    return NextResponse.json({ error: 'Forbidden: Only Folk HOD can remove whitelisted admins.' }, { status: 403 });
  }

  try {
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
