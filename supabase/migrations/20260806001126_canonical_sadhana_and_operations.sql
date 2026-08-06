-- Canonical daily sādhana, notification, association and operational-task foundation.

create table public.sadhana_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  entry_date date not null,
  residence_mode text not null default 'other'
    check (residence_mode in ('folk', 'hostel', 'other')),
  sleep_time time,
  wake_time time,
  chanting_rounds smallint check (chanting_rounds between 0 and 64),
  class_hearing_score numeric(4,2) check (class_hearing_score between 0 and 100),
  hearing_minutes smallint check (hearing_minutes >= 0),
  book_reading_minutes smallint check (book_reading_minutes >= 0),
  book_content_id uuid references public.content_items(id) on delete set null,
  japa_finish_time time,
  association_minutes smallint check (association_minutes >= 0),
  devotional_service_minutes smallint check (devotional_service_minutes >= 0),
  reflection text,
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'excused')),
  submitted_at timestamptz,
  source text not null default 'folk_surat_app'
    check (source in ('folk_surat_app', 'legacy_firebase', 'guide_assisted', 'import')),
  legacy_collection text,
  legacy_document_path text,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, entry_date)
);

create table public.sadhana_entry_revisions (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.sadhana_entries(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  changed_by uuid references public.users(id) on delete set null,
  change_reason text,
  previous_record jsonb not null,
  created_at timestamptz not null default now()
);

create table public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios', 'web')),
  fcm_token text not null,
  device_label text,
  app_variant text not null check (app_variant in ('student', 'guide', 'web')),
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fcm_token)
);

create table public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  sadhana_reminders_enabled boolean not null default true,
  birthday_reminders_enabled boolean not null default true,
  association_reminders_enabled boolean not null default true,
  content_reminders_enabled boolean not null default true,
  trip_reminders_enabled boolean not null default true,
  quiet_hours_start time not null default '21:30',
  quiet_hours_end time not null default '07:30',
  max_automated_notifications_per_day smallint not null default 3
    check (max_automated_notifications_per_day between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminder_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  audience text not null check (audience in ('student', 'guide', 'hod')),
  reminder_kind text not null,
  local_time time not null,
  timezone text not null default 'Asia/Kolkata',
  conditions jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  requires_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  requested_by uuid references public.users(id) on delete set null,
  rule_id uuid references public.reminder_rules(id) on delete set null,
  notification_kind text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'skipped', 'failed', 'cancelled')),
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  deduplication_key text not null unique,
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_deliveries (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.notification_jobs(id) on delete cascade,
  device_id uuid references public.notification_devices(id) on delete set null,
  provider text not null default 'fcm' check (provider in ('fcm', 'whatsapp', 'in_app')),
  provider_message_id text,
  status text not null check (status in ('sent', 'delivered', 'opened', 'failed', 'skipped')),
  error_code text,
  error_detail text,
  occurred_at timestamptz not null default now()
);

create table public.association_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  guide_id uuid not null references public.users(id) on delete cascade,
  initiated_by uuid not null references public.users(id) on delete cascade,
  topic_category text,
  topic_details text,
  proposed_slots jsonb not null default '[]'::jsonb,
  status text not null default 'requested'
    check (status in ('requested', 'guide_proposed', 'student_proposed', 'scheduled', 'completed', 'cancelled')),
  scheduled_start timestamptz,
  duration_minutes smallint check (duration_minutes between 5 and 480),
  external_calendar_event_id text,
  meeting_url text,
  outcome_summary text,
  completed_interaction_id uuid references public.mentor_interactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.operational_tasks (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid,
  student_id uuid references public.users(id) on delete cascade,
  assigned_guide_id uuid references public.users(id) on delete set null,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  title text not null,
  safe_description text,
  action_type text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'new'
    check (status in ('new', 'approved', 'this_week', 'scheduled', 'waiting', 'completed', 'cancelled', 'needs_hod')),
  due_at timestamptz,
  completed_at timestamptz,
  student_visible boolean not null default false,
  export_to_trello boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.external_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('trello', 'google_calendar', 'firebase', 'whatsapp')),
  mode text not null default 'mock' check (mode in ('mock', 'test', 'live')),
  display_name text not null,
  configuration jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default false,
  last_health_check_at timestamptz,
  last_health_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, display_name)
);

