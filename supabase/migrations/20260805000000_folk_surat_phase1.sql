-- FOLK Surat Phase 1: shared CRM, quarterly planning, approvals and RAG foundation.
-- Google is the only intended authentication provider; provider configuration is
-- completed in the Supabase dashboard and clients. Firebase remains only for FCM.

create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('institute', 'college', 'local_group')),
  city text not null default 'Surat',
  calendar_status text not null default 'tentative' check (calendar_status in ('tentative', 'guide_approved', 'official')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  mobile text,
  gender text,
  birthday date,
  role text not null default 'student' check (role in ('student', 'guide', 'hod')),
  institution_id uuid references public.institutions(id),
  college_name_override text,
  department text,
  academic_year text,
  target_chanting int not null default 4 check (target_chanting between 0 and 64),
  target_reading int not null default 10 check (target_reading between 0 and 1440),
  target_hearing int not null default 10 check (target_hearing between 0 and 1440),
  total_points int not null default 0,
  streak_count int not null default 0,
  best_streak int not null default 0,
  last_log_date date,
  freeze_credits int not null default 1,
  is_onboarded boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table public.guide_student_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  guide_id uuid not null references public.users(id) on delete cascade,
  assigned_by uuid references public.users(id),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (student_id, guide_id)
);

create table public.academic_calendar_events (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  title text not null,
  event_type text not null check (event_type in ('orientation', 'exam', 'vacation', 'festival', 'availability', 'other')),
  starts_on date not null,
  ends_on date not null,
  intensity text not null default 'normal' check (intensity in ('push', 'normal', 'cool_down', 'pause')),
  source_url text,
  source_note text,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.quarters (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null,
  quarter_number smallint not null check (quarter_number between 1 and 4),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'closed')),
  created_at timestamptz not null default now(),
  unique (academic_year, quarter_number),
  check (ends_on >= starts_on)
);

create table public.quarter_targets (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters(id) on delete cascade,
  institution_id uuid references public.institutions(id),
  dimension text not null check (dimension in ('association', 'books', 'chanting', 'service', 'expedition', 'hearing')),
  metric_key text not null,
  segment_key text not null default 'all',
  target_value numeric not null check (target_value >= 0),
  unit text not null,
  aggregation text not null default 'quarter_independent' check (aggregation in ('quarter_independent', 'cumulative', 'snapshot')),
  notes text,
  requires_hod_approval boolean not null default true,
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quarter_id, institution_id, dimension, metric_key, segment_key)
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  log_date date not null,
  chanting_rounds int not null default 0 check (chanting_rounds between 0 and 64),
  reading_minutes int not null default 0 check (reading_minutes between 0 and 1440),
  hearing_minutes int not null default 0 check (hearing_minutes between 0 and 1440),
  service_minutes int not null default 0 check (service_minutes between 0 and 1440),
  points_earned int not null default 0,
  submitted_at timestamptz not null default now(),
  is_late_submission boolean not null default false,
  unique (user_id, log_date)
);

create table public.mentor_interactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  guide_id uuid not null references public.users(id) on delete restrict,
  interaction_type text not null check (interaction_type in ('physical_meeting', 'video_call', 'phone_call', 'service_discussion', 'post_program', 'whatsapp')),
  occurred_at timestamptz not null,
  minutes int not null default 0 check (minutes between 0 and 1440),
  is_meaningful boolean not null default false,
  revelation_depth smallint check (revelation_depth between 1 and 5),
  mentor_approved_summary text,
  evidence_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lit_assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  assessed_by uuid not null references public.users(id) on delete restrict,
  learning_score smallint not null check (learning_score between 1 and 5),
  interest_score smallint not null check (interest_score between 1 and 5),
  time_score smallint not null check (time_score between 1 and 5),
  confidence smallint not null default 3 check (confidence between 1 and 5),
  evidence_summary text not null,
  meaningful_interactions_considered int not null default 0,
  assessed_at timestamptz not null default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('book', 'chapter', 'podcast', 'youtube', 'rdua', 'article', 'quiz')),
  parent_id uuid references public.content_items(id) on delete cascade,
  slug text not null unique,
  title text not null,
  sequence_number int,
  module_key text,
  source_uri text,
  duration_seconds int,
  body_markdown text,
  is_published boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'paused')),
  progress_percent numeric not null default 0 check (progress_percent between 0 and 100),
  last_position jsonb not null default '{}'::jsonb,
  last_engaged_at timestamptz,
  completed_at timestamptz,
  reflection_summary text,
  mentor_confirmed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (student_id, content_id)
);

