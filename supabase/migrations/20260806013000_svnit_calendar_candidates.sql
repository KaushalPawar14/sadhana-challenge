-- Official SVNIT 2026-27 dates, deliberately pending guide approval. The
-- planner derives one-week cooldown windows around examinations at read time.

insert into public.academic_calendar_events (
  institution_id, title, event_type, starts_on, ends_on, intensity,
  source_url, source_note, approval_status
)
select institution.id, candidate.title, candidate.event_type, candidate.starts_on,
  candidate.ends_on, candidate.intensity, candidate.source_url,
  candidate.source_note, 'pending'
from public.institutions as institution
cross join (
  values
    ('Commencement of autumn teaching', 'orientation', date '2026-07-27', date '2026-07-27', 'push', 'https://www.svnit.ac.in/Data/Notice/2025/June/Academic%20Calendar%202026-27.pdf', 'Official SVNIT academic calendar; guide must approve cohort applicability.'),
    ('Autumn mid-semester examinations', 'exam', date '2026-09-21', date '2026-09-26', 'pause', 'https://www.svnit.ac.in/Data/Notice/2025/June/Academic%20Calendar%202026-27.pdf', 'Official institute date; first-year variations must be confirmed.'),
    ('Diwali break', 'vacation', date '2026-11-09', date '2026-11-13', 'cool_down', 'https://www.svnit.ac.in/Data/Notice/2025/June/Academic%20Calendar%202026-27.pdf', 'Official institute break.'),
    ('Autumn end-semester examinations', 'exam', date '2026-11-23', date '2026-11-30', 'pause', 'https://www.svnit.ac.in/Data/Notice/2025/June/Academic%20Calendar%202026-27.pdf', 'Official theory examination window.'),
    ('UG winter vacation', 'vacation', date '2026-12-14', date '2027-01-01', 'cool_down', 'https://www.svnit.ac.in/Data/Notice/2025/June/Academic%20Calendar%202026-27.pdf', 'Official UG vacation window.'),
    ('Commencement of spring teaching', 'availability', date '2027-01-04', date '2027-01-04', 'push', 'https://www.svnit.ac.in/Data/Notice/2025/June/Academic%20Calendar%202026-27.pdf', 'Official spring-semester commencement.'),
    ('Spring mid-semester examinations', 'exam', date '2027-03-08', date '2027-03-15', 'pause', 'https://www.svnit.ac.in/Data/Notice/2025/June/Academic%20Calendar%202026-27.pdf', 'Official institute date.'),
    ('Spring end-semester examinations', 'exam', date '2027-04-26', date '2027-05-01', 'pause', 'https://www.svnit.ac.in/Data/Notice/2025/June/Academic%20Calendar%202026-27.pdf', 'Official theory examination window.'),
    ('UG/PG project and internship examinations', 'exam', date '2027-05-03', date '2027-05-07', 'pause', 'https://www.svnit.ac.in/Data/Notice/2025/June/Academic%20Calendar%202026-27.pdf', 'Official project examination window.'),
    ('UG summer vacation', 'vacation', date '2027-05-10', date '2027-07-23', 'cool_down', 'https://www.svnit.ac.in/Data/Notice/2025/June/Academic%20Calendar%202026-27.pdf', 'Official UG vacation window.')
) as candidate(title, event_type, starts_on, ends_on, intensity, source_url, source_note)
where institution.slug = 'svnit'
  and not exists (
    select 1 from public.academic_calendar_events existing
    where existing.institution_id = institution.id
      and existing.title = candidate.title
      and existing.starts_on = candidate.starts_on
  );
