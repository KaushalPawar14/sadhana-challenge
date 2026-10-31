# CHANGES REPORT — configurable competitions, working awards, closed security holes

Date of work: 2026-10-31. Nothing is committed. **Nothing has been applied to the live Supabase project** (see §1).

## 1. READ THIS FIRST — what is and is not done

| Item | Status |
|---|---|
| Backup of live data (all 12 tables + 77 auth users) | **Done** → `backups/2026-10-31T02-13-14-991Z/` (gitignored, contains PII) |
| Live schema introspection | **Done via PostgREST OpenAPI** (tables/columns). RLS policies, functions and constraints cannot be read over REST, so they are **not** in the backup; the new security migration therefore drops *every* policy in `public` and recreates them (live policies were never in the repo). |
| Migrations written | **Done**, 4 files (§3) |
| Migrations **applied to the live project** | **NOT DONE — blocked.** I only had the service-role key (REST only; it cannot run DDL), there is no DB password, Supabase CLI, `psql` or personal access token on this machine, and the Supabase dashboard in the built-in browser was not signed in (I will not type credentials). Apply them with `SUPABASE_ACCESS_TOKEN=sbp_… node scripts/apply-migrations.mjs --yes` (token from supabase.com/dashboard/account/tokens) **or** paste the 4 files, in order, into the SQL editor. |
| Live tests with TEST_ accounts (the 12 scenarios) | **NOT RUN on the live project** (same blocker). **Run instead on a real Postgres (PGlite 0.5 / PostgreSQL 18) restored from the live backup with all migrations applied: 152/152 checks pass** (`npm run test:db`). |
| `npm run build` | **Passes** (Next 16.2.6). |
| `npm run lint` | **0 errors**, 107 warnings (see §8). `tsc --noEmit` is clean. |
| UI exercised in a real browser against the new DB | **NOT DONE** (needs the migrations on a live/staging project). Only an unauthenticated smoke test of the production server was run (redirects / 401s correct, GET on `/api/sync-chanting` no longer mutates). |
| Data migration (Competition 1) | Written; **dry-run on the restored live backup: 21 students, old total 8371 = rebuilt total 8371, 0 mismatches.** Not yet run live. |

**Deployment order matters.** The security migration removes student write access to `users`/`activity_logs`/etc. and the old deployed app writes those tables directly. Apply the migrations and deploy this app version together (migrations first, immediately followed by the deploy), ideally outside peak hours. Realtime (`activity_feed`) is added to the `supabase_realtime` publication by the migration.

## 2. Live findings that changed the plan (audit §9 "[verify live]" resolved)

- `user_chanting_logs` **does not exist live** (migration 20260815 was never applied) → the Japa counter sync has been silently failing in production. Created by the new migration.
- Live `admin_emails.role` already contains `FOLK_ENABLER_MALE/FEMALE` (so the old CHECK was relaxed or absent): the "Enabler becomes HOD" risk was latent, not active. Fixed anyway (explicit constraint, no default fallback).
- `awards` has **0 rows** (confirms the awards bug: nothing ever wrote to it). `bonus_points` 0 rows, `quiz_submissions` 0, `user_audiobook_progress` 0.
- `audiobooks.language` exists live (missing from repo SQL). `quiz_questions.correct_answer` existed (student-readable) → moved to `quiz_answers`.
- Competition 1 = "Janmashthami Chanting Challenge", 2026-08-19 → 2026-09-03, 56 users, 144 activity logs (dates up to 2026-09-09), 231 reading sessions (all from May–Aug 14, i.e. before the competition), 51 audiobooks / 510 questions, 12 books (all Dropbox).
- Historic per-day points were produced by **several different formulas** (the rules changed while it ran). Re-computing with today's formula would change 7 of 21 students' totals by up to +630, so Competition 1 keeps its logged per-day points (see decisions).

## 3. Migrations (supabase/migrations/, apply in this order)

1. `20261031000100_competition_core.sql` — IST helpers (`app_now`, `ist_today`, `ist_date_of`), role functions (`current_admin_role`, `is_hod`, `is_any_admin`, `admin_can_see_user`; legacy `is_admin(text)` kept but **ignores its argument**), admin role constraint + case-insensitive unique email, `users.age`, tables `competitions`, `competition_participants`, `points_ledger`, `competition_totals`, `competition_final_standings`, `competition_awards`, `user_awards`, `activity_feed`, `quiz_answers`, `user_chanting_logs`; `competition_id` (and server-timing / listening columns) on `activity_logs`, `reading_sessions`, `quiz_submissions`, `bonus_points`, `user_audiobook_progress`; uniqueness now per competition; `bonus_points.admin_id` FK dropped (admins are not rows in `users`); legacy `awards` renamed `awards_legacy`.
2. `20261031000200_competition_functions.sql` — the scoring engine and every RPC (§4).
3. `20261031000300_security_rls.sql` — drops all existing policies, enables RLS everywhere, revokes all API-role privileges and re-grants only reads + one column-level UPDATE on `users`; revokes EXECUTE on every function and grants it selectively.
4. `20261031000400_migrate_competition_1.sql` — data migration (idempotent; writes `migration_report_competition1` and `migration_flags_competition1`).

