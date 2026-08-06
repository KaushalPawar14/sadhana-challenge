-- Phase-1 access hardening.
-- Supabase remains the canonical database; all exposed public tables use RLS.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.current_user_role() set schema private;
alter function public.is_hod() set schema private;
alter function public.can_guide_student(uuid) set schema private;
alter function public.handle_new_google_user() set schema private;

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.role
  from public.users as u
  where auth.uid() is not null
    and u.id = auth.uid();
$$;

create or replace function private.is_hod()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and coalesce(private.current_user_role() = 'hod', false);
$$;

create or replace function private.can_guide_student(target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      private.is_hod()
      or exists (
        select 1
        from public.guide_student_assignments as assignment
        where assignment.student_id = target_student
          and assignment.guide_id = auth.uid()
          and assignment.is_active
      )
    );
$$;

create or replace function private.handle_new_google_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google' then
    raise exception 'FOLK Surat accepts Google sign-in only';
  end if;

  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.users.full_name, excluded.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url),
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.current_user_role() from public, anon, authenticated;
revoke all on function private.is_hod() from public, anon, authenticated;
revoke all on function private.can_guide_student(uuid) from public, anon, authenticated;
revoke all on function private.handle_new_google_user() from public, anon, authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.is_hod() to authenticated;
grant execute on function private.can_guide_student(uuid) to authenticated;

alter table public.institutions enable row level security;

create policy institutions_authenticated_read
on public.institutions
for select
to authenticated
using (true);

create policy institutions_hod_manage
on public.institutions
for all
to authenticated
using (private.is_hod())
with check (private.is_hod());

create index if not exists users_institution_id_idx
  on public.users (institution_id);
create index if not exists guide_assignments_guide_id_idx
  on public.guide_student_assignments (guide_id) where is_active;
create index if not exists guide_assignments_assigned_by_idx
  on public.guide_student_assignments (assigned_by);
create index if not exists calendar_institution_id_idx
  on public.academic_calendar_events (institution_id);
create index if not exists calendar_approved_by_idx
  on public.academic_calendar_events (approved_by);
create index if not exists calendar_created_by_idx
  on public.academic_calendar_events (created_by);
create index if not exists quarter_targets_institution_id_idx
  on public.quarter_targets (institution_id);
create index if not exists quarter_targets_approved_by_idx
  on public.quarter_targets (approved_by);
create index if not exists mentor_interactions_guide_id_idx
  on public.mentor_interactions (guide_id);
create index if not exists lit_assessments_assessed_by_idx
  on public.lit_assessments (assessed_by);
create index if not exists content_items_parent_id_idx
  on public.content_items (parent_id);
create index if not exists content_progress_content_id_idx
  on public.content_progress (content_id);
create index if not exists content_prompts_content_id_idx
  on public.personalized_content_prompts (content_id);
create index if not exists content_prompts_approved_by_idx
  on public.personalized_content_prompts (approved_by);
create index if not exists commitments_captured_by_idx
  on public.commitments (captured_by);
create index if not exists expeditions_created_by_idx
  on public.expeditions (created_by);
create index if not exists expedition_participants_student_id_idx
  on public.expedition_participants (student_id);
create index if not exists expedition_participants_commitment_id_idx
  on public.expedition_participants (commitment_id);
create index if not exists service_opportunities_created_by_idx
  on public.service_opportunities (created_by);
create index if not exists service_participation_student_id_idx
  on public.service_participation (student_id);
create index if not exists approval_requests_student_id_idx
  on public.approval_requests (student_id);
create index if not exists approval_requests_requested_by_idx
  on public.approval_requests (requested_by);
create index if not exists approval_requests_approver_idx
  on public.approval_requests (assigned_approver);
create index if not exists weekly_plans_quarter_id_idx
  on public.weekly_plans (quarter_id);
create index if not exists weekly_focus_students_student_id_idx
  on public.weekly_focus_students (student_id);
