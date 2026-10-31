import { NextResponse } from 'next/server';
import { createSupabaseAdmin, getCaller } from '@/lib/supabase/server';

// Registration is validated and saved on the server. Students never write `is_onboarded`, points or targets themselves.
// Fields that the HOD hid via app_settings.onboarding_fields (full_name / mobile / department) are NOT required.
// Gender (drives admin scoping) and age are always required.
const admin = createSupabaseAdmin();

export async function POST(request: Request) {
  const { user, role } = await getCaller();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (role) return NextResponse.json({ error: 'Admins do not register as students.' }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  let visible: string[] | null = null;
  const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'onboarding_fields').maybeSingle();
  if (setting?.value) { try { const arr = JSON.parse(setting.value); if (Array.isArray(arr) && arr.length) visible = arr; } catch { /* default: all */ } }
  const shown = (f: string) => visible === null || visible.includes(f);

  const row: Record<string, unknown> = { id: user.id, is_onboarded: true };
  const fail = (m: string) => NextResponse.json({ error: m }, { status: 400 });

  const name = String(body.full_name ?? '').trim();
  if (shown('full_name')) { if (!name) return fail('Full Name is required'); }
  if (name) row.full_name = name.slice(0, 120);

  const mobile = String(body.mobile ?? '').trim();
  if (shown('mobile')) { if (!/^\d{10}$/.test(mobile)) return fail('Mobile Number must be exactly 10 digits'); }
  if (mobile) { if (!/^\d{10}$/.test(mobile)) return fail('Mobile Number must be exactly 10 digits'); row.mobile = mobile; }

  if (!['M', 'F'].includes(body.gender)) return fail('Please select Gender (M or F)');
  row.gender = body.gender;

  const dept = String(body.department ?? '').trim();
  if (shown('department')) { if (!dept) return fail('Department is required'); }
  if (dept) row.department = dept.slice(0, 120);

  const age = Number(body.age);
  if (!Number.isInteger(age) || age < 10 || age > 100) return fail('Age must be a whole number between 10 and 100');
  row.age = age;

  // fall back to the Google profile name so a hidden name field still yields a leaderboard name
  if (!row.full_name) row.full_name = String(user.user_metadata?.full_name || 'Student').slice(0, 120);

  const { error } = await admin.from('users').upsert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