create table public.external_task_links (
  id uuid primary key default gen_random_uuid(),
  operational_task_id uuid not null references public.operational_tasks(id) on delete cascade,
  integration_id uuid not null references public.external_integrations(id) on delete cascade,
  external_board_id text,
  external_list_id text,
  external_card_id text,
  external_url text,
  external_version text,
  last_synced_at timestamptz,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced', 'conflict', 'failed', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operational_task_id, integration_id),
  unique (integration_id, external_card_id)
);

create table public.integration_outbox (
  id bigint generated always as identity primary key,
  provider text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  idempotency_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'failed', 'dead_letter')),
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.integration_inbox (
  id bigint generated always as identity primary key,
  provider text not null,
  external_event_id text not null,
  payload_hash text not null,
  event_type text,
  payload jsonb not null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  unique (provider, external_event_id)
);

create or replace function private.record_sadhana_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sadhana_entry_revisions (
    entry_id, student_id, changed_by, change_reason, previous_record
  )
  values (
    old.id, old.student_id, auth.uid(), null, to_jsonb(old)
  );
  return new;
end;
$$;

revoke all on function private.record_sadhana_revision() from public, anon, authenticated;

create trigger sadhana_entries_set_updated_at
before update on public.sadhana_entries
for each row execute procedure public.set_updated_at();
create trigger sadhana_entries_record_revision
before update on public.sadhana_entries
for each row execute procedure private.record_sadhana_revision();
create trigger notification_devices_set_updated_at
before update on public.notification_devices
for each row execute procedure public.set_updated_at();
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute procedure public.set_updated_at();
create trigger reminder_rules_set_updated_at
before update on public.reminder_rules
for each row execute procedure public.set_updated_at();
create trigger notification_jobs_set_updated_at
before update on public.notification_jobs
for each row execute procedure public.set_updated_at();
create trigger association_requests_set_updated_at
before update on public.association_requests
for each row execute procedure public.set_updated_at();
create trigger operational_tasks_set_updated_at
before update on public.operational_tasks
for each row execute procedure public.set_updated_at();
create trigger external_integrations_set_updated_at
before update on public.external_integrations
for each row execute procedure public.set_updated_at();
create trigger external_task_links_set_updated_at
before update on public.external_task_links
for each row execute procedure public.set_updated_at();

alter table public.sadhana_entries enable row level security;
alter table public.sadhana_entry_revisions enable row level security;
alter table public.notification_devices enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.reminder_rules enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.association_requests enable row level security;
alter table public.operational_tasks enable row level security;
alter table public.external_integrations enable row level security;
alter table public.external_task_links enable row level security;
alter table public.integration_outbox enable row level security;
alter table public.integration_inbox enable row level security;

create policy sadhana_entries_read on public.sadhana_entries
for select to authenticated
using ((select auth.uid()) = student_id or (select private.can_guide_student(student_id)));
create policy sadhana_entries_student_insert on public.sadhana_entries
for insert to authenticated
with check ((select auth.uid()) = student_id);
create policy sadhana_entries_student_update on public.sadhana_entries
for update to authenticated
using ((select auth.uid()) = student_id)
with check ((select auth.uid()) = student_id);
create policy sadhana_entries_hod_manage on public.sadhana_entries
for all to authenticated
using ((select private.is_hod()))
with check ((select private.is_hod()));

create policy sadhana_revisions_read on public.sadhana_entry_revisions
for select to authenticated
using ((select auth.uid()) = student_id or (select private.can_guide_student(student_id)));

create policy notification_devices_self_read on public.notification_devices
for select to authenticated using ((select auth.uid()) = user_id);
create policy notification_devices_self_insert on public.notification_devices
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy notification_devices_self_update on public.notification_devices
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy notification_devices_self_delete on public.notification_devices
for delete to authenticated using ((select auth.uid()) = user_id);

