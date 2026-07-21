import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
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

    // 4. Calculate points to award: 1 minute = 1 point
    const pointsToAward = Math.floor(secondsRead / 60);
    if (pointsToAward > 0) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Fetch current points
      const { data: userData, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('total_points')
        .eq('id', user.id)
        .single();

      if (!fetchError && userData) {
        const currentPoints = userData.total_points || 0;
        const newPoints = currentPoints + pointsToAward;

        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({ total_points: newPoints })
          .eq('id', user.id);
        
        if (updateError) {
          console.error('Failed to update user total_points:', updateError);
        } else {
          console.log(`Successfully awarded ${pointsToAward} points to user ${user.id} for reading.`);
        }
      } else {
        console.error('Failed to fetch user total_points for update:', fetchError);
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('Error in save-reading-session API:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
