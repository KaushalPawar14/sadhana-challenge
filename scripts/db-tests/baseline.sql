-- Local-only baseline that mimics the LIVE schema BEFORE the competition migrations
-- (derived from schema.sql + migrations + live PostgREST introspection). Used by PGlite tests only.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table public.admin_emails (id uuid default gen_random_uuid() primary key, email text unique not null, role text default 'HOD');
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade, full_name text, mobile text, department text,
  avatar_url text, target_chanting int default 16, target_reading int default 30, target_hearing int default 30,
  total_points int default 0, streak_count int default 0, best_streak int default 0, last_log_date date,
  freeze_credits int default 1, is_onboarded boolean default false, created_at timestamp default now(),
  gender text check (gender in ('M','F')));
create table public.activity_logs (id uuid default gen_random_uuid() primary key, user_id uuid references public.users(id) on delete cascade,
  log_date date not null, chanting_rounds int default 0, reading_minutes int default 0, hearing_minutes int default 0,
  points_earned int default 0, submitted_at timestamp default now(), is_late_submission boolean default false, unique(user_id, log_date));
create table public.bonus_points (id uuid default gen_random_uuid() primary key, user_id uuid references public.users(id) on delete cascade,
  admin_id uuid references public.users(id), title text not null, points int not null, given_at timestamp default now());
create table public.awards (id uuid default gen_random_uuid() primary key, user_id uuid references public.users(id) on delete cascade,
  award_key text not null, unlocked_at timestamp default now(), custom_message text, unique(user_id, award_key));
create table public.app_settings (key text primary key, value text not null, updated_at timestamp default now());
create table public.audiobooks (id uuid default gen_random_uuid() primary key, category text not null, title text not null,
  audio_url text not null, created_at timestamptz default now(), language text);
create table public.quiz_questions (id uuid default gen_random_uuid() primary key, audiobook_id uuid not null references public.audiobooks(id) on delete cascade,
  question_text text not null, options jsonb not null, correct_answer text not null);
create table public.user_audiobook_progress (id uuid default gen_random_uuid() primary key, user_id uuid not null references public.users(id) on delete cascade,
  audiobook_id uuid not null references public.audiobooks(id) on delete cascade, is_completed boolean default false, completed_at timestamptz, unique(user_id, audiobook_id));
create table public.quiz_submissions (id uuid default gen_random_uuid() primary key, user_id uuid not null references public.users(id) on delete cascade,
  audiobook_id uuid not null references public.audiobooks(id) on delete cascade, score int not null, points_earned int not null,
  submitted_at timestamptz default now(), unique(user_id, audiobook_id));
create table public.books (id uuid default gen_random_uuid() primary key, title text not null, language text not null, pdf_link text not null, created_at timestamptz default now());
create table public.reading_sessions (session_id uuid default gen_random_uuid() primary key, user_id uuid not null references public.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade, seconds_read int not null, created_at timestamptz default now());
create function public.is_admin(user_email text) returns boolean language sql security definer as
  $$ select exists (select 1 from public.admin_emails where email = user_email) $$;
-- test-only clock override (never shipped): app_now() reads this when a row exists
create table public.test_clock (ts timestamptz);
grant select on public.test_clock to public;
