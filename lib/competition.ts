// Shared competition types, defaults and the generated rules text.
// The database (supabase/migrations/20261031000*) is the authority for scoring; these helpers
// only describe / validate / display it.

import { istToday } from '@/lib/ist';

export type CompetitionType = 'reading' | 'chanting' | 'both';
export type CompetitionStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'finalized' | 'archived';

export interface CompetitionConfig {
  chanting_points_at_commitment: number; // points for completing 100% of the commitment (default 10)
  streak_multiplier_enabled: boolean;
  streak_multiplier_cap: number;
  shield_count: number;
  reading_points_at_commitment: number; // points for reading 100% of the reading commitment (default 10)
  weight_reading: number;
  weight_chanting: number;
  quiz_points_per_correct: number;
  listen_threshold_pct: number;
  max_quiz_bonus: number | null;
  late_log_days: number;
  /** migrated competitions keep their historical per-day points instead of the formula */
  use_logged_points: boolean;
}

export const DEFAULT_CONFIG: CompetitionConfig = {
  chanting_points_at_commitment: 10,
  streak_multiplier_enabled: true,
  streak_multiplier_cap: 5,
  shield_count: 1,
  reading_points_at_commitment: 10,
  weight_reading: 1,
  weight_chanting: 1,
  quiz_points_per_correct: 5,
  listen_threshold_pct: 80,
  max_quiz_bonus: null,
  late_log_days: 1,
  use_logged_points: false,
};

export function mergeConfig(partial?: Partial<CompetitionConfig> | null): CompetitionConfig {
  return { ...DEFAULT_CONFIG, ...(partial || {}) };
}

export interface Competition {
  id: string;
  title: string;
  description: string | null;
  cover_photo_url: string | null;
  type: CompetitionType;
  bonus_enabled: boolean;
  start_date: string; // YYYY-MM-DD (IST)
  end_date: string;
  status: CompetitionStatus;
  stored_status: 'draft' | 'published' | 'archived' | 'finalized';
  config: CompetitionConfig;
  total_days: number;
  day_number: number;
  days_left: number;
  finalized_at: string | null;
  today: string;
}

export interface ActiveCompetitionPayload {
  competition: Competition | null;
  next: { id: string; title: string; start_date: string } | null;
  last: { id: string; title: string; end_date: string; status: CompetitionStatus } | null;
  features: { books: boolean; podcast: boolean; chanting: boolean; reading: boolean };
  today: string;
}

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  gender: 'M' | 'F' | null;
  department: string | null;
  total: number;
  chanting_points: number;
  reading_points: number;
  bonus_points: number;
  current_streak: number;
  best_streak: number;
  last_log_date: string | null;
}

export interface FeedEvent {
  id: string;
  competition_id: string;
  user_id: string;
  kind: 'chanting' | 'reading' | 'quiz_bonus' | 'manual_bonus' | 'listen' | 'award';
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  gender: 'M' | 'F' | null;
  detail: Record<string, any>;
  delta: { chanting?: number; reading?: number; bonus?: number; total?: number };
  streak: number | null;
  visible_from: string;
  created_at: string;
}

export type AwardCriterion =
  | 'highest_total' | 'highest_chanting' | 'highest_reading' | 'longest_streak'
  | 'highest_single_day' | 'most_quiz_bonus' | 'highest_bonus' | 'top_n_total' | 'manual';

export const AWARD_CRITERIA: { value: AwardCriterion; label: string; help: string }[] = [
  { value: 'highest_total', label: 'Highest total score', help: 'Top of the leaderboard.' },
  { value: 'highest_chanting', label: 'Highest chanting points', help: 'Most points from chanting.' },
  { value: 'highest_reading', label: 'Highest reading points', help: 'Most points from reading.' },
  { value: 'longest_streak', label: 'Longest streak', help: 'Most consecutive active days.' },
  { value: 'highest_single_day', label: 'Highest single-day score', help: 'Best one-day score.' },
  { value: 'most_quiz_bonus', label: 'Most quiz bonus', help: 'Most points from audiobook quizzes.' },
  { value: 'highest_bonus', label: 'Most bonus points', help: 'Quiz + HOD bonus combined.' },
  { value: 'top_n_total', label: 'Top N by total', help: 'The first N students on the leaderboard.' },
  { value: 'manual', label: 'Manual (HOD decides)', help: 'No automatic suggestion.' },
];

export const AWARD_ICON_KEYS = ['rising_sadhaka', 'unbroken_flame', 'brahma_muhurta', 'mahayogi_crown', 'jijnasu_scholar'] as const;

export interface AwardDefinition {
  id?: string;
  award_key?: string;
  name: string;
  description: string | null;
  icon_key: string | null;
  image_url: string | null;
  criterion: AwardCriterion;
  top_n: number | null;
  gender_scope: 'all' | 'M' | 'F';
  unlock_date: string;
  sort_order?: number;
}

export interface AwardWinner {
  user_id: string;
  full_name: string | null;
  department?: string | null;
  rank?: number;
  score?: number | null;
  tied?: boolean;
  message?: string | null;
  unlocked?: boolean;
}

export interface AwardView extends AwardDefinition {
  id: string;
  final: boolean;
  winners: AwardWinner[];
  mine: { won: boolean; unlocked?: boolean; message?: string | null; rank?: number | null };
}

export function typeLabel(t: CompetitionType): string {
  return t === 'both' ? 'Reading + Chanting' : t === 'reading' ? 'Reading' : 'Chanting';
}

export function statusLabel(s: CompetitionStatus): string {
  return { draft: 'Draft', scheduled: 'Scheduled', active: 'Active', ended: 'Ended', finalized: 'Finalized', archived: 'Archived' }[s];
}

