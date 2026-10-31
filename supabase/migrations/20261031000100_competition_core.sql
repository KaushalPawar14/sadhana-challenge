-- =====================================================================
-- 20261031000100  Competition core: helpers, roles, tables, new columns
-- Written against the LIVE schema (introspected 2026-10-31):
--   * user_chanting_logs did NOT exist live (migration 20260815 was never applied)
--   * admin_emails.role already holds FOLK_ENABLER_MALE / FEMALE
--   * audiobooks.language exists live (was missing from repo SQL)
-- Idempotent where practical.
-- =====================================================================

-- ---------- time helpers (IST everywhere) ----------
-- app_now() is the single clock used by all competition logic (tests override it).
create or replace function public.app_now() returns timestamptz
language sql stable as $$ select now() $$;

create or replace function public.ist_today() returns date
language sql stable as $$ select (public.app_now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public.ist_date_of(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'Asia/Kolkata')::date $$;

-- true when called from a direct DB connection (SQL editor / migrations), never from PostgREST
create or replace function public.is_system_context() returns boolean
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '') is null
     and nullif(current_setting('request.jwt.claim.role', true), '') is null
$$;

-- ---------- admin roles ----------
update public.admin_emails set role = 'FOLK_ENABLER_MALE' where role = 'FOLK_ENABLER' or role is null;
alter table public.admin_emails alter column role set default 'FOLK_ENABLER_MALE';
alter table public.admin_emails alter column role set not null;
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.admin_emails'::regclass and contype = 'c'
  loop
    execute format('alter table public.admin_emails drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.admin_emails
  add constraint admin_emails_role_check
  check (role in ('HOD', 'FOLK_GUIDE', 'FOLK_ENABLER_MALE', 'FOLK_ENABLER_FEMALE'));
update public.admin_emails set email = lower(email) where email <> lower(email);
create unique index if not exists admin_emails_email_lower_key on public.admin_emails (lower(email));

create or replace function public.current_admin_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.admin_emails
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function public.is_hod() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.current_admin_role() = 'HOD', false)
$$;

create or replace function public.is_any_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.current_admin_role() is not null
$$;

