-- Remove overlapping SELECT policies while preserving the same effective access.

drop policy hod_manage_settings on public.app_settings;
create policy hod_insert_settings on public.app_settings for insert to authenticated
with check ((select private.is_hod()));
create policy hod_update_settings on public.app_settings for update to authenticated
using ((select private.is_hod())) with check ((select private.is_hod()));
create policy hod_delete_settings on public.app_settings for delete to authenticated
using ((select private.is_hod()));

drop policy commitments_guide_write on public.commitments;
create policy commitments_guide_insert on public.commitments for insert to authenticated
with check ((select private.can_guide_student(student_id)));
create policy commitments_guide_update on public.commitments for update to authenticated
using ((select private.can_guide_student(student_id)))
with check ((select private.can_guide_student(student_id)));
create policy commitments_guide_delete on public.commitments for delete to authenticated
using ((select private.can_guide_student(student_id)));

drop policy guides_manage_content on public.content_items;
create policy guides_insert_content on public.content_items for insert to authenticated
with check ((select private.current_user_role()) in ('guide', 'hod'));
create policy guides_update_content on public.content_items for update to authenticated
using ((select private.current_user_role()) in ('guide', 'hod'))
with check ((select private.current_user_role()) in ('guide', 'hod'));
create policy guides_delete_content on public.content_items for delete to authenticated
using ((select private.current_user_role()) in ('guide', 'hod'));

drop policy progress_self_write on public.content_progress;
create policy progress_self_insert on public.content_progress for insert to authenticated
with check (student_id = (select auth.uid()));
create policy progress_self_update on public.content_progress for update to authenticated
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));
create policy progress_self_delete on public.content_progress for delete to authenticated
using (student_id = (select auth.uid()));

drop policy guides_manage_expedition_participants on public.expedition_participants;
create policy guides_insert_expedition_participants on public.expedition_participants for insert to authenticated
with check ((select private.can_guide_student(student_id)));
create policy guides_update_expedition_participants on public.expedition_participants for update to authenticated
using ((select private.can_guide_student(student_id)))
with check ((select private.can_guide_student(student_id)));
create policy guides_delete_expedition_participants on public.expedition_participants for delete to authenticated
using ((select private.can_guide_student(student_id)));

drop policy guides_manage_expeditions on public.expeditions;
create policy guides_insert_expeditions on public.expeditions for insert to authenticated
with check ((select private.current_user_role()) in ('guide', 'hod'));
create policy guides_update_expeditions on public.expeditions for update to authenticated
using ((select private.current_user_role()) in ('guide', 'hod'))
with check ((select private.current_user_role()) in ('guide', 'hod'));
create policy guides_delete_expeditions on public.expeditions for delete to authenticated
using ((select private.current_user_role()) in ('guide', 'hod'));

drop policy hod_manage_assignments on public.guide_student_assignments;
create policy hod_insert_assignments on public.guide_student_assignments for insert to authenticated
with check ((select private.is_hod()));
create policy hod_update_assignments on public.guide_student_assignments for update to authenticated
using ((select private.is_hod())) with check ((select private.is_hod()));
create policy hod_delete_assignments on public.guide_student_assignments for delete to authenticated
using ((select private.is_hod()));

drop policy institutions_hod_manage on public.institutions;
create policy institutions_hod_insert on public.institutions for insert to authenticated
with check ((select private.is_hod()));
create policy institutions_hod_update on public.institutions for update to authenticated
using ((select private.is_hod())) with check ((select private.is_hod()));
create policy institutions_hod_delete on public.institutions for delete to authenticated
using ((select private.is_hod()));

drop policy hod_manage_knowledge_chunks on public.knowledge_chunks;
create policy hod_insert_knowledge_chunks on public.knowledge_chunks for insert to authenticated
with check ((select private.is_hod()));
create policy hod_update_knowledge_chunks on public.knowledge_chunks for update to authenticated
using ((select private.is_hod())) with check ((select private.is_hod()));
create policy hod_delete_knowledge_chunks on public.knowledge_chunks for delete to authenticated
using ((select private.is_hod()));