`schema.sql` is regenerated by `node scripts/build-schema.mjs` (= base tables as found live + migrations 1–3; the data migration is excluded). Verified: it builds a working database from nothing (`node scripts/db-tests/check-schema.mjs` → 22 tables, 58 functions).

## 4. Design (what you asked for → how it is built)

- **Competitions**: first-class table; type `reading|chanting|both`, `bonus_enabled`, IST start/end, explicit `draft/published/archived/finalized` + derived `scheduled/active/ended`, scoring config in `config` jsonb with defaults (`comp_cfg`). `save_competition` rejects overlap with any other published/finalized competition (drafts may overlap but cannot be published while overlapping). Editing a started competition triggers `rebuild_competition_totals`.
- **Ledger is the single source of truth.** `points_ledger` + `competition_totals` (a maintained table, rebuildable from logs/sessions/quiz/bonus rows with `rebuild_competition_totals(competition)`; verified by deleting all totals and rebuilding). Streaks, shields and commitments are per competition. Each chanting log snapshots the commitment in force at log time.
- **Server-only writes.** The browser has no INSERT/UPDATE/DELETE on any scoring table. Students call `SECURITY DEFINER` RPCs that derive the user from `auth.uid()`: `set_commitment`, `log_chanting`, `sync_chanting`, `start/heartbeat/end_reading_session`, `start_listening`, `listening_heartbeat`, `get_quiz`, `submit_quiz`, `mark_award_seen`. Every one checks: authenticated + onboarded, active competition (by IST today), activity date inside start–end (+ configurable late grace), competition type/bonus flag, and writes row + ledger + totals in one transaction.
- **Chanting fixes**: auto-fulfilment only for **completed** days (never today), conflict-safe inserts, no double counting (ledger rows are unique per day and recomputed, not incremented), partial today never locks the manual log. `/api/sync-chanting` is POST-only.
- **Reading**: server-timed sessions (start/heartbeat/end); the server credits at most 45 s per heartbeat, ignores instant-spam, applies min session seconds and the daily cap from the competition config. The client never sends durations.
- **Bonus**: only when `bonus_enabled` and within dates. Listening completion is confirmed by the server (wall-clock credit per heartbeat vs duration × threshold). Quiz questions are returned without answers; grading happens in `submit_quiz`; correct answers live in `quiz_answers` (HOD-only). One attempt per audiobook per competition; optional cap `max_quiz_bonus`. Manual HOD bonus (`give_bonus`) is atomic, HOD-only, tied to the open competition, written to the ledger.
- **Awards**: `competition_awards` (one canonical definition per competition, seeded with the 5 existing awards as editable defaults, criteria presets + `top_n` + gender scope + unlock date) and `user_awards` (permanent history with `seen_at`, soft `revoked_at`). `suggest_award_winners` (ties listed together, tie-break = earliest to reach the score, then best streak) → HOD review screen → `finalize_competition` (HOD, after end date) writes `user_awards`, snapshots `competition_final_standings`, sets `finalized`; afterwards `recompute_user`/`rebuild` raise `COMPETITION_FINALIZED`, finalized leaderboards are served from the snapshot. Popup: `get_pending_award_popups` (unlock ≤ today IST, not revoked, not seen) + `mark_award_seen`; before the unlock date the winner sees "unlocks on <date>" on the Awards page. The four conflicting award copies were removed (everything reads `competition_awards`).
- **Roles/security**: `current_admin_role()`/`is_hod()` from the JWT email; HOD-only writes enforced in DB (RPC checks + RLS) **and** APIs; Guide/Enablers view-only; gender scope enforced by RLS (`admin_can_see_user`) on users, logs, ledger, feed, leaderboard; students can only update `full_name, mobile, gender, department, age, avatar_url` of their own row (column privileges) and read only their own row — leaderboards come from RPCs returning public columns (no phone numbers).

## 5. Files

