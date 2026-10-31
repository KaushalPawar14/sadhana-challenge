// Single source of truth for "what day is it" in this app: Asia/Kolkata (IST), server AND client.
// Competition start/end are IST calendar dates, inclusive: 00:00 IST on start -> 23:59:59 IST on end.
// The database uses the same rule (public.ist_today()).

const IST = 'Asia/Kolkata';
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', hour12: false });

/** 'YYYY-MM-DD' of an instant, as seen in IST. */
export function istDateOf(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  return ymdFmt.format(d);
}

/** Today in IST as 'YYYY-MM-DD'. */
export function istToday(now: Date = new Date()): string {
  return ymdFmt.format(now);
}

/** Hour of day (0-23) in IST. */
export function istHour(now: Date = new Date()): number {
  return Number(hourFmt.format(now)) % 24;
}

const toUtcMs = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Add whole days to a 'YYYY-MM-DD' string (calendar arithmetic, no time zone drift). */
export function addDays(ymd: string, n: number): string {
  return new Date(toUtcMs(ymd) + n * 86400000).toISOString().slice(0, 10);
}

/** a - b in whole calendar days. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtcMs(a) - toUtcMs(b)) / 86400000);
}

/** Inclusive list of dates from..to. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 'YYYY-MM-DD' -> 'DD-MM-YYYY' */
export function formatDMY(ymd: string | null | undefined): string {
  if (!ymd) return '...';
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

/** 'YYYY-MM-DD' -> '3 Sep 2026' */
export function formatLong(ymd: string | null | undefined): string {
  if (!ymd) return '...';
  return new Date(toUtcMs(ymd.slice(0, 10))).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** 'YYYY-MM-DD' -> 'Mon, 3 Sep' */
export function formatShort(ymd: string): string {
  return new Date(toUtcMs(ymd.slice(0, 10))).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}
