-- Optimize RLS function evaluation and finish foreign-key indexes.

create index if not exists lit_assessments_student_id_idx
  on public.lit_assessments (student_id);
create index if not exists personalized_content_prompts_student_id_idx
  on public.personalized_content_prompts (student_id);
create index if not exists weekly_milestones_weekly_plan_id_idx
  on public.weekly_milestones (weekly_plan_id);

alter policy users_self_or_assigned_read on public.users
using (id = (select auth.uid()) or (select private.can_guide_student(id)));
alter policy users_self_update on public.users
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

alter policy assignments_visible_to_participants on public.guide_student_assignments
using (
  student_id = (select auth.uid())
  or guide_id = (select auth.uid())
  or (select private.is_hod())
);

alter policy activity_self_insert on public.activity_logs
with check (user_id = (select auth.uid()));
alter policy activity_self_or_guide_read on public.activity_logs
using (user_id = (select auth.uid()) or (select private.can_guide_student(user_id)));
alter policy activity_self_update on public.activity_logs
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy interactions_guide_access on public.mentor_interactions
using (guide_id = (select auth.uid()) or (select private.is_hod()))
with check (guide_id = (select auth.uid()) or (select private.is_hod()));
alter policy interactions_student_read on public.mentor_interactions
using (student_id = (select auth.uid()));

alter policy lit_private_guide_access on public.lit_assessments
using (assessed_by = (select auth.uid()) or (select private.can_guide_student(student_id)))
with check (
  assessed_by = (select auth.uid())
  and (select private.can_guide_student(student_id))
);

alter policy progress_self_or_guide_read on public.content_progress
using (student_id = (select auth.uid()) or (select private.can_guide_student(student_id)));
alter policy progress_self_write on public.content_progress
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));

alter policy commitments_self_or_guide_read on public.commitments
using (student_id = (select auth.uid()) or (select private.can_guide_student(student_id)));
alter policy expedition_participant_read on public.expedition_participants
using (student_id = (select auth.uid()) or (select private.can_guide_student(student_id)));
alter policy service_participation_self_or_guide on public.service_participation
using (student_id = (select auth.uid()) or (select private.can_guide_student(student_id)))
with check (student_id = (select auth.uid()) or (select private.can_guide_student(student_id)));

alter policy approval_assignee_update on public.approval_requests
using (assigned_approver = (select auth.uid()) or (select private.is_hod()))
with check (assigned_approver = (select auth.uid()) or (select private.is_hod()));
alter policy approval_guides_create on public.approval_requests
with check (
  requested_by = (select auth.uid())
  and (select private.current_user_role()) in ('guide', 'hod')
);
alter policy approval_participants_read on public.approval_requests
using (
  requested_by = (select auth.uid())
  or assigned_approver = (select auth.uid())
  or (select private.is_hod())
);

alter policy weekly_plan_owner_read on public.weekly_plans
using (guide_id = (select auth.uid()) or (select private.is_hod()));
alter policy weekly_plan_owner_write on public.weekly_plans
using (guide_id = (select auth.uid()) or (select private.is_hod()))
with check (guide_id = (select auth.uid()) or (select private.is_hod()));
alter policy weekly_milestone_owner_access on public.weekly_milestones
using (exists (
  select 1 from public.weekly_plans as plan
  where plan.id = weekly_plan_id
    and (plan.guide_id = (select auth.uid()) or (select private.is_hod()))
))
with check (exists (
  select 1 from public.weekly_plans as plan
  where plan.id = weekly_plan_id
    and (plan.guide_id = (select auth.uid()) or (select private.is_hod()))
));
alter policy weekly_focus_owner_access on public.weekly_focus_students
using (exists (
  select 1 from public.weekly_plans as plan
  where plan.id = weekly_plan_id
    and (plan.guide_id = (select auth.uid()) or (select private.is_hod()))
))
with check (exists (
  select 1 from public.weekly_plans as plan
  where plan.id = weekly_plan_id
    and (plan.guide_id = (select auth.uid()) or (select private.is_hod()))
));

drop policy sadhana_entries_hod_manage on public.sadhana_entries;
alter policy sadhana_entries_student_insert on public.sadhana_entries
with check (
  student_id = (select auth.uid())
  or (select private.is_hod())
);
alter policy sadhana_entries_student_update on public.sadhana_entries
using (student_id = (select auth.uid()) or (select private.is_hod()))
with check (student_id = (select auth.uid()) or (select private.is_hod()));
create policy sadhana_entries_hod_delete on public.sadhana_entries
for delete to authenticated
using ((select private.is_hod()));
