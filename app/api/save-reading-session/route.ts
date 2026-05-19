import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // 1. Verify User Authentication Session
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
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse request body
  try {
    const { bookId, secondsRead } = await request.json();

    if (!bookId || typeof secondsRead !== 'number') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    if (secondsRead <= 10) {
      return NextResponse.json({ error: 'Session too short, ignored' }, { status: 200 });
    }

    // 3. Insert reading session record
    const { data, error } = await supabase
      .from('reading_sessions')
      .insert({
        user_id: user.id,
        book_id: bookId,
        seconds_read: secondsRead
      })
      .select();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('Error in save-reading-session API:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
