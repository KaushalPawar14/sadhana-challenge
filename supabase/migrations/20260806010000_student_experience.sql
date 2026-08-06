-- Student experience records for RDUA, curated content, chanting, competitions,
-- and guide-visible conversations. No outbound delivery is enabled here.

create table public.content_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  assigned_by uuid not null references public.users(id) on delete restrict,
  assignment_reason text,
  due_on date,
  priority smallint not null default 3 check (priority between 1 and 5),
  status text not null default 'assigned'
    check (status in ('draft', 'assigned', 'started', 'completed', 'paused', 'cancelled')),
  student_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, content_id)
);

create table public.rdua_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content_id uuid not null references public.content_items(id) on delete restrict,
  institution_id uuid references public.institutions(id) on delete set null,
  delivery_mode text not null check (delivery_mode in ('hostel', 'online', 'physical_other')),
  leader_id uuid references public.users(id) on delete set null,
  supervising_guide_id uuid references public.users(id) on delete set null,
  starts_at timestamptz not null,
  expected_minutes smallint not null default 15 check (expected_minutes between 5 and 180),
  status text not null default 'planned'
    check (status in ('draft', 'planned', 'active', 'completed', 'cancelled')),
  completion_note text,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rdua_participation (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.rdua_sessions(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  attended boolean,
  reflection_answers jsonb not null default '[]'::jsonb,
  group_reflection text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create table public.chanting_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null,
  completed_at timestamptz,
  bead_count smallint not null default 0 check (bead_count between 0 and 108),
  rounds_completed numeric(4,2) not null default 0 check (rounds_completed between 0 and 64),
  accompaniment text not null default 'silent'
    check (accompaniment in ('silent', 'prabhupada_reference_audio', 'other_approved_audio')),
  source text not null default 'in_app_counter'
    check (source in ('in_app_counter', 'manual', 'rdua_circle')),
  created_at timestamptz not null default now()
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  theme text not null,
  goal_statement text not null,
  focus_dimensions text[] not null default '{}',
  rules jsonb not null default '{}'::jsonb,
  scoring_model jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'active', 'completed', 'cancelled')),
  created_by uuid not null references public.users(id) on delete restrict,
  hod_approval_required boolean not null default false,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create table public.competition_participation (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  score numeric not null default 0 check (score >= 0),
  rank integer check (rank > 0),
  discount_proposed numeric(10,2) check (discount_proposed >= 0),
  discount_approved numeric(10,2) check (discount_approved >= 0),
  discount_approval_id uuid references public.approval_requests(id) on delete set null,
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (competition_id, student_id)
);

create table public.student_conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  assigned_guide_id uuid not null references public.users(id) on delete restrict,
  topic text,
  status text not null default 'open'
    check (status in ('open', 'guide_attention', 'guide_joined', 'closed')),
  privacy_notice_version text not null,
  privacy_notice_acknowledged_at timestamptz,
  guide_attention_reason text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.student_conversations(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  author_kind text not null check (author_kind in ('student', 'guide', 'system')),
  body text not null check (char_length(body) between 1 and 10000),
  grounding_citations jsonb not null default '[]'::jsonb,
  needs_guide_attention boolean not null default false,
  created_at timestamptz not null default now()
);

create trigger content_assignments_set_updated_at
before update on public.content_assignments
for each row execute procedure public.set_updated_at();
create trigger rdua_sessions_set_updated_at
before update on public.rdua_sessions
for each row execute procedure public.set_updated_at();
create trigger rdua_participation_set_updated_at
before update on public.rdua_participation
for each row execute procedure public.set_updated_at();
create trigger competitions_set_updated_at
before update on public.competitions
for each row execute procedure public.set_updated_at();
create trigger student_conversations_set_updated_at
before update on public.student_conversations
for each row execute procedure public.set_updated_at();

alter table public.content_assignments enable row level security;
alter table public.rdua_sessions enable row level security;
alter table public.rdua_participation enable row level security;
alter table public.chanting_sessions enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_participation enable row level security;
alter table public.student_conversations enable row level security;
alter table public.student_conversation_messages enable row level security;

create policy content_assignments_select on public.content_assignments
for select to authenticated using (
  (student_visible and student_id = (select auth.uid()))
  or (select private.can_guide_student(student_id))
);
create policy content_assignments_insert on public.content_assignments
for insert to authenticated with check (
  assigned_by = (select auth.uid())
  and (select private.can_guide_student(student_id))
);
create policy content_assignments_update on public.content_assignments
for update to authenticated
using ((select private.can_guide_student(student_id)))
with check ((select private.can_guide_student(student_id)));

create policy rdua_sessions_select on public.rdua_sessions
for select to authenticated using (status <> 'draft' or created_by = (select auth.uid()) or (select private.is_hod()));
create policy rdua_sessions_insert on public.rdua_sessions
for insert to authenticated with check (
  created_by = (select auth.uid())
  and (select private.current_user_role()) in ('guide', 'hod')
);
create policy rdua_sessions_update on public.rdua_sessions
for update to authenticated
using (created_by = (select auth.uid()) or supervising_guide_id = (select auth.uid()) or (select private.is_hod()))
with check (created_by = (select auth.uid()) or supervising_guide_id = (select auth.uid()) or (select private.is_hod()));

