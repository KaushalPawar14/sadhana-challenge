import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { calculatePoints, updateStreak } from '@/lib/pointsEngine';

export async function POST(request: NextRequest) {
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

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const body = await request.json().catch(() => ({}));
    const todayStr = new Date().toISOString().split('T')[0];
    const logDate = body.logDate || todayStr;
    const roundsChanted = typeof body.roundsChanted === 'number' ? body.roundsChanted : null;

    // 1. If roundsChanted is provided, upsert into user_chanting_logs
    if (roundsChanted !== null && roundsChanted >= 0) {
      await supabaseAdmin
        .from('user_chanting_logs')
        .upsert(
          {
            user_id: user.id,
            log_date: logDate,
            rounds_chanted: roundsChanted,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id,log_date' }
        );
    }

    // 2. Perform Auto-Fulfillment Check for any unfulfilled past days (or today if day ended)
    const autoFulfilledDates: string[] = [];

    // Fetch all user chanting logs with rounds_chanted > 0
    const { data: chantingLogs } = await supabaseAdmin
      .from('user_chanting_logs')
      .select('log_date, rounds_chanted')
      .eq('user_id', user.id)
      .gt('rounds_chanted', 0);

    // Fetch all existing activity logs for user
    const { data: existingActivityLogs } = await supabaseAdmin
      .from('activity_logs')
      .select('log_date')
      .eq('user_id', user.id);

    const loggedDates = new Set(existingActivityLogs?.map(l => l.log_date) || []);

    // Filter chanting logs for dates that do NOT have an activity_logs entry
    const unfulfilledChantingLogs = (chantingLogs || [])
      .filter(cl => !loggedDates.has(cl.log_date) && cl.log_date <= todayStr)
      .sort((a, b) => a.log_date.localeCompare(b.log_date)); // Sort chronologically

    if (unfulfilledChantingLogs.length > 0) {
      // Fetch current user stats
      const { data: userProfile } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (userProfile) {
        let currentStreak = userProfile.streak_count || 0;
        let currentBestStreak = userProfile.best_streak || 0;
        let currentFreezeCredits = userProfile.freeze_credits || 0;
        let currentTotalPoints = userProfile.total_points || 0;
        let lastLogDate = userProfile.last_log_date;

        for (const chantLog of unfulfilledChantingLogs) {
          // Compute streak update
          const streakRes = updateStreak(
            lastLogDate,
            chantLog.log_date,
            currentStreak,
            currentFreezeCredits
          );

          currentStreak = streakRes.new_streak;
          currentFreezeCredits = streakRes.new_freeze_credits;
          if (currentStreak > currentBestStreak) {
            currentBestStreak = currentStreak;
          }

          // Compute points earned for these chanting rounds
          const ptsRes = calculatePoints({
            chanting_rounds: chantLog.rounds_chanted,
            reading_minutes: 0,
            hearing_minutes: 0,
            target_chanting: userProfile.target_chanting || 16,
            target_reading: userProfile.target_reading || 0,
            target_hearing: userProfile.target_hearing || 0,
            streak_count: currentStreak,
            points_per_chanting: 1,
            points_per_reading: 1,
            points_per_hearing: 1,
            streak_bonus_multiplier: 0.5
          });

          currentTotalPoints += ptsRes.total_points;
          lastLogDate = chantLog.log_date;

          // Insert into activity_logs
          await supabaseAdmin.from('activity_logs').insert({
            user_id: user.id,
            log_date: chantLog.log_date,
            chanting_rounds: chantLog.rounds_chanted,
            reading_minutes: 0,
            hearing_minutes: 0,
            points_earned: ptsRes.total_points,
            submitted_at: new Date().toISOString(),
            is_late_submission: chantLog.log_date < todayStr
          });

          autoFulfilledDates.push(chantLog.log_date);
        }

        // Update user profile with new totals
        await supabaseAdmin
          .from('users')
          .update({
            total_points: currentTotalPoints,
            streak_count: currentStreak,
            best_streak: currentBestStreak,
            freeze_credits: currentFreezeCredits,
            last_log_date: lastLogDate
          })
          .eq('id', user.id);
      }
    }

    // 3. Fetch latest today's in-app chanting rounds
    const { data: todayLog } = await supabaseAdmin
      .from('user_chanting_logs')
      .select('rounds_chanted')
      .eq('user_id', user.id)
      .eq('log_date', todayStr)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      todayRounds: todayLog?.rounds_chanted || 0,
      autoFulfilledDates
    });
  } catch (err: any) {
    console.error('Error in sync-chanting API:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
