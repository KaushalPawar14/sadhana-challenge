-- =====================================================================
-- 20261031000500  Mandatory per-type commitments
--   chanting competitions  -> daily commitment in ROUNDS (1-16)  - required before the first log
--   reading competitions   -> daily commitment in MINUTES (1-60) - required before the first reading session
--   both                   -> BOTH are required together at the first activity
-- Commitments can only be raised, never lowered. Enforced here in the database.
-- Legacy values above 16 (one migrated student has 55) are kept as history: the new range check is NOT VALID.
-- =====================================================================
alter table public.competition_participants add column if not exists reading_commitment_minutes integer;
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.competition_participants'::regclass and contype = 'c' loop
    execute format('alter table public.competition_participants drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.competition_participants add constraint competition_participants_commitment_rounds_check
  check (commitment_rounds is null or commitment_rounds between 1 and 16) not valid;
alter table public.competition_participants add constraint competition_participants_reading_minutes_check
  check (reading_commitment_minutes is null or reading_commitment_minutes between 1 and 60);

drop function if exists public.set_commitment(integer);
drop function if exists public.hod_set_commitment(uuid, uuid, integer);

create or replace function public.set_commitment(p_rounds integer default null, p_minutes integer default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); c public.competitions; cur_r int; cur_m int; new_r int; new_m int;
        need_ch boolean; need_rd boolean;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  c := public.open_competition();
  if c.id is null then raise exception 'NO_ACTIVE_COMPETITION'; end if;
  perform 1 from public.users where id = uid and is_onboarded;
  if not found then raise exception 'NOT_ONBOARDED'; end if;
  need_ch := c.type in ('chanting', 'both');
  need_rd := c.type in ('reading', 'both');
  if p_rounds is not null then
    if not need_ch then raise exception 'CHANTING_NOT_ENABLED'; end if;
    if p_rounds < 1 or p_rounds > 16 then raise exception 'INVALID_COMMITMENT'; end if;
  end if;
  if p_minutes is not null then
    if not need_rd then raise exception 'READING_NOT_ENABLED'; end if;
    if p_minutes < 1 or p_minutes > 60 then raise exception 'INVALID_READING_COMMITMENT'; end if;
  end if;
  select commitment_rounds, reading_commitment_minutes into cur_r, cur_m
    from public.competition_participants where competition_id = c.id and user_id = uid;
  if cur_r is not null and p_rounds is not null and p_rounds < cur_r then raise exception 'COMMITMENT_CANNOT_DECREASE'; end if;
  if cur_m is not null and p_minutes is not null and p_minutes < cur_m then raise exception 'READING_COMMITMENT_CANNOT_DECREASE'; end if;
  new_r := coalesce(p_rounds, cur_r);
  new_m := coalesce(p_minutes, cur_m);
  -- the first time, every commitment this competition type needs must be given together
  if need_ch and new_r is null then raise exception 'COMMITMENT_REQUIRED'; end if;
  if need_rd and new_m is null then raise exception 'READING_COMMITMENT_REQUIRED'; end if;
  insert into public.competition_participants (competition_id, user_id, commitment_rounds, reading_commitment_minutes)
  values (c.id, uid, case when need_ch then new_r end, case when need_rd then new_m end)
  on conflict (competition_id, user_id) do update
    set commitment_rounds = excluded.commitment_rounds, reading_commitment_minutes = excluded.reading_commitment_minutes;
  return jsonb_build_object('commitment', new_r, 'reading_commitment', new_m);
end $$;

create or replace function public.hod_set_commitment(p_comp uuid, p_user uuid, p_rounds integer default null, p_minutes integer default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.assert_hod();
  if p_rounds is null and p_minutes is null then raise exception 'INVALID_COMMITMENT'; end if;
  if p_rounds is not null and (p_rounds < 1 or p_rounds > 16) then raise exception 'INVALID_COMMITMENT'; end if;
  if p_minutes is not null and (p_minutes < 1 or p_minutes > 60) then raise exception 'INVALID_READING_COMMITMENT'; end if;
  insert into public.competition_participants (competition_id, user_id, commitment_rounds, reading_commitment_minutes)
  values (p_comp, p_user, p_rounds, p_minutes)
  on conflict (competition_id, user_id) do update
    set commitment_rounds = coalesce(excluded.commitment_rounds, public.competition_participants.commitment_rounds),
        reading_commitment_minutes = coalesce(excluded.reading_commitment_minutes, public.competition_participants.reading_commitment_minutes);
end $$;

create or replace function public.log_chanting(p_date date, p_rounds integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); c public.competitions; cfg jsonb; today date := public.ist_today();
        commit_ int; rc_ int; d date; old public.competition_totals; new_ public.competition_totals; lg record; n int;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform 1 from public.users where id = uid and is_onboarded;
  if not found then raise exception 'NOT_ONBOARDED'; end if;
  c := public.open_competition();
  if c.id is null then raise exception 'NO_ACTIVE_COMPETITION'; end if;
  if c.type not in ('chanting', 'both') then raise exception 'CHANTING_NOT_ENABLED'; end if;
  cfg := public.comp_cfg(c.config);
  d := coalesce(p_date, today);
  if d < c.start_date or d > c.end_date then raise exception 'DATE_OUTSIDE_COMPETITION'; end if;
  if d > today then raise exception 'FUTURE_DATE'; end if;
  if today - d > (cfg ->> 'late_log_days')::int then raise exception 'LATE_NOT_ALLOWED'; end if;
  if p_rounds is null or p_rounds < 0 or p_rounds > 300 then raise exception 'INVALID_ROUNDS'; end if;
  select commitment_rounds, reading_commitment_minutes into commit_, rc_ from public.competition_participants where competition_id = c.id and user_id = uid;
  if commit_ is null then raise exception 'COMMITMENT_REQUIRED'; end if;
  if c.type = 'both' and rc_ is null then raise exception 'READING_COMMITMENT_REQUIRED'; end if;
  select * into old from public.competition_totals where competition_id = c.id and user_id = uid;

  insert into public.activity_logs (user_id, competition_id, log_date, chanting_rounds, points_earned,
                                    is_late_submission, source, commitment_rounds, submitted_at)
  values (uid, c.id, d, p_rounds, 0, d < today, 'manual', commit_, public.app_now())
  on conflict (competition_id, user_id, log_date) do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'ALREADY_LOGGED'; end if;

  new_ := public.recompute_user(c.id, uid);
  select points, meta into lg from public.points_ledger
   where competition_id = c.id and user_id = uid and source = 'chanting' and activity_date = d;
  perform public.emit_feed(c.id, uid, 'chanting', jsonb_build_object('rounds', p_rounds, 'date', d), old, new_);
  return jsonb_build_object('points', lg.points, 'base', lg.meta -> 'base', 'multiplier', lg.meta -> 'multiplier',
                            'streak', new_.current_streak, 'total', new_.total, 'date', d);
end $$;

create or replace function public.start_reading_session(p_book uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); c public.competitions; sid uuid; r record; cm_r int; cm_m int;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  c := public.active_competition();
  if c.id is null then raise exception 'NO_ACTIVE_COMPETITION'; end if;
  if c.type not in ('reading', 'both') then raise exception 'READING_NOT_ENABLED'; end if;
  perform 1 from public.books where id = p_book;
  if not found then raise exception 'BOOK_NOT_FOUND'; end if;
  perform 1 from public.users where id = uid and is_onboarded;
  if not found then raise exception 'NOT_ONBOARDED'; end if;
  select commitment_rounds, reading_commitment_minutes into cm_r, cm_m from public.competition_participants where competition_id = c.id and user_id = uid;
  if cm_m is null then raise exception 'READING_COMMITMENT_REQUIRED'; end if;
  if c.type = 'both' and cm_r is null then raise exception 'COMMITMENT_REQUIRED'; end if;
  for r in select session_id from public.reading_sessions where user_id = uid and status = 'open' loop
    perform public.reading_close_session(r.session_id, false);
  end loop;
  insert into public.reading_sessions (user_id, book_id, seconds_read, competition_id, started_at, last_seen_at, status, counted_seconds)
  values (uid, p_book, 0, c.id, public.app_now(), public.app_now(), 'open', 0)
  returning session_id into sid;
  return sid;
end $$;

create or replace function public.sync_chanting(p_rounds integer default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); c public.competitions; today date := public.ist_today();
        today_rounds int := 0; fulfilled date[] := '{}'; r record; n int; commit_ int;
        old public.competition_totals; new_ public.competition_totals; dflt int;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public.close_stale_sessions(uid);
  c := public.open_competition();
  if c.id is null or c.type not in ('chanting', 'both') then
    return jsonb_build_object('success', true, 'active', false, 'todayRounds', 0, 'autoFulfilledDates', '[]'::jsonb);
  end if;
  perform 1 from public.users where id = uid and is_onboarded;
  if not found then raise exception 'NOT_ONBOARDED'; end if;

  if p_rounds is not null then
    if p_rounds < 0 or p_rounds > 300 then raise exception 'INVALID_ROUNDS'; end if;
    if today between c.start_date and c.end_date then
      insert into public.user_chanting_logs (user_id, competition_id, log_date, rounds_chanted, updated_at)
      values (uid, c.id, today, p_rounds, public.app_now())
      on conflict (competition_id, user_id, log_date) do update
        set rounds_chanted = greatest(public.user_chanting_logs.rounds_chanted, excluded.rounds_chanted),
            updated_at = public.app_now();
    end if;
  end if;

  select commitment_rounds into commit_ from public.competition_participants where competition_id = c.id and user_id = uid;
  for r in
    select l.log_date, l.rounds_chanted from public.user_chanting_logs l
    where l.competition_id = c.id and l.user_id = uid and l.rounds_chanted > 0
      and l.log_date < today and l.log_date between c.start_date and c.end_date
      and not exists (select 1 from public.activity_logs a
                      where a.competition_id = c.id and a.user_id = uid and a.log_date = l.log_date)
    order by l.log_date
  loop
    if commit_ is null then
      select least(greatest(coalesce(target_chanting, 16), 1), 16) into dflt from public.users where id = uid;
      insert into public.competition_participants (competition_id, user_id, commitment_rounds)
      values (c.id, uid, dflt) on conflict (competition_id, user_id) do update
        set commitment_rounds = coalesce(public.competition_participants.commitment_rounds, excluded.commitment_rounds);
      commit_ := dflt;
    end if;
    insert into public.activity_logs (user_id, competition_id, log_date, chanting_rounds, points_earned,
                                      is_late_submission, source, commitment_rounds, submitted_at)
    values (uid, c.id, r.log_date, least(r.rounds_chanted, 300), 0, false, 'auto', commit_, public.app_now())
    on conflict (competition_id, user_id, log_date) do nothing;
    get diagnostics n = row_count;
    if n > 0 then fulfilled := fulfilled || r.log_date; end if;
  end loop;

  if array_length(fulfilled, 1) > 0 then
    select * into old from public.competition_totals where competition_id = c.id and user_id = uid;
    new_ := public.recompute_user(c.id, uid);
    perform public.emit_feed(c.id, uid, 'chanting',
      jsonb_build_object('auto', true, 'dates', to_jsonb(fulfilled)), old, new_);
  end if;

  select coalesce(rounds_chanted, 0) into today_rounds from public.user_chanting_logs
   where competition_id = c.id and user_id = uid and log_date = today;
  return jsonb_build_object('success', true, 'active', true, 'todayRounds', coalesce(today_rounds, 0),
                            'autoFulfilledDates', to_jsonb(fulfilled));
end $$;

create or replace function public.get_my_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); c public.competitions; cfg jsonb; today date := public.ist_today();
        logged date[]; loggable jsonb; commit_ int; rcommit_ int; t public.competition_totals; counter int := 0; late int;
begin
  c := public.open_competition();
  if c.id is null then return jsonb_build_object('competition_id', null); end if;
  cfg := public.comp_cfg(c.config); late := (cfg ->> 'late_log_days')::int;
  select commitment_rounds, reading_commitment_minutes into commit_, rcommit_ from public.competition_participants where competition_id = c.id and user_id = uid;
  select * into t from public.competition_totals where competition_id = c.id and user_id = uid;
  select coalesce(array_agg(log_date), '{}') into logged from public.activity_logs where competition_id = c.id and user_id = uid;
  select coalesce(jsonb_agg(d::date order by d desc), '[]'::jsonb) into loggable
    from generate_series(greatest(c.start_date, today - late), least(c.end_date, today), interval '1 day') d
   where d::date <> all (logged);
  select coalesce(rounds_chanted, 0) into counter from public.user_chanting_logs
   where competition_id = c.id and user_id = uid and log_date = today;
  return jsonb_build_object(
    'competition_id', c.id, 'commitment', commit_, 'reading_commitment', rcommit_,
    'required', jsonb_build_object('chanting', c.type in ('chanting', 'both'), 'reading', c.type in ('reading', 'both')),
    'logged_dates', to_jsonb(logged), 'loggable_dates', loggable,
    'counter_today', coalesce(counter, 0),
    'totals', case when t.user_id is null then null else to_jsonb(t) end,
    'default_commitment', (select target_chanting from public.users where id = uid));
end $$;

grant execute on function public.set_commitment(integer, integer), public.hod_set_commitment(uuid, uuid, integer, integer) to authenticated, service_role;
