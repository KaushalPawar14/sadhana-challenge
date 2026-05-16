export interface ActivityInput {
  chanting_rounds: number;
  reading_minutes: number;
  hearing_minutes: number;
  target_chanting: number;
  target_reading: number;
  target_hearing: number;
  streak_count: number;
  points_per_chanting: number;
  points_per_reading: number;
  points_per_hearing: number;
  streak_bonus_multiplier: number;
}

export interface CalculationResult {
  base_points: number;
  streak_bonus: number;
  total_points: number;
  completion_percentage: number;
}

export function calculatePoints(input: ActivityInput): CalculationResult {
  const base_points = 
    (input.chanting_rounds * input.points_per_chanting) +
    (input.reading_minutes * input.points_per_reading) +
    (input.hearing_minutes * input.points_per_hearing);

  const targetsMet = 
    input.chanting_rounds >= input.target_chanting &&
    input.reading_minutes >= input.target_reading &&
    input.hearing_minutes >= input.target_hearing;

  let streak_bonus = 0;
  if (targetsMet && input.streak_count > 0) {
    const rawBonus = base_points * (input.streak_count * input.streak_bonus_multiplier);
    const maxBonus = base_points * 0.5; // Cap at 50%
    streak_bonus = Math.min(rawBonus, maxBonus);
  }

  const total_points = Math.max(0, Math.round(base_points + streak_bonus));

  // Completion percentage = average of (actual/target) for all 3 params, capped at 100%
  const chantingComp = Math.min(1, input.chanting_rounds / input.target_chanting);
  const readingComp = Math.min(1, input.reading_minutes / input.target_reading);
  const hearingComp = Math.min(1, input.hearing_minutes / input.target_hearing);
  
  const completion_percentage = ((chantingComp + readingComp + hearingComp) / 3) * 100;

  return {
    base_points,
    streak_bonus,
    total_points,
    completion_percentage
  };
}

export interface UserStats {
  total_points: number;
  streak_count: number;
  cumulative_reading_minutes: number;
  early_morning_logs_count: number; // submitted before 6 AM
  is_first_log: boolean;
}

export function checkAwardUnlocks(userStats: UserStats): string[] {
  const newlyUnlocked: string[] = [];

  // 'mahayogi_crown'  → total_points >= 500
  if (userStats.total_points >= 500) newlyUnlocked.push('mahayogi_crown');

  // 'unbroken_flame'  → streak_count >= 7
  if (userStats.streak_count >= 7) newlyUnlocked.push('unbroken_flame');

  // 'jijnasu_scholar' → cumulative reading_minutes >= 300
  if (userStats.cumulative_reading_minutes >= 300) newlyUnlocked.push('jijnasu_scholar');

  // 'brahma_muhurta'  → 5+ logs submitted before 6 AM
  if (userStats.early_morning_logs_count >= 5) newlyUnlocked.push('brahma_muhurta');

  // 'rising_sadhaka'  → first log ever submitted
  if (userStats.is_first_log) newlyUnlocked.push('rising_sadhaka');

  return newlyUnlocked;
}

export function updateStreak(
  lastLogDate: string | null, // DATE string from DB
  todayDate: string, // DATE string 'YYYY-MM-DD'
  currentStreak: number,
  freezeCredits: number
): {
  new_streak: number;
  freeze_used: boolean;
  new_freeze_credits: number;
  streak_broken: boolean;
  error?: string;
} {
  if (!lastLogDate) {
    return {
      new_streak: 1,
      freeze_used: false,
      new_freeze_credits: freezeCredits,
      streak_broken: false
    };
  }

  const last = new Date(lastLogDate);
  const today = new Date(todayDate);
  
  // Normalize dates to midnight for comparison
  last.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return {
      new_streak: currentStreak,
      freeze_used: false,
      new_freeze_credits: freezeCredits,
      streak_broken: false,
      error: "You've already logged today! Come back tomorrow. 🙏"
    };
  }

  if (diffDays === 1) {
    return {
      new_streak: currentStreak + 1,
      freeze_used: false,
      new_freeze_credits: freezeCredits,
      streak_broken: false
    };
  }

  if (diffDays === 2 && freezeCredits > 0) {
    return {
      new_streak: currentStreak + 1,
      freeze_used: true,
      new_freeze_credits: freezeCredits - 1,
      streak_broken: false
    };
  }

  // Streak broken
  return {
    new_streak: 1,
    freeze_used: false,
    new_freeze_credits: freezeCredits,
    streak_broken: true
  };
}