-- Legacy signature kept so the currently deployed client keeps working, but the argument
-- is IGNORED: it can no longer be used to enumerate admin emails.
create or replace function public.is_admin(user_email text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.current_admin_role() is not null
$$;

-- can the calling admin see this student (gender scope enforced in the database)
create or replace function public.admin_can_see_user(p_user uuid) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r text := public.current_admin_role(); g text;
begin
  if r is null then return false; end if;
  if r = 'HOD' then return true; end if;
  select gender into g from public.users where id = p_user;
  return (r in ('FOLK_GUIDE', 'FOLK_ENABLER_MALE') and g = 'M')
      or (r = 'FOLK_ENABLER_FEMALE' and g = 'F');
end $$;

-- ---------- users: age ----------
alter table public.users add column if not exists age integer;
do $$ begin
  alter table public.users add constraint users_age_check check (age is null or (age between 10 and 100));
exception when duplicate_object then null; end $$;

-- ---------- competitions ----------
create table if not exists public.competitions (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  cover_photo_url  text,
  type             text not null check (type in ('reading', 'chanting', 'both')),
  bonus_enabled    boolean not null default false,
  start_date       date not null,
  end_date         date not null,
  -- draft / finalized / archived are explicit; scheduled / active / ended are derived from dates
  stored_status    text not null default 'draft' check (stored_status in ('draft', 'published', 'archived', 'finalized')),
  config           jsonb not null default '{}'::jsonb,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  finalized_at     timestamptz,
  finalized_by     uuid,
  check (end_date >= start_date)
);

-- effective scoring config = defaults || stored overrides
create or replace function public.comp_cfg(p_config jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'chanting_points_at_commitment', 10,
    'streak_multiplier_enabled', true,
    'streak_multiplier_cap', 5,
    'shield_count', 1,
    'reading_points_per_minute', 1,
    'reading_daily_cap_minutes', 60,
    'reading_min_session_seconds', 10,
    'weight_reading', 1,
    'weight_chanting', 1,
    'quiz_points_per_correct', 5,
    'listen_threshold_pct', 80,
    'max_quiz_bonus', null,
    'late_log_days', 1,
    'use_logged_points', false
  ) || coalesce(p_config, '{}'::jsonb)
$$;

create or replace function public.competition_status(c public.competitions) returns text
language sql stable as $$
  select case
    when c.stored_status in ('draft', 'archived', 'finalized') then c.stored_status
    when public.ist_today() < c.start_date then 'scheduled'
    when public.ist_today() > c.end_date then 'ended'
    else 'active'
  end
$$;

-- competition that accepts activity right now: published, today in [start, end + late_log_days]
create or replace function public.open_competition() returns public.competitions
language sql stable security definer set search_path = public, pg_temp as $$
  select c.* from public.competitions c
  where c.stored_status = 'published'
    and public.ist_today() >= c.start_date
    and public.ist_today() <= c.end_date + coalesce((public.comp_cfg(c.config) ->> 'late_log_days')::int, 1)
  order by (public.ist_today() <= c.end_date) desc, c.start_date desc
  limit 1
$$;

-- the competition running today (start <= today <= end)
create or replace function public.active_competition() returns public.competitions
language sql stable security definer set search_path = public, pg_temp as $$
  select c.* from public.competitions c
  where c.stored_status = 'published' and public.ist_today() between c.start_date and c.end_date
  order by c.start_date desc limit 1
$$;

-- ---------- per-competition participation (commitment) ----------
create table if not exists public.competition_participants (
  competition_id   uuid not null references public.competitions(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  commitment_rounds integer check (commitment_rounds is null or commitment_rounds between 1 and 108),
  joined_at        timestamptz not null default now(),
  primary key (competition_id, user_id)
);

-- ---------- competition_id on existing tables ----------
alter table public.activity_logs   add column if not exists competition_id uuid references public.competitions(id);
alter table public.activity_logs   add column if not exists source text not null default 'manual';
alter table public.activity_logs   add column if not exists commitment_rounds integer;
alter table public.reading_sessions add column if not exists competition_id uuid references public.competitions(id);
alter table public.reading_sessions add column if not exists started_at timestamptz;
alter table public.reading_sessions add column if not exists last_seen_at timestamptz;
alter table public.reading_sessions add column if not exists ended_at timestamptz;
alter table public.reading_sessions add column if not exists counted_seconds integer not null default 0;
alter table public.reading_sessions add column if not exists status text not null default 'closed';
alter table public.quiz_submissions add column if not exists competition_id uuid references public.competitions(id);
alter table public.quiz_submissions add column if not exists max_score integer;
alter table public.quiz_submissions add column if not exists answers jsonb;
alter table public.bonus_points    add column if not exists competition_id uuid references public.competitions(id);
alter table public.user_audiobook_progress add column if not exists competition_id uuid references public.competitions(id);
alter table public.user_audiobook_progress add column if not exists listened_seconds integer not null default 0;
alter table public.user_audiobook_progress add column if not exists duration_reported integer;
alter table public.user_audiobook_progress add column if not exists last_seen_at timestamptz;
alter table public.audiobooks add column if not exists duration_seconds integer;
alter table public.audiobooks add column if not exists language text;

-- Japa counter (did not exist live): rounds counted by the in-app counter per IST day
create table if not exists public.user_chanting_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  competition_id uuid references public.competitions(id),
  log_date       date not null,
  rounds_chanted integer not null default 0 check (rounds_chanted >= 0),
  updated_at     timestamptz not null default now()
);
alter table public.user_chanting_logs add column if not exists competition_id uuid references public.competitions(id);

-- admins are not rows in public.users: bonus_points.admin_id must not reference it
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
           where c.conrelid = 'public.bonus_points'::regclass and c.contype = 'f'
             and (select a.attname from pg_attribute a where a.attrelid = c.conrelid and a.attnum = c.conkey[1]) = 'admin_id'
  loop
    execute format('alter table public.bonus_points drop constraint %I', r.conname);
  end loop;
end $$;

-- uniqueness is now per competition
do $$
declare r record; t text; cols text[];
begin
  for t, cols in select * from (values
      ('activity_logs', array['log_date','user_id']),
      ('quiz_submissions', array['audiobook_id','user_id']),
      ('user_audiobook_progress', array['audiobook_id','user_id']),
      ('user_chanting_logs', array['log_date','user_id'])) v(t, cols)
  loop
    for r in select c.conname from pg_constraint c
             where c.conrelid = ('public.' || t)::regclass and c.contype = 'u'
               and (select array_agg(a.attname order by a.attname) from pg_attribute a
                    where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) = cols::name[]
    loop
      execute format('alter table public.%I drop constraint %I', t, r.conname);
    end loop;
  end loop;
end $$;

create unique index if not exists activity_logs_comp_user_date_key on public.activity_logs (competition_id, user_id, log_date);
create unique index if not exists quiz_submissions_comp_user_book_key on public.quiz_submissions (competition_id, user_id, audiobook_id);
create unique index if not exists progress_comp_user_book_key on public.user_audiobook_progress (competition_id, user_id, audiobook_id);
create unique index if not exists chanting_logs_comp_user_date_key on public.user_chanting_logs (competition_id, user_id, log_date);
create index if not exists reading_sessions_comp_user_idx on public.reading_sessions (competition_id, user_id);
create index if not exists activity_logs_comp_idx on public.activity_logs (competition_id);

-- ---------- quiz answers move out of the student-readable table ----------
create table if not exists public.quiz_answers (
  question_id    uuid primary key references public.quiz_questions(id) on delete cascade,
  correct_answer text not null
);
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'quiz_questions' and column_name = 'correct_answer') then
    insert into public.quiz_answers (question_id, correct_answer)
      select id, correct_answer from public.quiz_questions
      on conflict (question_id) do nothing;
    alter table public.quiz_questions drop column correct_answer;
  end if;
