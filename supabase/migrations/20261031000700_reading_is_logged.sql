-- =====================================================================
-- 20261031000700  Reading works like chanting: it is LOGGED, never measured by the website
--   * Students log their reading MINUTES in the daily log (same log as chanting rounds).
--   * Points = (minutes read / reading commitment) x points_at_commitment (x streak multiplier), exactly like chanting.
--   * The leaderboard takes data ONLY from the log activity (plus the in-app quiz bonus and HOD bonus).
--     No reader timer, no sessions, and the Japa counter no longer creates logs (it only pre-fills the form).
-- Old reading_sessions rows are kept as history but are no longer used for scoring.
-- =====================================================================
alter table public.activity_logs add column if not exists reading_commitment_minutes integer;

drop function if exists public.start_reading_session(uuid);
drop function if exists public.heartbeat_reading_session(uuid);
drop function if exists public.end_reading_session(uuid, boolean);
drop function if exists public.reading_close_session(uuid, boolean);
drop function if exists public.close_stale_sessions(uuid);
drop function if exists public.log_chanting(date, integer);

create or replace function public.comp_cfg(p_config jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'chanting_points_at_commitment', 10,
    'streak_multiplier_enabled', true,
    'streak_multiplier_cap', 5,
    'shield_count', 1,
    'reading_points_at_commitment', 10,
    'weight_reading', 1,
    'weight_chanting', 1,
    'quiz_points_per_correct', 5,
    'listen_threshold_pct', 80,
    'max_quiz_bonus', null,
    'late_log_days', 1,
    'use_logged_points', false
  ) || coalesce(p_config, '{}'::jsonb)
$$;

-- Recompute every derived number for one user from the LOG rows (activity_logs) and the bonus ledger rows.
create or replace function public.recompute_user(p_comp uuid, p_user uuid)
returns public.competition_totals
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.competitions; cfg jsonb;
  pts_ch numeric; pts_rd numeric; mult_on boolean; mult_cap int; shields int; w_c numeric; w_r numeric; use_logged boolean;
  streak int := 0; best int := 0; shield int := 0; last_d date;
  d record; mult numeric; base numeric; day_pts numeric;
  ch_days date[] := '{}'; rd_days date[] := '{}';
  v_ch numeric; v_rd numeric; v_bonus numeric; v_reached timestamptz;
  t public.competition_totals;
