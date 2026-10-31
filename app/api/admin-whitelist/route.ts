import { NextResponse } from 'next/server';
import { ADMIN_ROLES, createSupabaseAdmin, getCaller, type AdminRole } from '@/lib/supabase/server';

// Admin whitelist. Everyone in admin_emails may LIST (scoped to what their role may see);
// only the HOD may add / change / remove. Every check is on the server and uses the role the
// database derives from the verified session - never anything the client sends.
const admin = createSupabaseAdmin();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function canSeeAdminRole(viewer: AdminRole, target: string): boolean {
  if (viewer === 'HOD') return true;
  if (viewer === 'FOLK_GUIDE') return target === 'FOLK_GUIDE' || target === 'FOLK_ENABLER_MALE';
  if (viewer === 'FOLK_ENABLER_MALE') return target === 'FOLK_ENABLER_MALE';
  if (viewer === 'FOLK_ENABLER_FEMALE') return target === 'FOLK_ENABLER_FEMALE';
  return false;
}

const forbidden = (msg = 'Forbidden: only the HOD can manage admins.') => NextResponse.json({ error: msg }, { status: 403 });

async function hodCount(): Promise<number> {
  const { count } = await admin.from('admin_emails').select('id', { count: 'exact', head: true }).eq('role', 'HOD');
  return count ?? 0;
}

export async function GET() {
  const { user, role } = await getCaller();
  if (!user || !role) return forbidden('Forbidden: Admins only');
  const { data, error } = await admin.from('admin_emails').select('id, email, role').order('email', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const admins = (data || []).filter((a) => canSeeAdminRole(role, a.role));
  return NextResponse.json({ admins, currentUserRole: role, currentUserEmail: user.email });
}

export async function POST(request: Request) {
  const { user, role } = await getCaller();
  if (!user || role !== 'HOD') return forbidden();
  const { email, role: newRole } = await request.json().catch(() => ({}));
  const clean = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(clean)) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  // never insert without an explicit, valid role (no silent default - the old fallback made Enablers HODs)
  if (!ADMIN_ROLES.includes(newRole)) return NextResponse.json({ error: 'A valid role is required' }, { status: 400 });

  const { data, error } = await admin.from('admin_emails').insert({ email: clean, role: newRole }).select('id, email, role').single();
  if (error) {
    const dup = error.code === '23505';
    return NextResponse.json({ error: dup ? 'That email is already an admin' : error.message }, { status: dup ? 409 : 500 });
  }
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const { user, role } = await getCaller();
  if (!user || role !== 'HOD') return forbidden();
  const { id, role: newRole } = await request.json().catch(() => ({}));
  if (!id || !ADMIN_ROLES.includes(newRole)) return NextResponse.json({ error: 'ID and a valid role are required' }, { status: 400 });

  const { data: target } = await admin.from('admin_emails').select('id, email, role').eq('id', id).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
  if (target.role === 'HOD' && newRole !== 'HOD' && (await hodCount()) <= 1) {
    return NextResponse.json({ error: 'You cannot demote the last HOD.' }, { status: 400 });
  }
  const { data, error } = await admin.from('admin_emails').update({ role: newRole }).eq('id', id).select('id, email, role').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const { user, role } = await getCaller();
  if (!user || role !== 'HOD') return forbidden('Forbidden: Only the HOD can remove whitelisted admins.');
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

  const { data: target } = await admin.from('admin_emails').select('id, role').eq('id', id).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
  if (target.role === 'HOD' && (await hodCount()) <= 1) {
    return NextResponse.json({ error: 'You cannot remove the last HOD.' }, { status: 400 });
  }
  const { error } = await admin.from('admin_emails').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
