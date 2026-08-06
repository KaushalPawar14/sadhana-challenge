# FOLK Surat Phase 1 architecture

## Product boundary

The three clients share one canonical data platform:

- `folk-surat-web`: content administration, quarterly planning and HOD oversight.
- `folk-surat-student`: the student-facing **Today** journey, sādhana, content, RDUA, association, seva, competitions and expeditions.
- `folk-surat-guides`: assigned-student CRM, weekly milestones, approvals and follow-up queue.
- Supabase Auth/Postgres/Storage: canonical identity and application data.
- Firebase Cloud Messaging: delivery transport only. Firebase is not the canonical database.

## Identity

- Google OAuth is the only supported sign-in method.
- One `auth.users` identity maps to one `public.users` profile.
- Roles are `student`, `guide` and `hod`.
- The HOD assigns guides to students. A guide can see only assigned students; the HOD can see the complete Surat view.
- Google provider configuration and mobile redirect URLs must be completed before the authentication cutover.

## Approval boundary

The system can calculate, draft and recommend, but it cannot independently:

- grant an expedition discount;
- change a quarterly or foundational goal;
- accept a calendar correction;
- send a personalized AI-generated book motivation; or
- treat a student as spiritually qualified.

Those actions enter `approval_requests`. The applicable guide or HOD decides them.

## Weekly milestone engine

Every Monday at 08:00 Asia/Kolkata, one plan is generated for each guide from:

1. current quarter targets;
2. actual student activity and content progress;
3. remaining active weeks;
4. college calendars and approved exceptions;
5. open commitments and association recency;
6. guide assignments; and
7. incomplete approval requests.

The plan produces:

- quarter position;
- realistic end-of-week targets;
- prioritized students with one reason and one action;
- calendar constraints;
- approval queue; and
- a snapshot used to explain why the targets were generated.

Quarter targets are not mechanically divided by the number of weeks. Exam pressure, festivals, student availability and recent momentum adjust the weekly recommendation.

## RAG ingestion

The existing Markdown corpus, metadata and glossary are canonical inputs. The ingestion pipeline should:

1. hash each source file and upsert `knowledge_sources`;
2. parse the existing metadata rather than regenerating it;
3. split on semantic headings and paragraph boundaries;
4. retain exact citation labels and heading paths;
5. embed approved chunks only;
6. retrieve with lexical, vector and metadata filters; and
7. generate a cited draft for the relevant audience.

Student-facing output never exposes LIT or internal mentor assessments. Mentor-facing output includes evidence, citations, confidence and missing information.

## Personalized book motivation

`content_progress.last_position` stores the last confirmed chapter or section. A book-motivation job retrieves the next three chapters and returns:

- three curiosity questions whose answers require reading;
- one concise conversational opening for the guide;
- grounding citations;
- the position and chapter window used; and
- an approval state.

The questions must not reveal answers or fabricate claims about the text.

## Retention

Verbose speech-to-text input can be processed transiently. The permanent CRM record is the mentor-approved summary, evidence note, commitments and structured fields. Raw dictation is not retained by default.

## Migration sequence

1. Apply the Phase 1 database migration.
2. Configure Google OAuth and redirect URLs.
3. Add Supabase clients to both Flutter apps behind a repository abstraction.
4. Migrate test Firebase records and validate reconciliation.
5. Switch reads to Supabase.
6. Switch writes to Supabase.
7. Retain Firebase only for FCM, then remove unused Firestore/Auth code.

The cutover must not mix Firebase and Supabase as competing sources of truth.

## Live migration status (6 August 2026)

The `folk_surat_phase1` migration is applied to the connected Supabase test project. It created 25 public tables and seeded the four quarters, 24 quarterly targets, 12 initial content records, and seven operating settings.

The approved `secure_phase_one_access` migration is applied. Every public table now has Row Level Security. Privileged helper functions live in a non-exposed `private` schema, anonymous execution is revoked, and Supabase's security advisor reports no findings.

The working Firebase daily-sādhana and guide-observation behavior is protected by `PROTECTED_LEGACY_CONTRACT.md`. Supabase becomes canonical only after parity and reconciliation tests pass.