begin
  select * into c from public.competitions where id = p_comp;
  if c.id is null then raise exception 'COMPETITION_NOT_FOUND'; end if;
  if c.stored_status = 'finalized' then raise exception 'COMPETITION_FINALIZED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_comp::text || p_user::text, 0));

  cfg := public.comp_cfg(c.config);
  pts_ch := (cfg ->> 'chanting_points_at_commitment')::numeric;
  pts_rd := (cfg ->> 'reading_points_at_commitment')::numeric;
  mult_on := (cfg ->> 'streak_multiplier_enabled')::boolean;
  mult_cap := (cfg ->> 'streak_multiplier_cap')::int;
  shields := (cfg ->> 'shield_count')::int;
  use_logged := coalesce((cfg ->> 'use_logged_points')::boolean, false);
  w_c := case when c.type = 'both' then (cfg ->> 'weight_chanting')::numeric else 1 end;
  w_r := case when c.type = 'both' then (cfg ->> 'weight_reading')::numeric else 1 end;
  shield := shields;

  for d in
    select l.log_date as day, l.chanting_rounds as rounds, l.reading_minutes as mins, l.id as ref, l.submitted_at as ts,
           coalesce(l.commitment_rounds, 16) as commit_r, coalesce(l.reading_commitment_minutes, 30) as commit_m,
           l.points_earned as logged
    from public.activity_logs l
    where l.competition_id = p_comp and l.user_id = p_user
    order by l.log_date
  loop
    -- every submitted log is an active day (streak, shield) - same rule for chanting and reading
    if last_d is null then
      streak := 1;
    elsif d.day - last_d = 1 then
      streak := streak + 1;
    elsif d.day - last_d = 2 and shield > 0 then
      streak := streak + 1; shield := shield - 1;
    else
      streak := 1;
    end if;
    best := greatest(best, streak);
    last_d := d.day;
    mult := case when mult_on then least(streak, mult_cap) else 1 end;

    if c.type in ('chanting', 'both') then
      base := round(d.rounds::numeric / d.commit_r * pts_ch);
      day_pts := base * mult;
      if use_logged then day_pts := coalesce(d.logged, 0); end if;   -- migrated competition: keep historical per-day points
      insert into public.points_ledger (competition_id, user_id, source, points, activity_date, reference_id, meta, created_at)
      values (p_comp, p_user, 'chanting', day_pts, d.day, d.ref,
              jsonb_build_object('rounds', d.rounds, 'commitment', d.commit_r, 'base', base, 'multiplier', mult, 'streak', streak, 'legacy', use_logged),
              coalesce(d.ts, now()))
      on conflict (competition_id, user_id, source, activity_date) where source in ('chanting', 'reading')
      do update set points = excluded.points, reference_id = excluded.reference_id, meta = excluded.meta;
      ch_days := ch_days || d.day;
    end if;

    if c.type in ('reading', 'both') then
      base := round(d.mins::numeric / d.commit_m * pts_rd);
      day_pts := base * mult;
      insert into public.points_ledger (competition_id, user_id, source, points, activity_date, reference_id, meta, created_at)
      values (p_comp, p_user, 'reading', day_pts, d.day, d.ref,
              jsonb_build_object('minutes', d.mins, 'commitment', d.commit_m, 'base', base, 'multiplier', mult, 'streak', streak),
              coalesce(d.ts, now()))
      on conflict (competition_id, user_id, source, activity_date) where source in ('chanting', 'reading')
      do update set points = excluded.points, reference_id = excluded.reference_id, meta = excluded.meta;
      rd_days := rd_days || d.day;
    end if;
  end loop;

  delete from public.points_ledger
   where competition_id = p_comp and user_id = p_user and source = 'chanting' and activity_date <> all (ch_days);
  delete from public.points_ledger
   where competition_id = p_comp and user_id = p_user and source = 'reading' and activity_date <> all (rd_days);

  -- keep the per-day column informative (raw points of the day, before weights)
  update public.activity_logs a
     set points_earned = coalesce((select sum(p.points) from public.points_ledger p
                                    where p.competition_id = a.competition_id and p.user_id = a.user_id
                                      and p.source in ('chanting', 'reading') and p.activity_date = a.log_date), 0)::int
   where a.competition_id = p_comp and a.user_id = p_user;

  select coalesce(sum(points) filter (where source = 'chanting'), 0),
         coalesce(sum(points) filter (where source = 'reading'), 0),
         coalesce(sum(points) filter (where source in ('quiz_bonus', 'manual_bonus', 'adjustment')), 0),
         max(created_at) filter (where points > 0)
    into v_ch, v_rd, v_bonus, v_reached
    from public.points_ledger where competition_id = p_comp and user_id = p_user;

  insert into public.competition_totals as ct
    (competition_id, user_id, chanting_points, reading_points, bonus_points, total,
     current_streak, best_streak, shields_left, last_log_date, reached_at, updated_at)
  values (p_comp, p_user, v_ch, v_rd, v_bonus, v_ch * w_c + v_rd * w_r + v_bonus,
          streak, best, shield, last_d, v_reached, now())
  on conflict (competition_id, user_id) do update set
    chanting_points = excluded.chanting_points, reading_points = excluded.reading_points,
    bonus_points = excluded.bonus_points, total = excluded.total,
    current_streak = excluded.current_streak, best_streak = excluded.best_streak,
    shields_left = excluded.shields_left, last_log_date = excluded.last_log_date,
    reached_at = excluded.reached_at, updated_at = now()
  returning * into t;

  update public.users set total_points = coalesce(
      (select round(sum(x.total))::int from public.competition_totals x where x.user_id = p_user), 0)
   where id = p_user;
  return t;
end $$;