**Migrations / tooling (new):** the 4 migrations above; `schema.sql` (regenerated); `scripts/backup-live.mjs`, `scripts/apply-migrations.mjs`, `scripts/build-schema.mjs`, `scripts/db-tests/{baseline.sql,harness.mjs,run.mjs,check-schema.mjs,last-results.json}`; npm scripts `test:db`, `schema:build`, `db:backup`; dev dependency `@electric-sql/pglite`; removed packages `@supabase/auth-helpers-nextjs`, `@supabase/auth-helpers-react`.

**New app files:** `lib/ist.ts`, `lib/competition.ts`, `lib/errors.ts`, `lib/supabase/server.ts`, `hooks/useActiveCompetition.ts`, `app/api/onboarding/route.ts`, `app/api/admin/user-emails/route.ts`, `components/student/AwardPopup.tsx`, `app/admin/_shared.tsx`, `app/admin/competitions/{page.tsx,CompetitionForm.tsx,new/page.tsx,[id]/page.tsx,[id]/finalize/page.tsx}`.

**Rewritten / changed:** `lib/pointsEngine.ts` (pure helpers; authoritative scoring is in SQL), `store/authStore.ts`, `components/AuthProvider.tsx` (debug logging removed), `proxy.ts` (signed 5-minute role/onboarded cookie), `app/auth/callback/route.ts` (OAuth-code log removed), `app/api/{sync-chanting,save-reading-session,admin-whitelist,admin/update-user,fetch-book}/route.ts`, `app/{page,layout}.tsx`, `app/onboarding/page.tsx`, `app/{leaderboard,awards,profile,chanting,books,podcast}/page.tsx`, `components/{Navbar,ClientLayout}.tsx`, `components/student/{DailyLogModal,UserProfileModal,ConsistencyHeatmap,AwardIcons}.tsx`, `app/admin/{layout,page,users/page,logs/page,awards/page,settings/page}.tsx`, `eslint.config.mjs`, `.gitignore` (+`/backups/`, `/scratch/`).

**Deleted:** `app/admin/books/`, `app/admin/audiobooks/` (duplicate CMS), `app/api/awards-stats/`, `app/api/user-logs/`, `hooks/useAuth.ts`; `scratch/*` untracked from git (local files kept; personal email replaced).

## 6. Test results (PGlite, restored live data + all migrations) — `npm run test:db`

| # | Scenario | Checks |
|---|---|---|
| 1 | Reading, bonus off: chanting blocked, reading earns points, quiz/audiobooks hidden, heartbeat spam credits 0 | 9/9 |
| 2 | Chanting, bonus on: reading blocked, streak multiplier + cap, commitment raise-only, quiz graded on server, answers unreadable | 18/18 |
| 3 | Both, weights 1/2, reading cap, manual bonus: total = 10×1 + 5×2 + 7 = 27, rebuild reproduces it | 9/9 |
| 4 | Overlapping dates rejected (publish and draft→publish), bad dates/weights rejected | 6/6 |
| 5 | Before start / after end / outside grace rejected | 6/6 |
| 6 | Guide, Male & Female Enabler cannot create/edit/finalize/bonus/grant/revoke via RPC **or** direct table writes; gender scope enforced by RLS on users, logs, leaderboard, feed | 35/35 |
| 7 | Student cannot write points/streak/commitment/is_onboarded, cannot insert ledger/logs/sessions/quiz/progress/awards, sees only own `users` row, cannot read others' phone numbers or `quiz_answers`, `is_admin()` no longer enumerates, internal functions not callable | 21/21 |
| 8 | Finalize: suggested winners, HOD swap, standings frozen, later activity/rebuild/bonus/edit rejected, cannot finalize early or twice | 14/14 |
| 9 | Popup: none before unlock, once on/after unlock, never again after dismiss, others cannot mark seen, history permanent, revoke is soft, manual grant | 15/15 |
| 10 | 00:10 IST = new IST day for default date/late flag; counter doesn't lock today; completed day auto-filled once | 12/12 |
| 11 | Competition 1 migration dry-run | 7/7 |
| | **Total** | **152/152** |

Competition 1 dry-run details: type chanting, `bonus_enabled=false` (no quiz/bonus rows), dates from settings, derived status `ended`, every log/session attached, old `challenge_*` keys retired. **Mismatches: none** (all 21 students: rebuilt = old). Flags (rows attached but outside the competition dates): 8 `activity_logs` dated after 2026-09-03 (4 students; listed individually in `migration_flags_competition1`), and 231 `reading_sessions` (78,842 s) all dated before the competition — attached to Competition 1 but earn 0 points because it is chanting-only.

**Not covered by any test:** the React UI behaviour, the Next API routes with a real JWT, Supabase Realtime, storage uploads, and the Management-API apply script (none could run without the live project).