end $$;

-- ---------- points ledger: single source of truth ----------
create table if not exists public.points_ledger (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id),
  user_id        uuid not null references public.users(id) on delete cascade,
  source         text not null check (source in ('chanting', 'reading', 'quiz_bonus', 'manual_bonus', 'adjustment')),
  points         numeric(10, 2) not null,
  activity_date  date not null,
  reference_id   uuid,
  note           text,
  meta           jsonb,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create unique index if not exists points_ledger_daily_key
  on public.points_ledger (competition_id, user_id, source, activity_date) where source in ('chanting', 'reading');
create unique index if not exists points_ledger_quiz_key
  on public.points_ledger (competition_id, user_id, reference_id) where source = 'quiz_bonus';
create index if not exists points_ledger_comp_user_idx on public.points_ledger (competition_id, user_id);

create table if not exists public.competition_totals (
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  chanting_points numeric(12, 2) not null default 0,
  reading_points  numeric(12, 2) not null default 0,
  bonus_points    numeric(12, 2) not null default 0,
  total           numeric(12, 2) not null default 0,
  current_streak  integer not null default 0,
  best_streak     integer not null default 0,
  shields_left    integer not null default 0,
  last_log_date   date,
  reached_at      timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (competition_id, user_id)
);
create index if not exists competition_totals_rank_idx on public.competition_totals (competition_id, total desc);

-- frozen standings written by finalize_competition
create table if not exists public.competition_final_standings (
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  rank            integer not null,
  total           numeric(12, 2) not null,
  chanting_points numeric(12, 2) not null default 0,
  reading_points  numeric(12, 2) not null default 0,
  bonus_points    numeric(12, 2) not null default 0,
  best_streak     integer not null default 0,
  full_name       text,
  avatar_url      text,
  department      text,
  gender          text,
  primary key (competition_id, user_id)
);

-- ---------- awards ----------
create table if not exists public.competition_awards (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  award_key      text not null,
  name           text not null,
  description    text,
  icon_key       text,
  image_url      text,
  criterion      text not null check (criterion in
                   ('highest_total', 'highest_chanting', 'highest_reading', 'longest_streak',
                    'highest_single_day', 'most_quiz_bonus', 'highest_bonus', 'top_n_total', 'manual')),
  top_n          integer check (top_n is null or top_n between 1 and 50),
  gender_scope   text not null default 'all' check (gender_scope in ('all', 'M', 'F')),
  unlock_date    date not null,
  sort_order     integer not null default 0,
  unique (competition_id, award_key)
);

create table if not exists public.user_awards (
  id                   uuid primary key default gen_random_uuid(),
  competition_id       uuid not null references public.competitions(id),
  competition_award_id uuid not null references public.competition_awards(id),
  user_id              uuid not null references public.users(id) on delete cascade,
  rank                 integer,
  score_at_finalization numeric(12, 2),
  unlock_date          date not null,
  custom_message       text,
  granted_by           uuid,
  granted_at           timestamptz not null default now(),
  seen_at              timestamptz,
  revoked_at           timestamptz,
  unique (competition_award_id, user_id)
);
create index if not exists user_awards_user_idx on public.user_awards (user_id);

-- ---------- public-safe live feed (written only by server functions) ----------
create table if not exists public.activity_feed (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  kind           text not null check (kind in ('chanting', 'reading', 'quiz_bonus', 'manual_bonus', 'listen', 'award')),
  full_name      text,
  avatar_url     text,
  department     text,
  gender         text,
  detail         jsonb not null default '{}'::jsonb,   -- rounds, minutes, title, award name ...
  delta          jsonb not null default '{}'::jsonb,   -- {chanting, reading, bonus, total} change to the user's totals
  streak         integer,
  visible_from   date not null default public.ist_today(),
  created_at     timestamptz not null default now()
);
create index if not exists activity_feed_comp_idx on public.activity_feed (competition_id, created_at desc);

-- legacy awards table (always empty live) is kept, read-only, for history
do $$ begin
  if to_regclass('public.awards') is not null and to_regclass('public.awards_legacy') is null then
    alter table public.awards rename to awards_legacy;
  end if;
end $$;

-- realtime for the live feed
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.activity_feed;
    exception when duplicate_object then null; end;
  end if;
end $$;