-- THE daily log. chanting -> rounds, reading -> minutes, both -> both fields. Commitments are mandatory.
create or replace function public.log_activity(p_date date, p_rounds integer default null, p_minutes integer default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); c public.competitions; cfg jsonb; today date := public.ist_today();
        commit_r int; commit_m int; d date; old public.competition_totals; new_ public.competition_totals;
        lc record; lr record; n int; need_ch boolean; need_rd boolean;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform 1 from public.users where id = uid and is_onboarded;
  if not found then raise exception 'NOT_ONBOARDED'; end if;
  c := public.open_competition();
  if c.id is null then raise exception 'NO_ACTIVE_COMPETITION'; end if;
  need_ch := c.type in ('chanting', 'both');
  need_rd := c.type in ('reading', 'both');
  if p_rounds is not null and not need_ch then raise exception 'CHANTING_NOT_ENABLED'; end if;
  if p_minutes is not null and not need_rd then raise exception 'READING_NOT_ENABLED'; end if;
  if need_ch and p_rounds is null then raise exception 'INVALID_ROUNDS'; end if;
  if need_rd and p_minutes is null then raise exception 'INVALID_MINUTES'; end if;
  if need_ch and (p_rounds < 0 or p_rounds > 300) then raise exception 'INVALID_ROUNDS'; end if;
  if need_rd and (p_minutes < 0 or p_minutes > 600) then raise exception 'INVALID_MINUTES'; end if;

  cfg := public.comp_cfg(c.config);
  d := coalesce(p_date, today);
  if d < c.start_date or d > c.end_date then raise exception 'DATE_OUTSIDE_COMPETITION'; end if;
  if d > today then raise exception 'FUTURE_DATE'; end if;
  if today - d > (cfg ->> 'late_log_days')::int then raise exception 'LATE_NOT_ALLOWED'; end if;

  select commitment_rounds, reading_commitment_minutes into commit_r, commit_m
    from public.competition_participants where competition_id = c.id and user_id = uid;
  if need_ch and commit_r is null then raise exception 'COMMITMENT_REQUIRED'; end if;
  if need_rd and commit_m is null then raise exception 'READING_COMMITMENT_REQUIRED'; end if;
  select * into old from public.competition_totals where competition_id = c.id and user_id = uid;

  insert into public.activity_logs (user_id, competition_id, log_date, chanting_rounds, reading_minutes, points_earned,
                                    is_late_submission, source, commitment_rounds, reading_commitment_minutes, submitted_at)
  values (uid, c.id, d, coalesce(p_rounds, 0), coalesce(p_minutes, 0), 0, d < today, 'manual',
          case when need_ch then commit_r end, case when need_rd then commit_m end, public.app_now())
  on conflict (competition_id, user_id, log_date) do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'ALREADY_LOGGED'; end if;

  new_ := public.recompute_user(c.id, uid);
  select points, meta into lc from public.points_ledger
   where competition_id = c.id and user_id = uid and source = 'chanting' and activity_date = d;
  select points, meta into lr from public.points_ledger
   where competition_id = c.id and user_id = uid and source = 'reading' and activity_date = d;
  perform public.emit_feed(c.id, uid, case when need_ch then 'chanting' else 'reading' end,
    jsonb_build_object('rounds', p_rounds, 'minutes', p_minutes, 'date', d), old, new_);
  return jsonb_build_object(
    'points', coalesce(lc.points, 0) + coalesce(lr.points, 0),
    'chanting_points', lc.points, 'reading_points', lr.points,
    'base', coalesce(lc.meta -> 'base', lr.meta -> 'base'),
    'multiplier', coalesce(lc.meta -> 'multiplier', lr.meta -> 'multiplier'),
    'streak', new_.current_streak, 'total', new_.total, 'date', d);
end $$;

-- Japa counter: records today's counted rounds so the log form can PRE-FILL them. It never creates a log or
-- points - the leaderboard is fed only by the log the student submits.
create or replace function public.sync_chanting(p_rounds integer default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); c public.competitions; today date := public.ist_today(); today_rounds int := 0;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
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
  select coalesce(rounds_chanted, 0) into today_rounds from public.user_chanting_logs
   where competition_id = c.id and user_id = uid and log_date = today;
  return jsonb_build_object('success', true, 'active', true, 'todayRounds', coalesce(today_rounds, 0),
                            'autoFulfilledDates', '[]'::jsonb);
end $$;

