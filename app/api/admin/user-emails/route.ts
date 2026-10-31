import { NextResponse } from 'next/server';
import { createSupabaseAdmin, getCaller } from '@/lib/supabase/server';

// Emails live in auth.users, not in public.users. Admin-only; the id list comes from the caller's own
// RLS-scoped view of `users`, so Guides / Enablers only ever receive emails of students in their gender scope.
export async function GET() {
  const { user, role, supabase } = await getCaller();
  if (!user || !role) return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });

  const { data: visible, error } = await supabase.from('users').select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const allowed = new Set((visible || []).map((u) => u.id));

  const admin = createSupabaseAdmin();
  const emails: Record<string, string> = {};
  for (let page = 1; page <= 50; page++) {
    const { data, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    for (const u of data.users) if (allowed.has(u.id) && u.email) emails[u.id] = u.email;
    if (data.users.length < 200) break;
  }
  return NextResponse.json({ emails });
}
