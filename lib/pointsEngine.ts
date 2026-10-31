// Pure scoring helpers. The AUTHORITATIVE scoring runs inside Postgres (public.recompute_user) so that
// every point is written server-side and is rebuildable. These functions mirror that logic exactly and
// are used for previews ("worked example" in the competition form) and tests. They never touch the DB.
// Nothing in the browser writes points.

import { CompetitionConfig, mergeConfig } from '@/lib/competition';
import { diffDays } from '@/lib/ist';

export function streakMultiplier(streak: number, cfg: Partial<CompetitionConfig>): number {
  const c = mergeConfig(cfg);
  if (!c.streak_multiplier_enabled) return 1;
  return Math.min(Math.max(1, streak), c.streak_multiplier_cap);
}

/** base = round(rounds / commitment × points_at_commitment); points = base × streak multiplier */
export function scoreChantingDay(rounds: number, commitment: number, streak: number, cfg: Partial<CompetitionConfig>) {
  const c = mergeConfig(cfg);
  const commit = commitment > 0 ? commitment : 16;
  const base = Math.round((rounds / commit) * c.chanting_points_at_commitment);
  const multiplier = streakMultiplier(streak, c);
  return { base, multiplier, points: base * multiplier };
}

/** whole minutes per day, capped; points = capped minutes × points per minute */
export function scoreReadingDay(totalCountedSeconds: number, cfg: Partial<CompetitionConfig>) {
  const c = mergeConfig(cfg);
  const minutes = Math.floor(totalCountedSeconds / 60);
  const counted = Math.min(minutes, c.reading_daily_cap_minutes);
  return { minutes, counted, points: counted * c.reading_points_per_minute };
}

export function weightedTotal(
  type: 'reading' | 'chanting' | 'both',
  parts: { chanting: number; reading: number; bonus: number },
  cfg: Partial<CompetitionConfig>
) {
  const c = mergeConfig(cfg);
  const wc = type === 'both' ? c.weight_chanting : 1;
  const wr = type === 'both' ? c.weight_reading : 1;
  return parts.chanting * wc + parts.reading * wr + parts.bonus;
}

/** Streak walk used by the DB: +1 for consecutive days, a shield bridges a single missed day. */
export function walkStreak(activeDays: string[], shields: number) {
  let streak = 0, best = 0, shield = shields, last: string | null = null;
  const perDay: Record<string, number> = {};
  for (const day of [...activeDays].sort()) {
    if (!last) streak = 1;
    else {
      const gap = diffDays(day, last);
      if (gap === 1) streak += 1;
      else if (gap === 2 && shield > 0) { streak += 1; shield -= 1; }
      else streak = 1;
    }
    best = Math.max(best, streak);
    perDay[day] = streak;
    last = day;
  }
  return { streak, best, shieldsLeft: shield, perDay };
}