create table public.personalized_content_prompts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  generated_from_position jsonb not null,
  chapter_window jsonb not null,
  curiosity_questions jsonb not null,
  suggested_opening text not null,
  grounding_citations jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'sent')),
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  captured_by uuid references public.users(id),
  source_type text not null check (source_type in ('interaction', 'trip', 'rdua', 'service', 'student_chat', 'other')),
  source_id uuid,
  commitment text not null,
  committed_at timestamptz not null default now(),
  due_on date,
  status text not null default 'open' check (status in ('open', 'kept', 'partially_kept', 'not_kept', 'withdrawn')),
  follow_up_note text,
  updated_at timestamptz not null default now()
);

create table public.expeditions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  theme text,
  objectives jsonb not null default '[]'::jsonb,
  destination text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int check (capacity > 0),
  registration_status text not null default 'draft' check (registration_status in ('draft', 'open', 'waitlist', 'closed', 'completed', 'cancelled')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create table public.expedition_participants (
  id uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references public.expeditions(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  initial_position text,
  individual_goal text,
  connection_quality smallint check (connection_quality between 1 and 5),
  bonding_change text,
  commitment_id uuid references public.commitments(id),
  post_trip_eagerness text check (post_trip_eagerness in ('positive', 'neutral', 'negative')),
  attended boolean,
  guide_summary text,
  unique (expedition_id, student_id)
);

create table public.service_opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  skills jsonb not null default '[]'::jsonb,
  training_available boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity int,
  status text not null default 'draft' check (status in ('draft', 'open', 'filled', 'completed', 'cancelled')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.service_participation (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.service_opportunities(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'interested' check (status in ('interested', 'assigned', 'confirmed', 'completed', 'declined')),
  minutes int not null default 0,
  mentor_approved_summary text,
  unique (opportunity_id, student_id)
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('discount', 'calendar_change', 'content_message', 'goal_change', 'other')),
  entity_type text not null,
  entity_id uuid,
  student_id uuid references public.users(id),
  requested_by uuid not null references public.users(id),
  assigned_approver uuid not null references public.users(id),
  proposed_value jsonb not null default '{}'::jsonb,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.users(id) on delete cascade,
  quarter_id uuid not null references public.quarters(id) on delete cascade,
  week_starts_on date not null,
  generated_at timestamptz not null default now(),
  source_snapshot jsonb not null default '{}'::jsonb,
  constraint_summary jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'guide_approved', 'closed')),
  approved_at timestamptz,
  unique (guide_id, week_starts_on)
);

create table public.weekly_milestones (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  dimension text not null check (dimension in ('association', 'books', 'chanting', 'service', 'expedition', 'hearing', 'rdua')),
  title text not null,
  target_value numeric,
  unit text,
  rationale text not null,
  priority smallint not null default 3 check (priority between 1 and 5),
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'achieved', 'not_achieved', 'cancelled')),
  actual_value numeric,
  created_at timestamptz not null default now()
);