create policy rdua_participation_select on public.rdua_participation
for select to authenticated using (
  student_id = (select auth.uid()) or (select private.can_guide_student(student_id))
);
create policy rdua_participation_insert on public.rdua_participation
for insert to authenticated with check (
  student_id = (select auth.uid()) or (select private.can_guide_student(student_id))
);
create policy rdua_participation_update on public.rdua_participation
for update to authenticated
using (student_id = (select auth.uid()) or (select private.can_guide_student(student_id)))
with check (student_id = (select auth.uid()) or (select private.can_guide_student(student_id)));

create policy chanting_sessions_select on public.chanting_sessions
for select to authenticated using (
  student_id = (select auth.uid()) or (select private.can_guide_student(student_id))
);
create policy chanting_sessions_insert on public.chanting_sessions
for insert to authenticated with check (student_id = (select auth.uid()));
create policy chanting_sessions_update on public.chanting_sessions
for update to authenticated
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));

create policy competitions_select on public.competitions
for select to authenticated using (
  status <> 'draft' or created_by = (select auth.uid()) or (select private.is_hod())
);
create policy competitions_insert on public.competitions
for insert to authenticated with check (
  created_by = (select auth.uid()) and (select private.current_user_role()) in ('guide', 'hod')
);
create policy competitions_update on public.competitions
for update to authenticated
using (created_by = (select auth.uid()) or (select private.is_hod()))
with check (created_by = (select auth.uid()) or (select private.is_hod()));

create policy competition_participation_select on public.competition_participation
for select to authenticated using (
  student_id = (select auth.uid()) or (select private.can_guide_student(student_id))
);
create policy competition_participation_insert on public.competition_participation
for insert to authenticated with check (student_id = (select auth.uid()));
create policy competition_participation_update on public.competition_participation
for update to authenticated
using (student_id = (select auth.uid()) or (select private.can_guide_student(student_id)))
with check (student_id = (select auth.uid()) or (select private.can_guide_student(student_id)));

create policy student_conversations_select on public.student_conversations
for select to authenticated using (
  student_id = (select auth.uid())
  or assigned_guide_id = (select auth.uid())
  or (select private.is_hod())
);
create policy student_conversations_insert on public.student_conversations
for insert to authenticated with check (
  student_id = (select auth.uid())
  and exists (
    select 1 from public.guide_student_assignments assignment
    where assignment.student_id = student_conversations.student_id
      and assignment.guide_id = student_conversations.assigned_guide_id
      and assignment.is_active
  )
);
create policy student_conversations_update on public.student_conversations
for update to authenticated
using (student_id = (select auth.uid()) or assigned_guide_id = (select auth.uid()) or (select private.is_hod()))
with check (student_id = (select auth.uid()) or assigned_guide_id = (select auth.uid()) or (select private.is_hod()));

create policy student_conversation_messages_select on public.student_conversation_messages
for select to authenticated using (
  exists (
    select 1 from public.student_conversations conversation
    where conversation.id = student_conversation_messages.conversation_id
      and (
        conversation.student_id = (select auth.uid())
        or conversation.assigned_guide_id = (select auth.uid())
        or (select private.is_hod())
      )
  )
);
create policy student_conversation_messages_insert on public.student_conversation_messages
for insert to authenticated with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.student_conversations conversation
    where conversation.id = student_conversation_messages.conversation_id
      and (
        (author_kind = 'student' and conversation.student_id = (select auth.uid()))
        or (author_kind = 'guide' and conversation.assigned_guide_id = (select auth.uid()))
      )
  )
);

create index content_assignments_student_status_idx on public.content_assignments (student_id, status, due_on);
create index content_assignments_assigned_by_idx on public.content_assignments (assigned_by);
create index rdua_sessions_start_idx on public.rdua_sessions (starts_at, status);
create index rdua_sessions_content_id_idx on public.rdua_sessions (content_id);
create index rdua_sessions_institution_id_idx on public.rdua_sessions (institution_id) where institution_id is not null;
create index rdua_sessions_leader_id_idx on public.rdua_sessions (leader_id) where leader_id is not null;
create index rdua_sessions_supervising_guide_id_idx on public.rdua_sessions (supervising_guide_id) where supervising_guide_id is not null;
create index rdua_sessions_created_by_idx on public.rdua_sessions (created_by);
create index rdua_participation_student_idx on public.rdua_participation (student_id, completed_at desc);
create index chanting_sessions_student_start_idx on public.chanting_sessions (student_id, started_at desc);
create index competitions_status_start_idx on public.competitions (status, starts_at);
create index competitions_created_by_idx on public.competitions (created_by);
create index competitions_approval_request_id_idx on public.competitions (approval_request_id) where approval_request_id is not null;
create index competition_participation_student_idx on public.competition_participation (student_id, joined_at desc);
create index competition_participation_discount_approval_idx on public.competition_participation (discount_approval_id) where discount_approval_id is not null;
create index student_conversations_student_idx on public.student_conversations (student_id, last_message_at desc);
create index student_conversations_guide_status_idx on public.student_conversations (assigned_guide_id, status, last_message_at desc);
create index student_conversation_messages_conversation_idx on public.student_conversation_messages (conversation_id, created_at);
create index student_conversation_messages_author_id_idx on public.student_conversation_messages (author_id) where author_id is not null;

insert into public.app_settings (key, value)
values
  ('student_chat_mode', 'guide_visible_preview'),
  ('student_chat_privacy_notice_version', '2026-08-06'),
  ('automatic_spiritual_guidance_enabled', 'false'),
  ('discounts_require_guide_approval', 'true'),
  ('raw_mentor_dictation_retention', 'discard_after_approved_summary')
on conflict (key) do update set value = excluded.value, updated_at = now();
