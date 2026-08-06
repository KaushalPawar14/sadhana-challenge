-- Preserve legacy report routing and record the one-time guide visibility notice.

alter table public.users
  add column residence_mode text not null default 'other'
    check (residence_mode in ('folk', 'hostel', 'other')),
  add column legacy_firebase_uid text,
  add column guide_visibility_notice_version text,
  add column guide_visibility_notice_acknowledged_at timestamptz;

create unique index users_legacy_firebase_uid_idx
  on public.users (legacy_firebase_uid)
  where legacy_firebase_uid is not null;

insert into public.app_settings (key, value)
values
  ('guide_visibility_notice_version', '2026-08-06'),
  ('guide_visibility_notice_text', 'Your FOLK guide can review the progress and conversations you share in this app so that personal guidance can be offered when needed.')
on conflict (key) do update set value = excluded.value, updated_at = now();