create policy notification_preferences_read on public.notification_preferences
for select to authenticated
using ((select auth.uid()) = user_id or (select private.can_guide_student(user_id)));
create policy notification_preferences_self_insert on public.notification_preferences
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy notification_preferences_self_update on public.notification_preferences
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy reminder_rules_authenticated_read on public.reminder_rules
for select to authenticated using (true);
create policy reminder_rules_hod_manage on public.reminder_rules
for all to authenticated
using ((select private.is_hod()))
with check ((select private.is_hod()));

create policy notification_jobs_read on public.notification_jobs
for select to authenticated
using ((select auth.uid()) = recipient_id or (select private.can_guide_student(recipient_id)));
create policy notification_jobs_guide_insert on public.notification_jobs
for insert to authenticated
with check (
  (select private.is_hod())
  or (requested_by = (select auth.uid()) and (select private.can_guide_student(recipient_id)))
);
create policy notification_jobs_guide_update on public.notification_jobs
for update to authenticated
using ((select private.can_guide_student(recipient_id)))
with check ((select private.can_guide_student(recipient_id)));

create policy notification_deliveries_read on public.notification_deliveries
for select to authenticated
using (exists (
  select 1 from public.notification_jobs as job
  where job.id = job_id
    and ((select auth.uid()) = job.recipient_id or (select private.can_guide_student(job.recipient_id)))
));

create policy association_requests_read on public.association_requests
for select to authenticated
using (
  (select auth.uid()) in (student_id, guide_id)
  or (select private.is_hod())
);
create policy association_requests_insert on public.association_requests
for insert to authenticated
with check (
  initiated_by = (select auth.uid())
  and (
    student_id = (select auth.uid())
    or guide_id = (select auth.uid())
    or (select private.is_hod())
  )
);
create policy association_requests_update on public.association_requests
for update to authenticated
using ((select auth.uid()) in (student_id, guide_id) or (select private.is_hod()))
with check ((select auth.uid()) in (student_id, guide_id) or (select private.is_hod()));

create policy operational_tasks_read on public.operational_tasks
for select to authenticated
using (
  (student_visible and student_id = (select auth.uid()))
  or assigned_guide_id = (select auth.uid())
  or (student_id is not null and (select private.can_guide_student(student_id)))
  or (select private.is_hod())
);
create policy operational_tasks_guide_insert on public.operational_tasks
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (student_id is not null and (select private.can_guide_student(student_id)))
    or (student_id is null and assigned_guide_id = (select auth.uid()))
    or (select private.is_hod())
  )
);
create policy operational_tasks_guide_update on public.operational_tasks
for update to authenticated
using (assigned_guide_id = (select auth.uid()) or (select private.is_hod()))
with check (assigned_guide_id = (select auth.uid()) or (select private.is_hod()));

create policy external_integrations_hod on public.external_integrations
for all to authenticated
using ((select private.is_hod()))
with check ((select private.is_hod()));
create policy external_task_links_hod on public.external_task_links
for all to authenticated
using ((select private.is_hod()))
with check ((select private.is_hod()));
create policy integration_outbox_hod on public.integration_outbox
for all to authenticated
using ((select private.is_hod()))
with check ((select private.is_hod()));
create policy integration_inbox_hod on public.integration_inbox
for all to authenticated
using ((select private.is_hod()))
with check ((select private.is_hod()));

create index sadhana_entries_student_date_idx
  on public.sadhana_entries (student_id, entry_date desc);
create index sadhana_entries_missing_scan_idx
  on public.sadhana_entries (entry_date, status, student_id);
create index sadhana_entries_book_content_id_idx
  on public.sadhana_entries (book_content_id) where book_content_id is not null;
create index sadhana_revisions_entry_created_idx
  on public.sadhana_entry_revisions (entry_id, created_at desc);
create index sadhana_revisions_student_id_idx
  on public.sadhana_entry_revisions (student_id);
create index sadhana_revisions_changed_by_idx
  on public.sadhana_entry_revisions (changed_by) where changed_by is not null;
create index notification_devices_user_active_idx
  on public.notification_devices (user_id, is_active);
create index notification_jobs_recipient_schedule_idx
  on public.notification_jobs (recipient_id, scheduled_for desc);
