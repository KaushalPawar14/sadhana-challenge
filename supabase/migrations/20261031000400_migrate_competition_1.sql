-- =====================================================================
-- 20261031000400  Data migration: build "Competition 1" from app_settings
-- Idempotent: skipped when a competition marked migrated_from='app_settings' exists.
-- Leaves Competition 1 'published' with a past end date => derived status 'ended'
-- (NOT finalized) so the HOD runs Finalize and chooses the winners.
-- =====================================================================
create table if not exists public.migration_report_competition1 (
  user_id    uuid primary key,
  full_name  text,
  old_total  integer,
  new_total  numeric(12, 2),
  diff       numeric(12, 2),
  cause      text
);
create table if not exists public.migration_flags_competition1 (
  id      bigserial primary key,
  kind    text not null,
  detail  text not null
);
alter table public.migration_report_competition1 enable row level security;
alter table public.migration_flags_competition1 enable row level security;
revoke all on public.migration_report_competition1, public.migration_flags_competition1 from anon, authenticated;

do $$
declare
  cid uuid; s record; v_title text; v_start date; v_end date; v_cover text; v_late int; v_bonus boolean; v_shield int;
  u record; n int;
begin
  if exists (select 1 from public.competitions where config ->> 'migrated_from' = 'app_settings') then
    raise notice 'Competition 1 already migrated - skipping';
    return;
  end if;

  select value into v_title from public.app_settings where key = 'challenge_title';
  select nullif(value, '')::date into v_start from public.app_settings where key = 'challenge_start_date';
  select nullif(value, '')::date into v_end from public.app_settings where key = 'challenge_end_date';
  select nullif(value, '') into v_cover from public.app_settings where key = 'challenge_image_url';
  select coalesce(nullif(value, '')::int, 1) into v_late from public.app_settings where key = 'late_log_allowed_days';
  select coalesce(nullif(value, '')::int, 1) into v_shield from public.app_settings where key = 'freeze_credits_on_join';
  if v_start is null then select min(log_date) into v_start from public.activity_logs; end if;
  if v_end is null then select max(log_date) into v_end from public.activity_logs; end if;
  if v_start is null then v_start := public.ist_today() - 26; end if;
  if v_end is null then v_end := v_start + 25; end if;

  v_bonus := exists (select 1 from public.quiz_submissions q where public.ist_date_of(q.submitted_at) between v_start and v_end)
          or exists (select 1 from public.bonus_points b where public.ist_date_of(b.given_at) between v_start and v_end);

  insert into public.competitions (title, cover_photo_url, type, bonus_enabled, start_date, end_date, stored_status, config)
  values (coalesce(nullif(v_title, ''), 'Competition 1'), v_cover, 'chanting', v_bonus, v_start, v_end, 'published',
          jsonb_build_object(
            'migrated_from', 'app_settings',
            -- the legacy rule was an UNBOUNDED streak multiplier (day N = Nx) and 1 shield
            -- historical per-day points are preserved verbatim (the formula changed several times while it ran)
            'use_logged_points', true,
            'streak_multiplier_enabled', true, 'streak_multiplier_cap', 1000,
            'shield_count', coalesce(v_shield, 1), 'late_log_days', coalesce(v_late, 1)))
  returning id into cid;
  perform public.seed_default_awards(cid);

  -- commitments per competition, snapshot on every log
  insert into public.competition_participants (competition_id, user_id, commitment_rounds)
  select cid, u2.id, least(greatest(coalesce(u2.target_chanting, 16), 1), 108)
  from public.users u2
  where exists (select 1 from public.activity_logs a where a.user_id = u2.id)
     or exists (select 1 from public.reading_sessions r where r.user_id = u2.id)
  on conflict do nothing;

  update public.activity_logs a set competition_id = cid,
         commitment_rounds = (select p.commitment_rounds from public.competition_participants p where p.competition_id = cid and p.user_id = a.user_id)
   where a.competition_id is null;
  update public.reading_sessions set competition_id = cid,
         status = 'closed', counted_seconds = seconds_read,
         started_at = coalesce(started_at, created_at - make_interval(secs => seconds_read)),
         last_seen_at = coalesce(last_seen_at, created_at), ended_at = coalesce(ended_at, created_at)
   where competition_id is null;
  update public.quiz_submissions set competition_id = cid where competition_id is null;
  update public.bonus_points set competition_id = cid where competition_id is null;
  update public.user_audiobook_progress set competition_id = cid where competition_id is null;
  update public.user_chanting_logs set competition_id = cid where competition_id is null;

  -- flags: rows outside the competition dates (still attached to Competition 1)
  insert into public.migration_flags_competition1 (kind, detail)
  select 'activity_log_outside_dates', count(*) || ' activity_logs rows dated outside ' || v_start || '..' || v_end
    from public.activity_logs where competition_id = cid and (log_date < v_start or log_date > v_end) having count(*) > 0;
  insert into public.migration_flags_competition1 (kind, detail)
  select 'activity_log_after_end', 'user ' || user_id || ' log ' || log_date
    from public.activity_logs where competition_id = cid and log_date > v_end;
  insert into public.migration_flags_competition1 (kind, detail)
  select 'reading_sessions_outside_dates', count(*) || ' reading_sessions rows (' || coalesce(sum(seconds_read), 0) || ' s) dated outside the competition; chanting-only competition => 0 points'
    from public.reading_sessions where competition_id = cid
     and (public.ist_date_of(started_at) < v_start or public.ist_date_of(started_at) > v_end) having count(*) > 0;
  insert into public.migration_flags_competition1 (kind, detail)
  select 'quiz_or_bonus_outside_dates', count(*) || ' quiz/bonus rows outside dates'
    from (select submitted_at ts from public.quiz_submissions where competition_id = cid
          union all select given_at from public.bonus_points where competition_id = cid) x
   where public.ist_date_of(ts) < v_start or public.ist_date_of(ts) > v_end having count(*) > 0;

  -- backfill the ledger with the real engine, then compare with the old counters
  for u in select id, full_name, total_points from public.users where exists
           (select 1 from public.activity_logs a where a.user_id = users.id and a.competition_id = cid)
        or total_points <> 0
  loop
    insert into public.migration_report_competition1 (user_id, full_name, old_total)
    values (u.id, u.full_name, u.total_points) on conflict (user_id) do update set old_total = excluded.old_total;
  end loop;
  for u in select user_id from public.migration_report_competition1 loop
    perform public.recompute_user(cid, u.user_id);
  end loop;
  update public.migration_report_competition1 r
     set new_total = coalesce((select t.total from public.competition_totals t where t.competition_id = cid and t.user_id = r.user_id), 0);
  update public.migration_report_competition1 set diff = new_total - old_total;

  -- likely causes
  update public.migration_report_competition1 r set cause = case
      when diff = 0 then null
      when exists (select 1 from public.activity_logs a where a.competition_id = cid and a.user_id = r.user_id and a.log_date > v_end)
        then 'has logs after end date; streak sequence differs from the old running counter'
      when old_total > 0 and new_total = 0 then 'old total had points but no activity_logs rows (reading/manual points that the chanting-only engine no longer scores)'
      when old_total = 0 and new_total > 0 then 'logs exist but the old running counter had been reset to 0'
      else 'old counter was a running value (streak/shield state at submission time, older commitment); rebuilt from logs' end
   where diff <> 0;

  select count(*) into n from public.migration_report_competition1 where diff <> 0;
  raise notice 'Competition 1 migrated (%). Students whose total changed: %', cid, n;

  -- retire the old single-competition keys (values remain in /backups)
  delete from public.app_settings where key in (
    'challenge_title', 'challenge_start_date', 'challenge_end_date', 'challenge_image_url', 'log_cutoff_hour',
    'late_log_allowed_days', 'points_per_chanting_round', 'points_per_reading_minute', 'points_per_hearing_minute',
    'streak_bonus_multiplier', 'freeze_credits_on_join', 'podcast_completion_threshold');
end $$;