export const includesChanting = (t: CompetitionType) => t === 'chanting' || t === 'both';
export const includesReading = (t: CompetitionType) => t === 'reading' || t === 'both';

/** Derive the display status from stored status + dates (mirrors public.competition_status). */
export function deriveStatus(c: { stored_status: string; start_date: string; end_date: string }, today = istToday()): CompetitionStatus {
  if (c.stored_status === 'draft' || c.stored_status === 'archived' || c.stored_status === 'finalized') return c.stored_status;
  if (today < c.start_date) return 'scheduled';
  if (today > c.end_date) return 'ended';
  return 'active';
}

export interface RulesSection { heading: string; items: string[] }

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));

/** Rules text shown to students. Always generated from the competition config, never hard-coded. */
export function buildRulesText(c: Pick<Competition, 'type' | 'bonus_enabled' | 'start_date' | 'end_date' | 'config'>): RulesSection[] {
  const cfg = mergeConfig(c.config);
  const sections: RulesSection[] = [];
  sections.push({
    heading: 'Schedule',
    items: [
      `Runs from ${c.start_date} to ${c.end_date} (IST, both days included). A day ends at midnight IST.`,
      cfg.late_log_days > 0
        ? `You can still submit a missed day up to ${cfg.late_log_days} day${cfg.late_log_days > 1 ? 's' : ''} later.`
        : 'Each day must be submitted on the same day.',
    ],
  });

  if (includesChanting(c.type)) {
    const items = [
      `At your first log you must set your daily chanting commitment: 1 to 16 rounds. It can only be raised later, never lowered.`,
      `Base points = (rounds chanted ÷ your commitment) × ${fmt(cfg.chanting_points_at_commitment)}. Completing 100% of your commitment earns ${fmt(cfg.chanting_points_at_commitment)} points.`,
    ];
    items.push(
      cfg.streak_multiplier_enabled
        ? `Streak multiplier: your daily points are multiplied by your current streak (day 1 = 1×, day 2 = 2× …), up to ${fmt(cfg.streak_multiplier_cap)}×.`
        : 'There is no streak multiplier in this competition.'
    );
    if (cfg.shield_count > 0) {
      items.push(`Streak shield: you have ${cfg.shield_count} shield${cfg.shield_count > 1 ? 's' : ''}; each protects your streak across one missed day.`);
    }
    items.push('The Japa counter only helps you count: your score comes from the daily log you submit.');
    sections.push({ heading: 'Chanting', items });
  }

  if (includesReading(c.type)) {
    sections.push({
      heading: 'Reading',
      items: [
        `At your first log you must set your daily reading commitment: 1 to 60 minutes. It can only be raised later, never lowered.`,
        `Log the minutes of book reading you did each day in your daily log. The app does not measure your reading.`,
        `Reading score = (minutes read ÷ your reading commitment) × ${fmt(cfg.reading_points_at_commitment)}. Reading 100% of your commitment earns ${fmt(cfg.reading_points_at_commitment)} base points.`,
        cfg.streak_multiplier_enabled ? 'The same streak multiplier applies to your reading points.' : 'There is no streak multiplier in this competition.',
      ],
    });
  }

  if (c.type === 'both') {
    sections.push({
      heading: 'Combined score',
      items: [`Total = chanting points × ${fmt(cfg.weight_chanting)} + reading points × ${fmt(cfg.weight_reading)} + bonus points.`],
    });
  }

  if (c.bonus_enabled) {
    sections.push({
      heading: 'Bonus',
      items: [
        `Audiobooks: listen to ${fmt(cfg.listen_threshold_pct)}% of an audiobook to unlock its quiz. One attempt per audiobook.`,
        `Each correct quiz answer earns ${fmt(cfg.quiz_points_per_correct)} points${cfg.max_quiz_bonus != null ? ` (up to ${fmt(cfg.max_quiz_bonus)} quiz points in total)` : ''}.`,
        'Admins may also give bonus points for special service.',
      ],
    });
  } else {
    sections.push({ heading: 'Bonus', items: ['There are no bonus points in this competition.'] });
  }

  sections.push({
    heading: 'Awards',
    items: ['Winners are confirmed by the HOD after the competition ends and unlock on the dates shown on the Awards page.'],
  });
  return sections;
}

/** Client-side validation that mirrors public.save_competition (the database re-validates). */
export function validateCompetitionInput(i: {
  title: string; type: string; start_date: string; end_date: string; config: Partial<CompetitionConfig>;
}): string | null {
  if (!i.title.trim()) return 'Title is required.';
  if (!['reading', 'chanting', 'both'].includes(i.type)) return 'Choose a competition type.';
  if (!i.start_date || !i.end_date) return 'Start and end dates are required.';
  if (i.end_date < i.start_date) return 'End date must be on or after the start date.';
  const c = i.config;
  for (const k of ['weight_reading', 'weight_chanting', 'chanting_points_at_commitment', 'reading_points_at_commitment',
    'quiz_points_per_correct', 'shield_count', 'late_log_days'] as const) {
    const v = c[k];
    if (v !== undefined && (Number.isNaN(Number(v)) || Number(v) < 0)) return `${k.replace(/_/g, ' ')} must be 0 or more.`;
  }
  if (c.streak_multiplier_cap !== undefined && Number(c.streak_multiplier_cap) < 1) return 'Streak multiplier cap must be at least 1.';
  if (c.listen_threshold_pct !== undefined && (Number(c.listen_threshold_pct) < 1 || Number(c.listen_threshold_pct) > 100)) {
    return 'Listening threshold must be between 1 and 100%.';
  }
  return null;
}