create index notification_jobs_queue_idx
  on public.notification_jobs (scheduled_for)
  where status = 'queued';
create index notification_jobs_requested_by_idx
  on public.notification_jobs (requested_by) where requested_by is not null;
create index notification_jobs_rule_id_idx
  on public.notification_jobs (rule_id) where rule_id is not null;
create index notification_jobs_approval_id_idx
  on public.notification_jobs (approval_request_id) where approval_request_id is not null;
create index notification_deliveries_job_id_idx
  on public.notification_deliveries (job_id);
create index notification_deliveries_device_id_idx
  on public.notification_deliveries (device_id) where device_id is not null;
create index association_requests_student_created_idx
  on public.association_requests (student_id, created_at desc);
create index association_requests_guide_status_idx
  on public.association_requests (guide_id, status, scheduled_start);
create index association_requests_initiated_by_idx
  on public.association_requests (initiated_by);
create index association_requests_interaction_idx
  on public.association_requests (completed_interaction_id) where completed_interaction_id is not null;
create index operational_tasks_guide_status_due_idx
  on public.operational_tasks (assigned_guide_id, status, due_at);
create index operational_tasks_student_status_idx
  on public.operational_tasks (student_id, status) where student_id is not null;
create index operational_tasks_approval_id_idx
  on public.operational_tasks (approval_request_id) where approval_request_id is not null;
create index operational_tasks_created_by_idx
  on public.operational_tasks (created_by) where created_by is not null;
create index operational_tasks_trello_export_idx
  on public.operational_tasks (updated_at)
  where export_to_trello and status not in ('completed', 'cancelled');
create index external_task_links_integration_idx
  on public.external_task_links (integration_id);
create index integration_outbox_pending_idx
  on public.integration_outbox (available_at, id)
  where status in ('pending', 'failed');
create index integration_inbox_unprocessed_idx
  on public.integration_inbox (received_at, id)
  where status in ('received', 'failed');

insert into public.reminder_rules (key, title, audience, reminder_kind, local_time, conditions)
values
  ('student_sadhana_morning', 'Morning sādhana reminder', 'student', 'sadhana_due', '08:00', '{"only_if_not_submitted":true}'),
  ('student_sadhana_second', 'Second sādhana reminder', 'student', 'sadhana_due', '11:00', '{"only_if_not_submitted":true}'),
  ('guide_sadhana_digest', 'Guide missing-sādhana digest', 'guide', 'guide_digest', '14:00', '{"include_submitted":true,"include_missing":true}'),
  ('student_sadhana_final', 'Final gentle sādhana reminder', 'student', 'sadhana_due', '17:00', '{"only_if_not_submitted":true,"respect_daily_cap":true}'),
  ('birthday_previous_day', 'Birthday preparation reminder', 'guide', 'birthday', '09:00', '{"days_before":1}'),
  ('birthday_same_day', 'Birthday reminder', 'guide', 'birthday', '08:00', '{"days_before":0}')
on conflict (key) do update set
  title = excluded.title,
  audience = excluded.audience,
  reminder_kind = excluded.reminder_kind,
  local_time = excluded.local_time,
  conditions = excluded.conditions,
  updated_at = now();

insert into public.external_integrations (provider, mode, display_name, configuration, is_enabled)
values (
  'trello',
  'mock',
  'FOLK Surat operations',
  '{"boardWorkflow":["New recommendations","Approved for action","This week","Scheduled / waiting","Completed","Needs HOD decision"],"containsPrivateStudentNotes":false}'::jsonb,
  true
)
on conflict (provider, display_name) do update set
  mode = 'mock',
  configuration = excluded.configuration,
  is_enabled = true,
  updated_at = now();

insert into public.app_settings (key, value)
values
  ('legacy_sadhana_protected', 'true'),
  ('canonical_sadhana_store', 'supabase_shadow'),
  ('firebase_role', 'fcm_and_readonly_migration_source'),
  ('trello_mode', 'mock'),
  ('real_student_messaging_enabled', 'false'),
  ('public_deployment_enabled', 'false')
on conflict (key) do update set value = excluded.value, updated_at = now();