## 7. Decisions where the prompt was ambiguous

1. **Competition 1 keeps its historical per-day points** (`config.use_logged_points = true`, streak cap 1000, shield 1, late days from the old setting). Re-scoring with the current formula would silently change 7 students' totals; HOD can untick the option in the competition form to re-score.
2. **Late logging**: activity date must be inside start–end, and today ≤ end + `late_log_days` (default 1), so the final day can still be submitted the next day. After that everything is rejected.
3. **Streak** counts days with chanting *or* reading activity (by type); the multiplier applies to chanting points only. Shield bridges exactly one missed day (as before).
4. **Reading day** = IST date of the session start; counted whole minutes per day are capped, then × points/minute.
5. **Weights** apply only for type `both`; for single-type competitions weight is 1.
6. **Award criterion extra**: added `highest_bonus` (quiz + HOD bonus) so the old "Active Entity" award (highest admin bonus) can be expressed; it is in addition to the preset list you gave.
7. **Ties**: all tied students are listed with `tie_order`; the review screen preselects only tie_order 1 (earliest to reach the score, then best streak) and lets the HOD include the others.
8. **Default awards** seeded per competition: Rising Sadhaka, Unbroken Flame, Mahayogi Crown always; Active Entity and Jijnasu Scholar only if bonus is enabled.
9. **`is_admin(text)` kept** as a no-arg-equivalent wrapper so the still-deployed old client does not break between migration and deploy; remove later.
10. **Quiz review** after submission shows the student's choice and right/wrong flags, never the correct answer text. Per-question instant feedback was removed (grading is end-of-quiz on the server).
11. **Audiobook duration**: stored in `audiobooks.duration_seconds` (HOD CMS auto-fills it from the file and has a "Detect missing durations" button). Until set, the longest duration reported by any listener is used.
12. **Students are not deletable from the admin UI** (button removed; deleting cascades all scored history). `/api/admin/update-user` is HOD-only with a column whitelist.
13. **Content deletes** are blocked when they would cascade-delete scored history (books with reading sessions, audiobooks with quiz submissions).
14. **Onboarding**: gender and age are always required; `onboarding_fields` can hide only full name / mobile / department, and hidden fields are not required. Department suggestions come from `list_departments()` because students can no longer read other rows.
15. **Role/onboarding cache** in `proxy.ts` (signed httpOnly cookie, 5 min, positive results only). A role change can take up to 5 minutes to affect *routing*; APIs and the database always use the real role.
16. **`/api/awards-stats` and `/api/user-logs` were deleted** instead of hardened (replaced by `get_awards_view` / `get_public_profile`, which return only what the caller may see).
17. **`fetch-book`** allow-list = Dropbox/Google Drive/googleusercontent + the Supabase host + hosts found in the `books` table; https only, private/loopback/link-local IPs refused on every redirect hop, 25 MB / 20 s limits, and refused entirely while the active competition does not use Books (admins excepted). DNS rebinding between the check and the fetch is a residual risk.
18. **Lint**: React-Compiler-style rules (`set-state-in-effect`, `static-components`, `purity`, `immutability`, `refs`) and `no-explicit-any` were downgraded to warnings in `eslint.config.mjs` (the pre-existing code base uses these patterns throughout); real errors (unescaped apostrophes, `@ts-ignore`) were fixed. `scratch/`, `backups/`, `scripts/` are lint-ignored.
19. **Unarchive publishes** the competition again and can therefore hit the overlap error.

## 8. Things I could not complete / risks left

- **Live application and live testing** — see §1. After applying, re-run the manual smoke list: create a competition, log as a TEST student, finalize, check the popup. (I deliberately did not create TEST_ accounts in the live project because none of the new code exists there yet.)
- RLS policies that existed live but not in the repo are **dropped and replaced** by migration 3 (policy names unknown). If you had any custom policy (e.g. on Storage buckets — those are in the `storage` schema and are untouched), re-check it.
- Storage: the cover-photo upload still uses buckets `avatars`/`public` with whatever Storage policies exist live (unchanged, not verifiable).
- `users.total_points` is now a derived lifetime value maintained by the database; `streak_count/best_streak/last_log_date/freeze_credits/target_*` are legacy columns that are no longer maintained (kept, not dropped).
- 107 lint warnings remain (mostly `any` and effect-state patterns in pre-existing UI code).
- Concurrency: per-user advisory locks serialise recomputation; PGlite is single-connection so true parallel races were reasoned about, not load-tested.
- Backups contain phone numbers and emails — keep `backups/` out of git (it is ignored) and delete it when no longer needed.
