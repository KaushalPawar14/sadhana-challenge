import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { friendlyError } from '@/lib/errors';

// Server-timed reading sessions. The client NEVER sends durations:
//   {action:'start', bookId}                -> {sessionId}      (server records the start time)
//   {action:'heartbeat', sessionId}         -> {open}           (server credits at most 45 s per beat)
//   {action:'end', sessionId, active}       -> {ok:true}        (server closes the session)
// Points are computed by the database (competition config: per-minute rate, daily cap, minimum session),
// and are refused when the active competition does not include reading.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // sendBeacon posts a Blob; request.json() handles both application/json and text/plain bodies
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const fail = (msg: string, status = 400) => NextResponse.json({ error: friendlyError(msg) }, { status });

  if (action === 'start') {
    if (!body.bookId || typeof body.bookId !== 'string') return fail('Invalid payload');
    const { data, error } = await supabase.rpc('start_reading_session', { p_book: body.bookId });
    if (error) return fail(error.message, /BOOK_NOT_FOUND/.test(error.message) ? 404 : 403);
    return NextResponse.json({ sessionId: data });
  }

  if (action === 'heartbeat') {
    if (!body.sessionId) return fail('Invalid payload');
    const { data, error } = await supabase.rpc('heartbeat_reading_session', { p_session: body.sessionId });
    if (error) return fail(error.message);
    return NextResponse.json(data);
  }

  if (action === 'end') {
    if (!body.sessionId) return fail('Invalid payload');
    const { error } = await supabase.rpc('end_reading_session', { p_session: body.sessionId, p_active: body.active !== false });
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  return fail('Unknown action');
}
