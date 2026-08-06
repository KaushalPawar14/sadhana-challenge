alter table public.sadhana_entries
  add column temple_entry_time time,
  add column daily_service_score numeric(6,2)
    check (daily_service_score >= 0);
