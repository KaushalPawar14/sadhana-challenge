import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

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

  try {
    // Replace 'activity_logs' with your actual database table name if different
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error('Database fetch failure:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}