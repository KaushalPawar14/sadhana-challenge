-- =====================================================================
-- 20261031000300  RLS, grants and function privileges
-- Principle: the browser can READ what it needs and WRITE nothing that scores.
-- All writes happen through the SECURITY DEFINER functions in 000200
-- (or through service-role API routes).
-- =====================================================================

-- start clean: drop EVERY existing policy in public (live policies are not in the repo)
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'admin_emails','users','activity_logs','user_chanting_logs','reading_sessions','quiz_submissions',
    'bonus_points','user_audiobook_progress','points_ledger','competition_totals','competition_participants',
    'competition_final_standings','competitions','competition_awards','user_awards','activity_feed',
    'books','audiobooks','quiz_questions','quiz_answers','app_settings','awards_legacy'])
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- ---------- users ----------
grant select on public.users to authenticated;
grant update (full_name, mobile, gender, department, age, avatar_url) on public.users to authenticated;
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or public.admin_can_see_user(id));
create policy users_update_own on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- per-user data: own rows, or admins inside their gender scope ----------
do $$
declare t text;
begin
  for t in select unnest(array['activity_logs','user_chanting_logs','reading_sessions','quiz_submissions',
                               'bonus_points','user_audiobook_progress','points_ledger','competition_totals',
                               'competition_participants','user_awards'])
  loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid() or public.admin_can_see_user(user_id))',
                   t || '_select', t);
  end loop;
end $$;

grant select on public.competition_final_standings to authenticated;
create policy final_standings_select on public.competition_final_standings for select to authenticated
  using (public.is_any_admin() and (public.is_hod() or public.admin_can_see_user(user_id)));

-- ---------- competitions & awards ----------
grant select on public.competitions to authenticated;
create policy competitions_select on public.competitions for select to authenticated
  using (stored_status in ('published', 'finalized') or public.is_any_admin());
grant select on public.competition_awards to authenticated;
create policy competition_awards_select on public.competition_awards for select to authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_id
                 and (c.stored_status in ('published', 'finalized') or public.is_any_admin())));

-- ---------- live feed (public-safe columns only; gender scope for admins) ----------
grant select on public.activity_feed to authenticated;
create policy activity_feed_select on public.activity_feed for select to authenticated
  using (visible_from <= public.ist_today()
         and (public.current_admin_role() is null or public.is_hod() or public.admin_can_see_user(user_id)));

-- ---------- content: hidden by the competition config, HOD manages ----------
grant select, insert, update, delete on public.books, public.audiobooks, public.quiz_questions, public.quiz_answers to authenticated;
create policy books_select on public.books for select to authenticated
  using (public.feature_enabled('books') or public.is_any_admin());
create policy books_hod on public.books for all to authenticated using (public.is_hod()) with check (public.is_hod());
create policy audiobooks_select on public.audiobooks for select to authenticated
  using (public.feature_enabled('podcast') or public.is_any_admin());
create policy audiobooks_hod on public.audiobooks for all to authenticated using (public.is_hod()) with check (public.is_hod());
create policy quiz_questions_select on public.quiz_questions for select to authenticated
  using (public.feature_enabled('podcast') or public.is_any_admin());
create policy quiz_questions_hod on public.quiz_questions for all to authenticated using (public.is_hod()) with check (public.is_hod());
-- correct answers: HOD only, never students
create policy quiz_answers_hod on public.quiz_answers for all to authenticated using (public.is_hod()) with check (public.is_hod());

-- ---------- settings ----------
grant select, insert, update, delete on public.app_settings to authenticated;
create policy app_settings_select on public.app_settings for select to authenticated using (true);
create policy app_settings_hod on public.app_settings for all to authenticated using (public.is_hod()) with check (public.is_hod());

-- ---------- admin_emails / legacy awards: no direct client access ----------
grant select on public.awards_legacy to authenticated;
create policy awards_legacy_select on public.awards_legacy for select to authenticated using (public.is_any_admin());
-- admin_emails: service role only (API routes enforce the role matrix)

-- ---------- function privileges ----------
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- helpers used inside RLS policies / by the client
grant execute on function
  public.app_now(), public.ist_today(), public.ist_date_of(timestamptz), public.comp_cfg(jsonb),
  public.current_admin_role(), public.is_hod(), public.is_any_admin(), public.is_admin(text),
  public.admin_can_see_user(uuid), public.feature_enabled(text)
to authenticated;

-- student-facing RPCs (all derive the user from auth.uid())
grant execute on function
  public.get_active_competition(), public.list_competitions(), public.get_leaderboard(uuid),
  public.get_competition_stats(uuid), public.get_my_state(), public.get_public_profile(uuid, uuid),
  public.set_commitment(integer), public.log_chanting(date, integer), public.sync_chanting(integer),
  public.start_reading_session(uuid), public.heartbeat_reading_session(uuid), public.end_reading_session(uuid, boolean),
  public.start_listening(uuid, integer), public.listening_heartbeat(uuid), public.get_quiz(uuid), public.submit_quiz(uuid, jsonb),
  public.get_awards_view(uuid), public.get_my_awards(), public.get_pending_award_popups(), public.mark_award_seen(uuid),
  public.list_departments()
to authenticated;

-- HOD RPCs (each re-checks is_hod() inside) and admin read model
grant execute on function
  public.save_competition(jsonb), public.set_competition_status(uuid, text), public.delete_competition_draft(uuid),
  public.save_competition_awards(uuid, jsonb), public.rebuild_competition_totals(uuid),
  public.suggest_award_winners(uuid), public.finalize_competition(uuid, jsonb),
  public.grant_award(uuid, uuid, text), public.revoke_award(uuid),
  public.give_bonus(uuid, integer, text), public.hod_set_commitment(uuid, uuid, integer),
  public.hod_save_audiobook(jsonb), public.hod_set_audiobook_duration(uuid, integer)
to authenticated;

-- service_role keeps full access (API routes)
grant execute on all functions in schema public to service_role;
