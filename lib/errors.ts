// Maps the error codes raised by the database functions to friendly messages.

const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Please sign in again.',
  NOT_ONBOARDED: 'Please finish your profile first.',
  NO_ACTIVE_COMPETITION: 'No competition is running right now.',
  CHANTING_NOT_ENABLED: 'This competition does not include chanting.',
  READING_NOT_ENABLED: 'This competition does not include reading.',
  BONUS_NOT_ENABLED: 'Bonus points are not enabled in this competition.',
  DATE_OUTSIDE_COMPETITION: 'That date is outside the competition dates.',
  FUTURE_DATE: 'You cannot log a future date.',
  LATE_NOT_ALLOWED: 'That day is too old to submit now.',
  INVALID_ROUNDS: 'Please enter a valid number of rounds.',
  ALREADY_LOGGED: 'You have already logged that day.',
  COMMITMENT_REQUIRED: 'Set your daily chanting commitment (rounds) first.',
  READING_COMMITMENT_REQUIRED: 'Set your daily reading commitment (minutes) first.',
  COMMITMENT_CANNOT_DECREASE: 'Your commitment can only be increased, not lowered.',
  INVALID_COMMITMENT: 'Chanting commitment must be between 1 and 16 rounds.',
  INVALID_READING_COMMITMENT: 'Reading commitment must be between 1 and 60 minutes.',
  READING_COMMITMENT_CANNOT_DECREASE: 'Your reading commitment can only be increased, not lowered.',
  BOOK_NOT_FOUND: 'That book is no longer available.',
  AUDIOBOOK_NOT_FOUND: 'That audiobook is no longer available.',
  QUIZ_LOCKED: 'Listen to enough of the audiobook to unlock the quiz.',
  QUIZ_ALREADY_SUBMITTED: 'You have already taken this quiz.',
  QUIZ_EMPTY: 'This quiz has no questions yet.',
  LISTEN_NOT_STARTED: 'Start the audiobook first.',
  COMPETITION_FINALIZED: 'This competition is finalized and can no longer change.',
  COMPETITION_NOT_FOUND: 'Competition not found.',
  FORBIDDEN: 'Only the HOD can do this.',
  OVERLAPS_EXISTING_COMPETITION: 'These dates overlap another competition.',
  USER_NOT_FOUND: 'Student not found.',
  INVALID_POINTS: 'Enter a non-zero number of points (max 10,000).',
  INVALID_TITLE: 'A title is required.',
};

/** Turn a Supabase/PostgREST/fetch error into a readable message. */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw = typeof err === 'string' ? err : (err as any)?.message || (err as any)?.error || '';
  if (!raw) return fallback;
  // "OVERLAPS_EXISTING_COMPETITION: dates overlap with "X"" -> keep the detail
  const m = /^([A-Z_]{4,}):?\s*([\s\S]*)$/.exec(raw);
  if (m && MESSAGES[m[1]]) return m[2] ? `${MESSAGES[m[1]]} ${m[2]}`.trim() : MESSAGES[m[1]];
  if (/^(INVALID|FORBIDDEN):/.test(raw)) return raw.replace(/^[A-Z]+:\s*/, '');
  if (/permission denied|row-level security/i.test(raw)) return 'You do not have permission to do that.';
  return raw.length > 220 ? fallback : raw;
}
