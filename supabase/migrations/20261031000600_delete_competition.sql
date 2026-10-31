-- =====================================================================
-- 20261031000600  HOD can delete a competition (any status), with a typed-title confirmation
-- Deleting removes the competition and ALL of its data: logs, reading sessions, quiz results, bonus,
-- ledger, totals, awards (definitions and winners), standings and feed rows. Lifetime totals are
-- recomputed for the affected students. HOD only; the exact title must be supplied.
-- (Prefer "Archive" when the history may still be wanted.)
-- =====================================================================
create or replace function public.delete_competition(p_id uuid, p_confirm_title text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.competitions; affected uuid[]; n_logs int;
begin
  perform public.assert_hod();
  select * into c from public.competitions where id = p_id for update;
  if c.id is null then return jsonb_build_object('deleted', false); end if;
  if lower(trim(coalesce(p_confirm_title, ''))) <> lower(trim(c.title)) then
    raise exception 'INVALID: type the exact competition title to confirm the deletion';
  end if;

  select coalesce(array_agg(distinct x.user_id), '{}') into affected from (
    select user_id from public.competition_totals where competition_id = p_id
    union select user_id from public.activity_logs where competition_id = p_id
    union select user_id from public.reading_sessions where competition_id = p_id) x;
  select count(*) into n_logs from public.activity_logs where competition_id = p_id;

  -- tables that reference the competition without ON DELETE CASCADE
  delete from public.user_awards where competition_id = p_id;
  delete from public.points_ledger where competition_id = p_id;
  delete from public.quiz_submissions where competition_id = p_id;
  delete from public.user_audiobook_progress where competition_id = p_id;
  delete from public.user_chanting_logs where competition_id = p_id;
  delete from public.reading_sessions where competition_id = p_id;
  delete from public.bonus_points where competition_id = p_id;
  delete from public.activity_logs where competition_id = p_id;
  -- cascades: competition_awards, competition_participants, competition_totals,
  --           competition_final_standings, activity_feed
  delete from public.competitions where id = p_id;

  update public.users u
     set total_points = coalesce((select round(sum(t.total))::int from public.competition_totals t where t.user_id = u.id), 0)
   where u.id = any (affected);

  return jsonb_build_object('deleted', true, 'title', c.title, 'logs_removed', n_logs,
                            'students_affected', coalesce(array_length(affected, 1), 0));
end $$;

revoke execute on function public.delete_competition(uuid, text) from public, anon;
grant execute on function public.delete_competition(uuid, text) to authenticated, service_role;