create table public.weekly_focus_students (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  reason text not null,
  next_action text not null,
  due_on date,
  priority smallint not null default 3 check (priority between 1 and 5),
  status text not null default 'open' check (status in ('open', 'done', 'deferred', 'cancelled')),
  unique (weekly_plan_id, student_id)
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  title text not null,
  source_type text not null check (source_type in ('book', 'letter', 'conversation', 'lecture', 'glossary', 'curated_note')),
  author text not null default 'A. C. Bhaktivedanta Swami Prabhupāda',
  file_path text not null,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  chunk_index int not null,
  heading_path text,
  content text not null,
  citation_label text not null,
  token_count int,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_hod()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'hod', false);
$$;

create or replace function public.can_guide_student(target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_hod() or exists (
    select 1
    from public.guide_student_assignments assignment
    where assignment.student_id = target_student
      and assignment.guide_id = auth.uid()
      and assignment.is_active
  );
$$;

create or replace function public.handle_new_google_user()
returns trigger
language plpgsql
security definer
set search_path = public
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_new_google_user();

create trigger users_set_updated_at before update on public.users for each row execute procedure public.set_updated_at();
create trigger institutions_set_updated_at before update on public.institutions for each row execute procedure public.set_updated_at();
create trigger quarter_targets_set_updated_at before update on public.quarter_targets for each row execute procedure public.set_updated_at();
create trigger mentor_interactions_set_updated_at before update on public.mentor_interactions for each row execute procedure public.set_updated_at();
create trigger content_items_set_updated_at before update on public.content_items for each row execute procedure public.set_updated_at();
create trigger content_progress_set_updated_at before update on public.content_progress for each row execute procedure public.set_updated_at();
create trigger commitments_set_updated_at before update on public.commitments for each row execute procedure public.set_updated_at();
create trigger knowledge_sources_set_updated_at before update on public.knowledge_sources for each row execute procedure public.set_updated_at();

alter table public.users enable row level security;
alter table public.guide_student_assignments enable row level security;
alter table public.academic_calendar_events enable row level security;
alter table public.quarters enable row level security;
alter table public.quarter_targets enable row level security;
alter table public.activity_logs enable row level security;
alter table public.mentor_interactions enable row level security;
alter table public.lit_assessments enable row level security;
alter table public.content_items enable row level security;
alter table public.content_progress enable row level security;
alter table public.personalized_content_prompts enable row level security;
alter table public.commitments enable row level security;
alter table public.expeditions enable row level security;
alter table public.expedition_participants enable row level security;
alter table public.service_opportunities enable row level security;
alter table public.service_participation enable row level security;
alter table public.approval_requests enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.weekly_milestones enable row level security;
alter table public.weekly_focus_students enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_emails enable row level security;

create policy users_self_or_assigned_read on public.users for select to authenticated
using (id = auth.uid() or public.can_guide_student(id));
create policy users_self_update on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy hod_manage_users on public.users for all to authenticated using (public.is_hod()) with check (public.is_hod());

create policy assignments_visible_to_participants on public.guide_student_assignments for select to authenticated
using (student_id = auth.uid() or guide_id = auth.uid() or public.is_hod());
create policy hod_manage_assignments on public.guide_student_assignments for all to authenticated using (public.is_hod()) with check (public.is_hod());

create policy calendar_authenticated_read on public.academic_calendar_events for select to authenticated using (approval_status = 'approved' or public.current_user_role() in ('guide', 'hod'));
create policy guides_create_calendar on public.academic_calendar_events for insert to authenticated with check (public.current_user_role() in ('guide', 'hod'));
create policy calendar_approver_update on public.academic_calendar_events for update to authenticated using (public.current_user_role() in ('guide', 'hod')) with check (public.current_user_role() in ('guide', 'hod'));

create policy quarter_authenticated_read on public.quarters for select to authenticated using (true);
create policy quarter_targets_authenticated_read on public.quarter_targets for select to authenticated using (true);
create policy hod_manage_quarters on public.quarters for all to authenticated using (public.is_hod()) with check (public.is_hod());
create policy hod_manage_quarter_targets on public.quarter_targets for all to authenticated using (public.is_hod()) with check (public.is_hod());

create policy activity_self_insert on public.activity_logs for insert to authenticated with check (user_id = auth.uid());
create policy activity_self_or_guide_read on public.activity_logs for select to authenticated using (user_id = auth.uid() or public.can_guide_student(user_id));
create policy activity_self_update on public.activity_logs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy interactions_guide_access on public.mentor_interactions for all to authenticated
using (guide_id = auth.uid() or public.is_hod()) with check (guide_id = auth.uid() or public.is_hod());
create policy interactions_student_read on public.mentor_interactions for select to authenticated using (student_id = auth.uid());
create policy lit_private_guide_access on public.lit_assessments for all to authenticated
using (assessed_by = auth.uid() or public.can_guide_student(student_id)) with check (assessed_by = auth.uid() and public.can_guide_student(student_id));

create policy published_content_read on public.content_items for select to authenticated using (is_published or public.current_user_role() in ('guide', 'hod'));
create policy guides_manage_content on public.content_items for all to authenticated using (public.current_user_role() in ('guide', 'hod')) with check (public.current_user_role() in ('guide', 'hod'));
create policy progress_self_or_guide_read on public.content_progress for select to authenticated using (student_id = auth.uid() or public.can_guide_student(student_id));
create policy progress_self_write on public.content_progress for all to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy prompts_guide_access on public.personalized_content_prompts for all to authenticated using (public.can_guide_student(student_id)) with check (public.can_guide_student(student_id));

create policy commitments_self_or_guide_read on public.commitments for select to authenticated using (student_id = auth.uid() or public.can_guide_student(student_id));
create policy commitments_guide_write on public.commitments for all to authenticated using (public.can_guide_student(student_id)) with check (public.can_guide_student(student_id));

create policy expeditions_authenticated_read on public.expeditions for select to authenticated using (registration_status <> 'draft' or public.current_user_role() in ('guide', 'hod'));
create policy guides_manage_expeditions on public.expeditions for all to authenticated using (public.current_user_role() in ('guide', 'hod')) with check (public.current_user_role() in ('guide', 'hod'));
create policy expedition_participant_read on public.expedition_participants for select to authenticated using (student_id = auth.uid() or public.can_guide_student(student_id));
create policy guides_manage_expedition_participants on public.expedition_participants for all to authenticated using (public.can_guide_student(student_id)) with check (public.can_guide_student(student_id));

create policy service_opportunities_authenticated_read on public.service_opportunities for select to authenticated using (status <> 'draft' or public.current_user_role() in ('guide', 'hod'));
create policy guides_manage_service_opportunities on public.service_opportunities for all to authenticated using (public.current_user_role() in ('guide', 'hod')) with check (public.current_user_role() in ('guide', 'hod'));
create policy service_participation_self_or_guide on public.service_participation for all to authenticated using (student_id = auth.uid() or public.can_guide_student(student_id)) with check (student_id = auth.uid() or public.can_guide_student(student_id));

create policy approval_participants_read on public.approval_requests for select to authenticated using (requested_by = auth.uid() or assigned_approver = auth.uid() or public.is_hod());
create policy approval_guides_create on public.approval_requests for insert to authenticated with check (requested_by = auth.uid() and public.current_user_role() in ('guide', 'hod'));
create policy approval_assignee_update on public.approval_requests for update to authenticated using (assigned_approver = auth.uid() or public.is_hod()) with check (assigned_approver = auth.uid() or public.is_hod());

create policy weekly_plan_owner_read on public.weekly_plans for select to authenticated using (guide_id = auth.uid() or public.is_hod());
create policy weekly_plan_owner_write on public.weekly_plans for all to authenticated using (guide_id = auth.uid() or public.is_hod()) with check (guide_id = auth.uid() or public.is_hod());
create policy weekly_milestone_owner_access on public.weekly_milestones for all to authenticated using (exists (select 1 from public.weekly_plans p where p.id = weekly_plan_id and (p.guide_id = auth.uid() or public.is_hod()))) with check (exists (select 1 from public.weekly_plans p where p.id = weekly_plan_id and (p.guide_id = auth.uid() or public.is_hod())));
create policy weekly_focus_owner_access on public.weekly_focus_students for all to authenticated using (exists (select 1 from public.weekly_plans p where p.id = weekly_plan_id and (p.guide_id = auth.uid() or public.is_hod()))) with check (exists (select 1 from public.weekly_plans p where p.id = weekly_plan_id and (p.guide_id = auth.uid() or public.is_hod())));

create policy knowledge_approved_read on public.knowledge_sources for select to authenticated using (review_status = 'approved' or public.current_user_role() in ('guide', 'hod'));
create policy knowledge_chunks_approved_read on public.knowledge_chunks for select to authenticated using (exists (select 1 from public.knowledge_sources s where s.id = source_id and (s.review_status = 'approved' or public.current_user_role() in ('guide', 'hod'))));
create policy hod_manage_knowledge_sources on public.knowledge_sources for all to authenticated using (public.is_hod()) with check (public.is_hod());
create policy hod_manage_knowledge_chunks on public.knowledge_chunks for all to authenticated using (public.is_hod()) with check (public.is_hod());
create policy settings_authenticated_read on public.app_settings for select to authenticated using (true);
create policy hod_manage_settings on public.app_settings for all to authenticated using (public.is_hod()) with check (public.is_hod());
create policy hod_manage_admin_emails on public.admin_emails for all to authenticated using (public.is_hod()) with check (public.is_hod());

insert into public.institutions (slug, name, kind, calendar_status)
values
  ('svnit', 'Sardar Vallabhbhai National Institute of Technology', 'institute', 'tentative'),
  ('iiit-surat', 'Indian Institute of Information Technology Surat', 'institute', 'tentative'),
  ('surat-local', 'Surat Local Colleges', 'local_group', 'tentative')
on conflict (slug) do nothing;

insert into public.quarters (academic_year, quarter_number, name, starts_on, ends_on, status)
values
  ('2026-27', 1, 'Quarter 1', '2026-08-01', '2026-09-30', 'active'),
  ('2026-27', 2, 'Quarter 2', '2026-10-01', '2026-11-30', 'planned'),
  ('2026-27', 3, 'Quarter 3', '2027-01-01', '2027-02-28', 'planned'),
  ('2026-27', 4, 'Quarter 4', '2027-03-01', '2027-05-15', 'planned')
on conflict (academic_year, quarter_number) do nothing;

with chanting_targets(quarter_number, segment_key, target_value) as (
  values
    (1, 'rounds_0_3', 30), (1, 'rounds_4_7', 20), (1, 'rounds_8_11', 0), (1, 'rounds_12_15', 0), (1, 'rounds_16', 0),
    (2, 'rounds_0_3', 15), (2, 'rounds_4_7', 25), (2, 'rounds_8_11', 15), (2, 'rounds_12_15', 0), (2, 'rounds_16', 8),
    (3, 'rounds_0_3', 10), (3, 'rounds_4_7', 15), (3, 'rounds_8_11', 15), (3, 'rounds_12_15', 10), (3, 'rounds_16', 16),
    (4, 'rounds_0_3', 10), (4, 'rounds_4_7', 10), (4, 'rounds_8_11', 10), (4, 'rounds_12_15', 5), (4, 'rounds_16', 25)
)
insert into public.quarter_targets (quarter_id, dimension, metric_key, segment_key, target_value, unit, aggregation, notes)
select q.id, 'chanting', 'rounds_distribution', t.segment_key, t.target_value, 'students', 'quarter_independent', 'Exclusive chanting bracket; students are counted once per quarter snapshot.'
from chanting_targets t
join public.quarters q on q.academic_year = '2026-27' and q.quarter_number = t.quarter_number
on conflict (quarter_id, institution_id, dimension, metric_key, segment_key) do nothing;

with association_targets(quarter_number, target_value) as (values (1, 125), (2, 250), (3, 375), (4, 500))
insert into public.quarter_targets (quarter_id, dimension, metric_key, target_value, unit, aggregation, notes)
select q.id, 'association', 'mentor_minutes_per_student', t.target_value, 'minutes', 'cumulative', 'Personal association with the FOLK guide; prioritize physical, video and phone conversations.'
from association_targets t
join public.quarters q on q.academic_year = '2026-27' and q.quarter_number = t.quarter_number
on conflict (quarter_id, institution_id, dimension, metric_key, segment_key) do nothing;

insert into public.content_items (content_type, slug, title, module_key, sequence_number, is_published, metadata)
values
  ('book', 'iq-eq-sq', 'IQ, EQ, SQ', 'Q1', 1, true, '{"quarter":1}'::jsonb),
  ('book', 'perfect-questions-perfect-answers', 'Perfect Questions, Perfect Answers', 'Q1', 2, true, '{"quarter":1}'::jsonb),
  ('book', 'on-the-way-to-krishna', 'On the Way to Krishna', 'Q2', 1, true, '{"quarter":2}'::jsonb),
  ('book', 'matchless-gift', 'Matchless Gift', 'Q2', 2, true, '{"quarter":2}'::jsonb),
  ('book', 'beyond-birth-and-death', 'Beyond Birth and Death', 'Q3', 1, true, '{"quarter":3}'::jsonb),
  ('book', 'raja-vidya', 'Rāja-Vidyā', 'Q3', 2, true, '{"quarter":3}'::jsonb),
  ('book', 'hare-krishna-challenge', 'Hare Krishna Challenge', 'Q4', 1, true, '{"quarter":4}'::jsonb),
  ('book', 'nectar-of-instruction', 'Nectar of Instruction', 'Q4', 2, true, '{"quarter":4}'::jsonb),
  ('podcast', 'folk-2', 'FOLK–2 Modules', 'FOLK-2', 1, false, '{"topics":10,"quarter":1}'::jsonb),
  ('podcast', 'folk-4', 'FOLK–4 Modules', 'FOLK-4', 2, false, '{"topics":10,"quarter":2}'::jsonb),
  ('podcast', 'folk-8', 'FOLK–8 Modules', 'FOLK-8', 3, false, '{"topics":10,"quarter":3}'::jsonb),
  ('podcast', 'folk-12', 'FOLK–12 Modules', 'FOLK-12', 4, false, '{"topics":10,"quarter":4}'::jsonb)
on conflict (slug) do nothing;

insert into public.app_settings (key, value)
values
  ('app_name', 'FOLK Surat'),
  ('auth_provider', 'google'),
  ('timezone', 'Asia/Kolkata'),
  ('student_reminder_schedule', '{"morning":"08:00","missing":"11:00","final":"17:00"}'),
  ('guide_digest_time', '14:00'),
  ('discount_requires_guide_approval', 'true'),
  ('mentor_summary_retention', 'approved_summary_only')
on conflict (key) do update set value = excluded.value, updated_at = now();

create index guide_assignments_student_idx on public.guide_student_assignments (student_id) where is_active;
create index activity_logs_date_idx on public.activity_logs (log_date, user_id);
create index mentor_interactions_student_date_idx on public.mentor_interactions (student_id, occurred_at desc);
create index content_progress_student_idx on public.content_progress (student_id, status, last_engaged_at desc);
create index commitments_open_idx on public.commitments (student_id, due_on) where status = 'open';
create index approvals_pending_idx on public.approval_requests (assigned_approver, created_at) where status = 'pending';
create index weekly_plans_guide_week_idx on public.weekly_plans (guide_id, week_starts_on desc);
create index knowledge_chunks_source_idx on public.knowledge_chunks (source_id, chunk_index);
