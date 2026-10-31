import { NextResponse } from 'next/server';
import { createSupabaseAdmin, getCaller } from '@/lib/supabase/server';

// HOD-only. Whitelisted profile columns only (no points / streak / onboarding flags / counters).
// Per-competition commitment goes through the HOD RPC so it is audited by the database rules.
const admin = createSupabaseAdmin();

export async function POST(request: Request) {
  const { user, role, supabase } = await getCaller();
  if (!user || role !== 'HOD') return NextResponse.json({ error: 'Forbidden: HOD only' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.userId !== 'string') return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  const { userId } = body;

  if (body.commitment) {
    const { competitionId, rounds, minutes } = body.commitment;
    const r = rounds == null ? null : Number(rounds);
    const m = minutes == null ? null : Number(minutes);
    if (!competitionId || (r === null && m === null)) {
      return NextResponse.json({ error: 'Provide rounds and/or minutes.' }, { status: 400 });
    }
    if (r !== null && (!Number.isInteger(r) || r < 1 || r > 16)) {
      return NextResponse.json({ error: 'Chanting commitment must be a whole number between 1 and 16 rounds.' }, { status: 400 });
    }
    if (m !== null && (!Number.isInteger(m) || m < 1 || m > 60)) {
      return NextResponse.json({ error: 'Reading commitment must be a whole number between 1 and 60 minutes.' }, { status: 400 });
    }
    const { error } = await supabase.rpc('hod_set_commitment', { p_comp: competitionId, p_user: userId, p_rounds: r, p_minutes: m });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  const updates: Record<string, unknown> = {};
  if ('full_name' in body) {
    const v = String(body.full_name ?? '').trim();
    if (!v || v.length > 120) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    updates.full_name = v;
  }
  if ('mobile' in body) {
    const v = String(body.mobile ?? '').trim();
    if (!/^\d{10}$/.test(v)) return NextResponse.json({ error: 'Mobile must be exactly 10 digits' }, { status: 400 });
    updates.mobile = v;
  }
  if ('gender' in body) {
    if (!['M', 'F'].includes(body.gender)) return NextResponse.json({ error: 'Gender must be M or F' }, { status: 400 });
    updates.gender = body.gender;
  }
  if ('department' in body) {
    const v = String(body.department ?? '').trim();
    if (!v || v.length > 120) return NextResponse.json({ error: 'Invalid department' }, { status: 400 });
    updates.department = v;
  }
  if ('age' in body) {
    const n = Number(body.age);
    if (!Number.isInteger(n) || n < 10 || n > 100) return NextResponse.json({ error: 'Age must be between 10 and 100' }, { status: 400 });
    updates.age = n;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });

  const { data, error } = await admin.from('users').update(updates).eq('id', userId)
    .select('id, full_name, mobile, gender, department, age').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, user: data });
}
