import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Initialize the admin client with the service role key to bypass RLS securely on the server
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch users
    const { data: usersList, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id, full_name, total_points, best_streak');
    
    if (usersError) throw usersError;

    // Fetch bonus points
    const { data: bonusList, error: bonusError } = await supabaseAdmin
      .from('bonus_points')
      .select('user_id, points');
    
    if (bonusError) throw bonusError;

    // Fetch activity logs
    const { data: logsList, error: logsError } = await supabaseAdmin
      .from('activity_logs')
      .select('user_id, points_earned');
    
    if (logsError) throw logsError;

    // Fetch quiz submissions
    const { data: quizList, error: quizError } = await supabaseAdmin
      .from('quiz_submissions')
      .select('user_id, points_earned, score');
    
    if (quizError) throw quizError;

    return NextResponse.json({
      usersList: usersList || [],
      bonusList: bonusList || [],
      logsList: logsList || [],
      quizList: quizList || []
    });
  } catch (error: any) {
    console.error('Failed to fetch awards stats:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
