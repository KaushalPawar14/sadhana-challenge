import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { friendlyError } from '@/lib/errors';

// POST only: this endpoint writes (the Japa counter), so GET must never mutate.
// The counter only PRE-FILLS the daily log form: it never creates a log or points (public.sync_chanting).
export async function POST(request: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rounds = typeof body?.roundsChanted === 'number' && Number.isFinite(body.roundsChanted)
    ? Math.floor(body.roundsChanted)
    : null;

  const { data, error } = await supabase.rpc('sync_chanting', { p_rounds: rounds });
  if (error) {
    const status = /NOT_AUTHENTICATED/.test(error.message) ? 401 : 400;
    return NextResponse.json({ error: friendlyError(error.message) }, { status });
  }
  return NextResponse.json(data);
}