create or replace function public.save_competition(p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cid uuid := nullif(p ->> 'id', '')::uuid; existing public.competitions; cfg jsonb;
  v_status text := coalesce(p ->> 'status', 'draft'); sd date; ed date; conflict_title text;
  v_type text := p ->> 'type'; k text; v numeric; needs_rebuild boolean := false;
begin
  perform public.assert_hod();
  if nullif(trim(p ->> 'title'), '') is null then raise exception 'INVALID: title is required'; end if;
  if v_type not in ('reading', 'chanting', 'both') then raise exception 'INVALID: type'; end if;
  if v_status not in ('draft', 'published') then raise exception 'INVALID: status must be draft or published'; end if;
  sd := (p ->> 'start_date')::date; ed := (p ->> 'end_date')::date;
  if sd is null or ed is null then raise exception 'INVALID: start and end dates are required'; end if;
  if ed < sd then raise exception 'INVALID: end date must be on or after start date'; end if;

  cfg := coalesce(p -> 'config', '{}'::jsonb);
  foreach k in array array['chanting_points_at_commitment', 'streak_multiplier_cap', 'shield_count',
                           'reading_points_at_commitment',
                           'weight_reading', 'weight_chanting', 'quiz_points_per_correct', 'late_log_days'] loop
    if cfg ? k then
      v := (cfg ->> k)::numeric;
      if v is null or v < 0 then raise exception 'INVALID: % must be 0 or more', k; end if;
    end if;
  end loop;
  if cfg ? 'listen_threshold_pct' then
    v := (cfg ->> 'listen_threshold_pct')::numeric;
    if v < 1 or v > 100 then raise exception 'INVALID: listen_threshold_pct must be 1-100'; end if;
  end if;
  if cfg ? 'max_quiz_bonus' and cfg -> 'max_quiz_bonus' <> 'null'::jsonb and (cfg ->> 'max_quiz_bonus')::numeric < 0 then
    raise exception 'INVALID: max_quiz_bonus must be 0 or more';
  end if;
  if (cfg ? 'streak_multiplier_cap') and (cfg ->> 'streak_multiplier_cap')::numeric < 1 then
    raise exception 'INVALID: streak_multiplier_cap must be at least 1';
  end if;

  if cid is not null then
    select * into existing from public.competitions where id = cid for update;
    if existing.id is null then raise exception 'COMPETITION_NOT_FOUND'; end if;
    if existing.stored_status = 'finalized' then raise exception 'COMPETITION_FINALIZED'; end if;
    if existing.stored_status = 'published' and v_status = 'draft'
       and exists (select 1 from public.activity_logs where competition_id = cid) then
      raise exception 'INVALID: a competition with activity cannot go back to draft';
    end if;
  end if;

  if v_status = 'published' then
    select title into conflict_title from public.competitions o
     where (cid is null or o.id <> cid) and o.stored_status in ('published', 'finalized')
       and o.start_date <= ed and o.end_date >= sd limit 1;
    if conflict_title is not null then
      raise exception 'OVERLAPS_EXISTING_COMPETITION: dates overlap with "%"', conflict_title;
    end if;
  end if;

  if cid is null then
    insert into public.competitions (title, description, cover_photo_url, type, bonus_enabled, start_date, end_date,
                                     stored_status, config, created_by)
    values (trim(p ->> 'title'), nullif(trim(coalesce(p ->> 'description', '')), ''),
            nullif(trim(coalesce(p ->> 'cover_photo_url', '')), ''), v_type,
            coalesce((p ->> 'bonus_enabled')::boolean, false), sd, ed, v_status, cfg, auth.uid())
    returning id into cid;
    perform public.seed_default_awards(cid);
  else
    needs_rebuild := existing.stored_status = 'published'
      and (existing.type <> v_type or existing.bonus_enabled <> coalesce((p ->> 'bonus_enabled')::boolean, false)
           or existing.config <> cfg or existing.start_date <> sd or existing.end_date <> ed);
    update public.competitions set
      title = trim(p ->> 'title'),
      description = nullif(trim(coalesce(p ->> 'description', '')), ''),
      cover_photo_url = nullif(trim(coalesce(p ->> 'cover_photo_url', '')), ''),
      type = v_type, bonus_enabled = coalesce((p ->> 'bonus_enabled')::boolean, false),
      start_date = sd, end_date = ed,
      stored_status = case when existing.stored_status = 'archived' then 'archived' else v_status end,
      config = cfg, updated_at = now()
    where id = cid;
    if needs_rebuild and public.ist_today() >= least(existing.start_date, sd) then
      perform public.rebuild_competition_totals(cid);
    end if;
  end if;
  return cid;
end $$;

grant execute on function public.log_activity(date, integer, integer) to authenticated, service_role;