drop policy hod_manage_knowledge_sources on public.knowledge_sources;
create policy hod_insert_knowledge_sources on public.knowledge_sources for insert to authenticated
with check ((select private.is_hod()));
create policy hod_update_knowledge_sources on public.knowledge_sources for update to authenticated
using ((select private.is_hod())) with check ((select private.is_hod()));
create policy hod_delete_knowledge_sources on public.knowledge_sources for delete to authenticated
using ((select private.is_hod()));

drop policy interactions_guide_access on public.mentor_interactions;
alter policy interactions_student_read on public.mentor_interactions
using (
  student_id = (select auth.uid())
  or guide_id = (select auth.uid())
  or (select private.is_hod())
);
create policy interactions_guide_insert on public.mentor_interactions for insert to authenticated
with check (guide_id = (select auth.uid()) or (select private.is_hod()));
create policy interactions_guide_update on public.mentor_interactions for update to authenticated
using (guide_id = (select auth.uid()) or (select private.is_hod()))
with check (guide_id = (select auth.uid()) or (select private.is_hod()));
create policy interactions_guide_delete on public.mentor_interactions for delete to authenticated
using (guide_id = (select auth.uid()) or (select private.is_hod()));

drop policy hod_manage_quarter_targets on public.quarter_targets;
create policy hod_insert_quarter_targets on public.quarter_targets for insert to authenticated
with check ((select private.is_hod()));
create policy hod_update_quarter_targets on public.quarter_targets for update to authenticated
using ((select private.is_hod())) with check ((select private.is_hod()));
create policy hod_delete_quarter_targets on public.quarter_targets for delete to authenticated
using ((select private.is_hod()));

drop policy hod_manage_quarters on public.quarters;
create policy hod_insert_quarters on public.quarters for insert to authenticated
with check ((select private.is_hod()));
create policy hod_update_quarters on public.quarters for update to authenticated
using ((select private.is_hod())) with check ((select private.is_hod()));
create policy hod_delete_quarters on public.quarters for delete to authenticated
using ((select private.is_hod()));

drop policy reminder_rules_hod_manage on public.reminder_rules;
create policy reminder_rules_hod_insert on public.reminder_rules for insert to authenticated
with check ((select private.is_hod()));
create policy reminder_rules_hod_update on public.reminder_rules for update to authenticated
using ((select private.is_hod())) with check ((select private.is_hod()));
create policy reminder_rules_hod_delete on public.reminder_rules for delete to authenticated
using ((select private.is_hod()));

drop policy guides_manage_service_opportunities on public.service_opportunities;
create policy guides_insert_service_opportunities on public.service_opportunities for insert to authenticated
with check ((select private.current_user_role()) in ('guide', 'hod'));
create policy guides_update_service_opportunities on public.service_opportunities for update to authenticated
using ((select private.current_user_role()) in ('guide', 'hod'))
with check ((select private.current_user_role()) in ('guide', 'hod'));
create policy guides_delete_service_opportunities on public.service_opportunities for delete to authenticated
using ((select private.current_user_role()) in ('guide', 'hod'));

drop policy hod_manage_users on public.users;
alter policy users_self_update on public.users
using (id = (select auth.uid()) or (select private.is_hod()))
with check (id = (select auth.uid()) or (select private.is_hod()));
create policy hod_insert_users on public.users for insert to authenticated
with check ((select private.is_hod()));
create policy hod_delete_users on public.users for delete to authenticated
using ((select private.is_hod()));

drop policy weekly_plan_owner_write on public.weekly_plans;
create policy weekly_plan_owner_insert on public.weekly_plans for insert to authenticated
with check (guide_id = (select auth.uid()) or (select private.is_hod()));
create policy weekly_plan_owner_update on public.weekly_plans for update to authenticated
using (guide_id = (select auth.uid()) or (select private.is_hod()))
with check (guide_id = (select auth.uid()) or (select private.is_hod()));
create policy weekly_plan_owner_delete on public.weekly_plans for delete to authenticated
using (guide_id = (select auth.uid()) or (select private.is_hod()));
