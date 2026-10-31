# Audit Report — FOLK Sadhana Competition App

Read-only audit of the repository at `D:\AI_Apps\Competition` (git `main`, working tree clean, HEAD `83291a4`, 26 commits, 2026-05-16 → 2026-08-20).
Every file in `app/`, `components/`, `lib/`, `hooks/`, `store/`, `proxy.ts`, `schema.sql`, `supabase/migrations/`, `scratch/` and the config files was read. Nothing was modified, installed, run against the database or deployed. The only file created is this report.

**Important limitation:** I could only see the code in the repo. I did **not** query the live Supabase project. `schema.sql` and the three migrations are demonstrably out of sync with what the app expects (see §9.1), so statements about RLS and table shape below are "per the repo SQL"; the live database may differ. Items where this matters are marked **[verify live]**.

---

## 1. STACK & STRUCTURE

### 1.1 Stack
| Layer | What | Where |
|---|---|---|
| Framework | Next.js **16.2.6** (App Router), React **19.2.4**, TypeScript 5 | `package.json:22-24` |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`), Inter font, custom theme classes `theme-dark` / `theme-cream` | `package.json:30,37`, `components/ClientLayout.tsx:11-26` |
| State | Zustand store for `user / isAdmin / isOnboarded` | `store/authStore.ts` |
| Backend / DB / Auth / Realtime / Storage | **Supabase** (Postgres + RLS, Google OAuth, Realtime `postgres_changes`, Storage buckets `avatars` / `public`) | `@supabase/ssr`, `@supabase/supabase-js` |
| Hosting | **Vercel** (inferred: `.env.local` comment, hard-coded `https://folk-competition.vercel.app/` at `app/admin/page.tsx:215`; README). No `vercel.json`, no CI config, no GitHub Actions. A comment in `app/auth/callback/route.ts:53` mentions Netlify (stale). | |
| Other libs | framer-motion, recharts, canvas-confetti, react-hot-toast, lucide-react, `mammoth` (renders .docx books), `@dotlottie/react-player` (award animations) | `package.json` |
| No separate backend server | All "backend" = Next.js Route Handlers in `app/api/*` + Supabase RLS + one Postgres function `is_admin()`. No Edge Functions, no cron, no DB triggers, no Postgres functions besides `is_admin` in the repo. | |

Next.js 16 note: the auth gate is `proxy.ts` (Next 16 name for `middleware.ts`; doc exists at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).

### 1.2 Folder map
```
proxy.ts                         Auth/onboarding/admin route gate (every request except _next/static, _next/image, favicon)
schema.sql                       Original schema + RLS (NOT the full truth – see §9.1)
supabase/migrations/             3 migrations: audiobooks+quiz, books+reading_sessions, user_chanting_logs
scratch/*.js                     8 one-off node scripts using the SERVICE ROLE key (tracked in git)
lib/pointsEngine.ts              calculatePoints, updateStreak, checkAwardUnlocks
lib/supabaseClient.ts            Browser Supabase client singleton
store/authStore.ts, hooks/useAuth.ts, components/AuthProvider.tsx   Auth state
app/page.tsx                     Login page (Google button)
app/auth/callback/route.ts       OAuth code exchange + create `users` row + redirect
app/onboarding/page.tsx          Registration form
app/leaderboard/page.tsx         Leaderboard + live feed + rules modal + opens DailyLogModal
app/chanting/page.tsx            Digital Japa (108-bead) counter
app/profile/page.tsx             Student hub: charts, tiers, edit commitment
app/awards/page.tsx              Awards page (computed client-side)
app/books/page.tsx               Book reader + reading timer        (HIDDEN from nav)
app/podcast/page.tsx             Audiobooks + quizzes               (HIDDEN from nav)
app/admin/{page,users,settings,logs,awards,books,audiobooks}/page.tsx   Admin area
app/admin/layout.tsx             Admin shell (menu shows only Dashboard / Users / Settings & CMS)
app/api/*                        admin-whitelist, admin/update-user, awards-stats, fetch-book, save-reading-session, sync-chanting, user-logs
components/student/*             DailyLogModal, UserProfileModal, AwardIcons, AvatarTiers, ConsistencyHeatmap
public/{animations,avatars,levels}   Static assets
```

### 1.3 Build / deploy / config
- Scripts: `dev`, `build`, `start`, `lint` only (`package.json:5-10`). No tests exist.
- `.npmrc` → `legacy-peer-deps=true` (workaround for peer conflicts, commit `fd7724f`).
- `next.config.ts` is empty (no headers, no image domains, no CSP).
- `.env.local` (gitignored by `.gitignore:34` `.env*`; confirmed not tracked) holds: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`. `NEXT_PUBLIC_APP_URL` is **not referenced anywhere** in the source. The callback also accepts fallback names `SUPABASE_URL` / `SUPABASE_ANON_KEY` (`app/auth/callback/route.ts:13-14`).
- Deployment is presumably Vercel git-push; nothing in the repo defines it.

---

## 2. AUTHENTICATION & REGISTRATION

### 2.1 Login method
- **Google OAuth only**, via Supabase: `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: <origin>/auth/callback, queryParams: { access_type:'offline', prompt:'consent' } })` — `app/page.tsx:16-29`.
- No email/password, magic-link or other provider UI exists in the code. Whether the Supabase project also has other providers enabled cannot be seen from the repo **[verify live]**.
- No restriction on *which* Google accounts can sign in (no domain allow-list, no college-email check). Any Google user becomes a student.
- Flow: `/auth/callback` exchanges the code (`callback/route.ts:45`) → `is_admin(email)` RPC → if admin, redirect `/admin` and **no `users` row is created** (`:63-71`); otherwise `insert users {id, full_name}` (duplicate error 23505 ignored, `:74-81`) → `/onboarding` if `is_onboarded` is false, else `/leaderboard` (`:84-96`).
- `proxy.ts` re-checks on every request: no session → `/`; `/admin*` requires `is_admin` (`:94-102`); non-admins without `is_onboarded` are forced to `/onboarding` (`:105-127`).
- Client side, `AuthProvider` loads user + `is_admin` into Zustand (`components/AuthProvider.tsx:16-84`) and shows the text "Restoring your session (Diagnostic Mode)..." as the loading screen (`:92`).

### 2.2 Registration fields (`app/onboarding/page.tsx`)
| Field | Collected? | Validation | Stored in |
|---|---|---|---|
| `full_name` | yes | non-empty (`:95`) | `users.full_name` |
| `mobile` | yes | exactly 10 digits `^\d{10}$` (`:103`) — India-style only | `users.mobile` |
| `gender` | yes | `M` or `F` only (`:107-114`) | `users.gender` (CHECK `M`/`F`) |
| `department` | yes, free text with a `<datalist>` of already-used values (`:60-67, 264-280`) | non-empty | `users.department` |
| `target_chanting` / `target_reading` / `target_hearing` | **hidden**, defaults 16 / 30 / 30 (`:24-32`); validated ≥1 / ≥5 (`:130-137`) | | `users.target_*` |
| **age** | **Does not exist anywhere** (no column, no field) | | |
| college / institution | Not a separate field — `department` is the only org field | | |
| email | Not stored in `users`; only in `auth.users` | | |
- Draft is kept in `localStorage['onboarding_draft']` (`:12, 73-83`).
- `onboarding_fields` setting (`schema.sql:82`) is read (`:50-58`) to hide full_name/mobile/department inputs, but `validateFields()` still requires them, so hiding a field would make the form un-submittable. Gender is never configurable.
- Save = `supabase.from('users').upsert({id, ...formData, is_onboarded:true})` directly from the browser (`:151-157`).

### 2.3 User data structure (`schema.sql:12-29`)
`users`: `id` (= auth uid), `full_name`, `mobile`, `gender`, `department`, `avatar_url` (never written by any code), `target_chanting/reading/hearing`, `total_points`, `streak_count`, `best_streak`, `last_log_date`, `freeze_credits` (default 1), `is_onboarded`, `created_at`.
Other per-user tables: `activity_logs`, `user_chanting_logs`, `bonus_points`, `awards`, `reading_sessions`, `user_audiobook_progress`, `quiz_submissions` (all keyed by `user_id`, none by competition).
Note: admin screens reference `users.email` (`app/admin/users/page.tsx:116, 475, 272`) but **no `email` column exists** in the schema → email search and the CSV "Email" column are always blank.

---

## 3. ROLES & PERMISSIONS

### 3.1 Roles that exist
- **Student**: any signed-in Google user whose email is *not* in `admin_emails`. There is no role column on `users`.
- **Admin roles** (table `admin_emails(id, email, role)`):
  - `HOD` ("Folk HOD") — sees everyone, can add/remove/reassign admins.
  - `FOLK_GUIDE` — UI scope: **male** participants only.
  - `FOLK_ENABLER_MALE` — UI scope: male participants only.
  - `FOLK_ENABLER_FEMALE` — UI scope: female participants only.
  - Legacy `FOLK_ENABLER` is mapped to `FOLK_ENABLER_MALE` (`app/api/admin-whitelist/route.ts:118`).
- There is no "guide-over-female-students" role, and no per-student mentor assignment — scope is purely by `users.gender`.

### 3.2 How roles are assigned / stored
- Stored in `admin_emails.role` (default `'HOD'`, `schema.sql:2-9`). Matched to the signed-in user by **email string only** (no FK to auth user).
- Managed at `app/api/admin-whitelist/route.ts` (GET/POST/PUT/DELETE) via the service-role client, UI in Settings → "Admin Whitelist" (`app/admin/settings/page.tsx:812-971`). Creation matrix `canAssignRole` (`route.ts:53-65`): HOD → anything; Guide → Guide or Male Enabler; Male Enabler → Male Enabler; Female Enabler → Female Enabler. Only HOD can DELETE (`:221`).
- The first HOD has to be inserted manually in the DB (no seed row in `schema.sql`; `scratch/test-admin.js:10` tests a personal Gmail).

### 3.3 Where permissions are actually enforced
| Control | UI only? | Server/DB enforced? |
|---|---|---|
| Admin area access | — | **Yes**: `proxy.ts:94-102` (`is_admin`), API routes re-check |
| Admin whitelist create/delete | — | **Yes**, server (`admin-whitelist/route.ts`) — but see flaws below |
| **Gender scoping of Guides/Enablers** (dashboard, users, leaderboard, feed) | **UI-only** — client-side `.filter(u => u.gender===...)` at `app/admin/page.tsx:109-117`, `app/admin/users/page.tsx:82-90`, `app/leaderboard/page.tsx:252-260, 459-465` | **No.** RLS `is_admin()` returns true for *any* row in `admin_emails` regardless of role (`schema.sql:90-93`), so every admin role can read/write all users' data directly. |
| **HOD-only competition settings** (dates, title, photo, resets) | **Not enforced at all.** Settings page and menu have no role check (`app/admin/layout.tsx:60-64`, `settings/page.tsx` has none); RLS lets any `is_admin` update `app_settings` (`schema.sql:124`). A Guide or Enabler can change competition dates, the cover photo, books/podcasts and run "Reset All Points". | |
| `/api/admin/update-user` | | Any admin (any role, any gender) can update **any column of any user** — body is spread straight into `.update(updates)` with the service role key (`app/api/admin/update-user/route.ts:45-61`). No allow-list of fields (mass-assignment). |
| Student write access | | RLS only checks *row ownership*, not columns/values (see §9.2): a student can bypass the UI and write their own `total_points`, `streak_count`, `target_chanting`, `activity_logs.points_earned`, `reading_sessions.seconds_read`, `quiz_submissions`, `user_audiobook_progress` directly via the Supabase REST API with their own JWT. They **cannot** update `app_settings` or `admin_emails` (per `schema.sql`). |

**Answer to "can a guide or student bypass the UI and write settings directly?"** — A Guide/Enabler: **yes**, trivially (they are admins as far as the DB is concerned). A student: not settings (per repo RLS **[verify live]**), but they can freely edit their own score data.

### 3.4 Flaws in the role code
1. **Role downgrade of any admin, including HOD.** `PUT /api/admin-whitelist` only checks that the *new* role is assignable by the caller (`route.ts:194`); it never checks the *target's current* role. A Folk Guide (or Male Enabler) can `PUT {id:<HOD id>, role:'FOLK_GUIDE'}` and demote the HOD.
2. **Possible privilege escalation via CHECK constraint mismatch [verify live].** `schema.sql:5` allows only `HOD / FOLK_GUIDE / FOLK_ENABLER`, but the code inserts `FOLK_ENABLER_MALE / FOLK_ENABLER_FEMALE`. If the live CHECK is unchanged, the insert fails and the `POST` handler's "fallback" (`route.ts:160-169`) re-inserts **without a role**, so the DB default **`HOD`** applies — a new Enabler silently becomes an HOD.
3. `is_admin(user_email TEXT)` is `SECURITY DEFINER` and callable by any (even anonymous) client with any email argument → it can be used to **enumerate which emails are admins** (`schema.sql:90-93`; no `REVOKE`).
4. Email comparison is case-sensitive (`route.ts:41`, `is_admin`), while inserts are lower-cased (`:156`).
5. An admin who is also a student has no `users` row (callback skips creation for admins, `callback/route.ts:68-71`), so "View as Student" (`admin/layout.tsx:168-173`) pages that `.single()` the `users` row can fail.

---

## 4. COMPETITION LOGIC (most important)

### 4.1 Is there a competition data model? — **No.**
- There is **no `competitions` table and no `competition_id` column anywhere.** The "competition" is a global singleton made of a few key/value rows in `app_settings(key,value)` (`schema.sql:69-87`):
  `challenge_title`, `challenge_start_date`, `challenge_end_date`, `challenge_image_url` (not seeded; created on first save), `log_cutoff_hour`, `late_log_allowed_days`, `onboarding_fields`, `points_per_chanting_round/reading_minute/hearing_minute`, `streak_bonus_multiplier`, `freeze_credits_on_join`, `podcast_completion_threshold`.
- **No competition "type"** field exists. "Chanting-only" is implied purely by code (§4.3). No awards-per-competition, no photo-per-competition, no winners stored.
- **Only one competition can exist at a time.** No past/present/future concept, no history.
- Every data table (`activity_logs`, `bonus_points`, `awards`, `quiz_submissions`, `user_audiobook_progress`, `reading_sessions`, `user_chanting_logs`) is keyed only by `user_id` and a date/timestamp; `users.total_points / streak_count / best_streak / last_log_date / freeze_credits` are **running counters for the single global competition.**

### 4.2 What the HOD can set from the admin panel
Settings → "Challenge Config" (`app/admin/settings/page.tsx:722-807`): **title, start date, end date, cover photo** (URL, or file upload to Storage bucket `avatars`, falling back to `public`, `:262-287`). Saved with one `app_settings.upsert` of all form fields (`:289-301`). Four other settings are re-submitted as **hidden inputs with hard-coded fallback values** (`:798-801`: `log_cutoff_hour '21'`, `freeze_credits_on_join '1'`, `points_per_chanting_round '8'`, `points_per_reading_minute '30'`) — these differ from the `schema.sql` defaults (20 / 1 / 2 / 1), so the first admin save silently rewrites them. None of the four are read by any scoring code (see 4.3), so no scoring effect, but the data is misleading.
Also: podcast completion % (`:429-447`), books/podcast CMS, admin whitelist, and the Danger Zone resets (`:503-517`).
It is not HOD-restricted (see §3.3).

### 4.3 Where the current competition type / dates / rules are hard-coded
| Hard-coded thing | Location |
|---|---|
| "Chanting only; reading & hearing ignored" | `lib/pointsEngine.ts:22-43` (reading/hearing inputs, `points_per_*`, `streak_bonus_multiplier` are accepted but **unused**); `components/student/DailyLogModal.tsx:243-244, 270-280, 538-546` (form has only a rounds field); commit `1bc1cd4 "only chanting competition"` |
| Scoring formula text on the rules modal and commitment box | `app/leaderboard/page.tsx:828-854`, `DailyLogModal.tsx:406-427` |
| "26-Day" duration | `app/page.tsx:70`, `app/layout.tsx:12`, `app/leaderboard/page.tsx:286`, `app/profile/page.tsx:145`, `components/student/ConsistencyHeatmap.tsx:17` (renders exactly 26 boxes regardless of end date), `schema.sql:77-79` |
| Admin dashboard day matrix is **not** driven by the settings dates: it uses the dates that have logs, padded to 16 days from the first log (`app/admin/page.tsx:129-153`) | |
| Fallback end date `'2026-07-15'` (already in the past) | `app/awards/page.tsx:114` |
| Streak shield: 1 credit, resets via script to 1 (`scratch/reset_competition.js:61`), rules text says "1 Streak Shield" | `leaderboard/page.tsx:898-899`, `pointsEngine.ts:122` |
| Navbar shows only Leaderboard / Chanting / Profile / Awards; Books and Podcast are commented out | `components/Navbar.tsx:46-53` |
| Live URL in WhatsApp reminder text | `app/admin/page.tsx:215` |
| Reset: a node script that hard-deletes everything | `scratch/reset_competition.js` (commit `6d27d29`) |

### 4.4 Reading competition
- **Unit: seconds** read in the in-app reader (`reading_sessions.seconds_read`, migration `20260519120000`). Also a separate, vestigial `activity_logs.reading_minutes` column (see below).
- Submission: the book reader (`app/books/page.tsx:326-363`) auto-tracks a timer with a 3-minute idle timeout (subtracts 180 s on idle), saves only if `> 10 s`, and posts via `navigator.sendBeacon` to `/api/save-reading-session` (on tab hide/unmount/idle).
- Points: **1 point per full minute per session** — `Math.floor(secondsRead/60)`, added to `users.total_points` with the service role (read-then-write, no transaction) (`app/api/save-reading-session/route.ts:58-90`). Not capped, not tied to the competition dates, **not** stored in `activity_logs`, not shown in the live feed.
- `/books` is hidden from the nav (`Navbar.tsx:52`) but **the route and the API are still live**; `proxy.ts` does not block them, so reading points can still be earned by URL. The rules modal says reading yields nothing for this cycle — misleading.
- Server trusts `secondsRead` from the client (only checks `typeof number` and `> 10`, `route.ts:36-42`): a single POST of `secondsRead: 10000000` awards ~166k points (see §9.2).
- Vestigial: `DailyLogModal.tsx:159-163` pre-fills `reading_minutes` with the student's `target_reading` (30) in hidden form state and saves it into every `activity_logs` row (`:293, 306`), though no field is shown. So every log row says "read 30 min".
- Books are Dropbox/PDF/.docx links; `.docx` is fetched through `/api/fetch-book` and rendered with mammoth (`books/page.tsx:473-520`).

### 4.5 Chanting competition
- **Unit: rounds** (1 round = 108 beads in the Digital Japa counter, `app/chanting/page.tsx:165-173`).
- Two submission paths:
  1. **Manual log**: Leaderboard → "Log Activity" → `DailyLogModal` (`DailyLogModal.tsx`): pick an unlogged date, type rounds, submit. Writes `activity_logs` and updates `users` directly from the browser (`:289-321`).
  2. **Digital counter**: every tap calls `saveState` → `POST /api/sync-chanting` (`chanting/page.tsx:86-106`) which upserts `user_chanting_logs(user_id, log_date, rounds_chanted)` and then runs an "auto-fulfillment" (`api/sync-chanting/route.ts:58-156`) that converts unlogged chanting days into `activity_logs` rows + points.
- **Points per day (current formula)** — `lib/pointsEngine.ts:22-43`:
  - `base = round(rounds / target_chanting × 10)` (target defaults to 16; 100 % of commitment = 10 points; **not capped at 100 %**, 32 rounds on a 16 target = 20 points)
  - `streak multiplier = streak_count` (Day N = N×, **unbounded**)
  - `daily points = round(base × streak)`
  - Streak: +1 if last log was yesterday; 1 shield (`freeze_credits`) covers a 1-day gap; otherwise reset to 1 (`pointsEngine.ts:73-138`). Streak/points counters live on `users` and are updated read-modify-write from the client.
- Commitment ("target_chanting"): set once in the first-log modal (`DailyLogModal.tsx:128-131, 171-200`), can only be *raised* in Profile (`profile/page.tsx:244-266`, client check only), editable by any admin (`admin/users/page.tsx:172-191`, input max 108).
- Late logging: `late_log_allowed_days` (default 1) checked **client-side only** (`DailyLogModal.tsx:237-241`).

### 4.6 "Combined reading + chanting" logic — partially exists as leftovers
- Pre-`1bc1cd4` engine did `base = chanting_pts + reading_pts` (target-normalised, streak cap 50 %); it was removed. Remains: `profile/page.tsx:121-135, 183-188` and `UserProfileModal.tsx:78-83` still compute a "Reading" component from `log.reading_minutes / target_reading × 10` for charts (which, because of the hidden 30-min default, shows a constant bar); `ConsistencyHeatmap.tsx:29-34` averages chanting and reading completion; `UserStats.cumulative_reading_minutes` in `pointsEngine.ts:45-51`; `target_reading/target_hearing` columns and onboarding defaults; reading API points (§4.4); quiz points (§5). There is **no coherent combined scoring mode** — only inconsistent remnants.

### 4.7 What happens when a competition ends / a new one starts
- **Nothing happens automatically.** There is no code that reads `challenge_end_date` to stop logging, freeze the leaderboard, snapshot results, or archive. Specifically:
  - `DailyLogModal.tsx:58` builds selectable dates from the start date up to *today* with **no upper bound at the end date**, so students can keep logging after the end date; `leaderboard/page.tsx:208-221` likewise keeps counting "unlogged days" past the end. `activity_logs` INSERT has no date check in RLS. The reading/quiz/sync APIs have no end-date check either.
  - Leaderboard shows "Day N of total" capped at total (`leaderboard/page.tsx:292-303`).
- **No archive.** Resetting is destructive: `scratch/reset_competition.js` deletes all `activity_logs`, `bonus_points`, `awards`, `user_audiobook_progress`, `quiz_submissions` and zeroes `users` counters (`:29-66`); it does **not** clear `user_chanting_logs` or `reading_sessions` (so old chanting rows would re-auto-fulfill as soon as `/api/sync-chanting` runs — `sync-chanting/route.ts:62-79`). The in-app "Reset All Points & Activity Logs" (`settings/page.tsx:503-517`) deletes `activity_logs` and zeroes `total_points` only (leaves bonus, quiz, awards, `best_streak`, `last_log_date`); `activity_logs` has **no DELETE policy** in `schema.sql`, so that delete likely deletes nothing while the points still zero **[verify live]**.
- Past results are therefore not preserved anywhere (the only "history" is Git/DB backups).

### 4.8 Dates and time zones — inconsistent (UTC vs local)
- "Today" as a UTC date string (`new Date().toISOString().split('T')[0]`): `DailyLogModal.tsx:33, 138, 500`, `leaderboard/page.tsx:83, 191`, `api/sync-chanting/route.ts:39` (server = UTC on Vercel).
- "Today" as a browser-local date: `chanting/page.tsx:32-35`, `admin/page.tsx:41, 119`, `awards/page.tsx:117-120`, `profile/page.tsx`.
- For students in India (UTC+5:30), between 00:00 and 05:30 IST, the leaderboard/modal/server think "today" is yesterday while the chanting counter uses the real local day. This can file a day's chanting under the wrong date, mis-evaluate "late", break streak maths (`updateStreak` parses `YYYY-MM-DD` as UTC then `setHours` local, `pointsEngine.ts:94-99`) and make the auto-fulfill key off a different date than the counter.
- The `log_cutoff_hour` setting (default 20/21) is stored and re-saved but **never read** by any logic — there is no daily cutoff time. Competition start/end are bare dates compared in the viewer's local time (`awards/page.tsx:114-120`); there is no explicit time zone setting.

---

## 5. BONUS SYSTEM — every mechanism found

| # | Mechanism | Where | How it works |
|---|---|---|---|
| 1 | **Admin bonus points** (positive or negative) | `app/admin/users/page.tsx:203-247` (UI button `:557, 668`) | Inserts `bonus_points(user_id, points, title)` then re-reads `users.total_points` and calls `/api/admin/update-user` with `total_points = old + points`. Two non-atomic steps (race; if step 2 fails the bonus row exists but the score didn't change). `bonus_points.admin_id` column is never filled. |
| 2 | **Streak multiplier** | `pointsEngine.ts:28-33` | Daily score × streak number (unbounded). Not stored as bonus; embedded in `points_earned`. |
| 3 | **Streak shield** (`freeze_credits`) | `pointsEngine.ts:122-129`, `leaderboard/page.tsx:898` | Protects a streak across one missed day; 1 per user. |
| 4 | **Auto-fulfillment from the Japa counter** | `api/sync-chanting/route.ts` | Creates log + points automatically from counter data (see issues §9.2 — it fires for *today* too). |
| 5 | **Audiobook-listening completion** → unlocks quiz | `app/podcast/page.tsx:86-138, 226-263` | Browser tracks unique `Math.floor(currentTime)` seconds heard while `!paused`; at `duration × threshold` (admin-set %, default 80 %, `app_settings.podcast_completion_threshold`) it upserts `user_audiobook_progress(is_completed=true, completed_at)`. Awards **no points** itself. |
| 6 | **Quiz** | `podcast/page.tsx:397-444, 446-612` | Quiz locked until progress `is_completed`. Questions come from `quiz_questions` (A–D options, `correct_answer` text). Answers are checked **in the browser** against `correct_answer` (`:550-552`). On finish: **5 points per correct answer** (`:399`) added to `users.total_points` (read-then-write from the browser, `:403-420`) *then* `quiz_submissions(score, points_earned)` is inserted (insert failure is only `console.warn`'d, `:433-435`). One attempt per audiobook is UI-enforced via `quiz_submissions` (UNIQUE `(user_id, audiobook_id)`). Quiz progress is kept in `localStorage`. |
| 7 | **Reading-minute points** | `api/save-reading-session/route.ts` | See §4.4. 1 pt/min. |
| 8 | **Awards** (badges) | §7 | No points. |

- **Bonus is not tied to any competition.** Nothing in `bonus_points`, `quiz_submissions`, `user_audiobook_progress` or `reading_sessions` references a competition; they all feed the one global `users.total_points`.
- The rules modal says "Audiobooks & quizzes yield 0 points during this cycle" (`leaderboard/page.tsx:844`), yet `awardQuizPoints` still pays 5/correct and `/podcast` is reachable by URL. Contradiction: the nav hides the feature, the code still pays.
- Audiobook categories `F2/F4/F8/F12/F16` (CHECK in `schema.sql:139`) and `audiobooks.language` (used by the admin form, `settings/page.tsx:460`, but **not present in any SQL file**).
- Quiz parser (admin pastes "Question:/A)…/Answer:" text) at `settings/page.tsx:200-259` (and duplicated in `app/admin/audiobooks/page.tsx`).
- Anti-cheat on listening is only client-side; correct answers are downloadable by any logged-in student (`quiz_questions` SELECT policy `auth.role()='authenticated'`, `schema.sql:174`).

---

## 6. LEADERBOARD & LIVE ACTIVITY FEED

### 6.1 Leaderboard (`app/leaderboard/page.tsx`)
- **Computed from a stored counter, client-side.** `select * from users order by total_points desc` (`:75-78`), then re-sorted in the browser: points desc, tie-break = earliest `last_log_date` (nulls last) (`:262-269`). `users.total_points` is a mutable counter written from **six places** (DailyLogModal, sync-chanting, save-reading-session, podcast quiz, admin bonus, reset scripts) with read-modify-write and no transaction/recompute → drift is likely and there is no way to rebuild it from the logs.
- Ranks **everyone together** by total points. Filters: **none for students** (no gender / college / competition filter). Admin roles get gender-scoped lists, client-side only (`:252-260`).
- Shows rank, avatar (never set), name, department, streak flame, points; clicking a row opens `UserProfileModal`.
- "Today's reporting" banner counts `activity_logs` with `log_date = <UTC today>` (`:83-88`).
- Realtime: subscribes to `postgres_changes` on `users`, `activity_logs`, `bonus_points`, `user_audiobook_progress`, `quiz_submissions` and **re-runs all ~8 queries on every event** (`:231-250`) — heavy at scale.
- **Privacy:** the page loads `users.*` for every student, including `mobile`, in the browser payload (`:75-78`; RLS lets any authenticated user read all rows, `schema.sql:106`). Phone numbers of all participants are readable by any logged-in student via the API even though the UI doesn't display them.

### 6.2 Live activity feed (`recentActivities`, `leaderboard/page.tsx:344-469`)
Merges, sorts by timestamp desc and shows the top **10**:
1. `log` — latest 10 `activity_logs` (skips rows with 0 rounds and 0 reading). Message uses `reading_minutes`, so it says "…and read for 30 mins" because of the hidden default (see §4.4).
2. `streak` — **synthetic**: any user with `streak_count ≥ 3`, timestamp `last_log_date + 500 ms`.
3. `milestone` — **synthetic**: any user with `total_points ≥ 100`, timestamp = account `created_at` (so it sorts as old and is not a real event).
4. `bonus` — latest 10 `bonus_points` ("awarded bonus points by the Admin").
5. `listen` — latest 10 audiobook completions.
6. `quiz` — latest 10 quiz submissions.
No award events, no "rank changed" events. Admin roles see only their gender's events.

---

## 7. AWARDS (known bug)

### 7.1 Data model
- Table `awards(id, user_id, award_key, unlocked_at default now(), custom_message, UNIQUE(user_id, award_key))` (`schema.sql:59-66`). **That is all**: no winner-name column, no unlock-date column per award, no competition id, no "seen/notified" flag, no rank/position, no `awards_definitions` table.
- The 5 award definitions are hard-coded in **four unrelated places** with **conflicting rules**:
  | Key | `app/awards/page.tsx:14-50, 125-224` (what the user sees) | `lib/pointsEngine.ts:53-71` (`checkAwardUnlocks`, used only for confetti) | admin grant dropdown `admin/users/page.tsx:727-731` |
  |---|---|---|---|
  | `rising_sadhaka` "Rising Sadhaka" | highest total points (ties share) | first ever log | label same |
  | `unbroken_flame` | highest `best_streak` | streak ≥ 7 | |
  | `brahma_muhurta` "Active Entity" | highest summed admin bonus | ≥ 5 logs submitted before 06:00 | |
  | `mahayogi_crown` | highest single-day `points_earned` | total_points ≥ 500 | |
  | `jijnasu_scholar` | highest summed quiz points | *not in engine* | |
- Winner names and the unlock date are **not stored**; they are recomputed on every page view: winner names `awards/page.tsx:125-170`, unlock date = `challenge_end_date + 1 day` (`:57-66`), displayed for all awards identically.

### 7.2 What is supposed to happen on the unlock date
1. HOD sets `challenge_end_date`.
2. After 23:59:59.999 of that date (browser local time, `awards/page.tsx:113-120`), each student opening `/awards` should see their award(s) unlocked with the message and a celebration (confetti + chime, `:248-289`).
3. Admin can also manually "Grant Divine Award" to a student (`admin/users/page.tsx:249-266`) writing to `awards`.

### 7.3 Why the award is never actually given — precise cause
**There is no code path anywhere that creates an award for the winner, or tells them.**
1. **Nothing ever writes to `awards` automatically.** `grep` for `from('awards')`: the only writers are (a) the admin manual grant `handleGrantAward` (`admin/users/page.tsx:255`) and (b) the reset script (delete). There is no cron, DB trigger, Edge Function, server job, or end-date check in any API route. `checkAwardUnlocks` (`DailyLogModal.tsx:337-351`) runs after a student logs, returns keys but **only fires confetti** — it never inserts the awards.
2. **The only write path is unreachable.** The "Grant Award" form exists in the modal (`admin/users/page.tsx:722-740`), but no button ever calls `setModalType('award')`; the only calls are `setModalType('bonus')` (`:557, 668`) and `setModalType(null)`. The admin cannot open it. (The imported `Award` icon at `:7` is unused for this.) Result: the `awards` table is effectively always empty in practice **[verify live]**.
3. **The Awards page is only a derived view.** Winners are recomputed in the visitor's browser from `/api/awards-stats` and only "unlock" in that viewer's UI if `now > end date` and they are the top (`isUnlocked = !!dbRecord || (hasEnded && calc.isEligible)`, `:232`). Nothing is persisted, so there is no per-user award history and no "given on <date>" record; `unlockedAt` is fabricated as the end date (`:238`).
4. **Nothing notifies the winner.** There is no popup/notification/inbox/email mechanism. The winner must open `/awards` after the end date by themselves. Celebration (confetti) fires on **every visit** whenever any award is unlocked (`:248-252`) because there is no "already seen" state.
5. **Results are unstable because there is no freeze at the end date.** Students can still log, earn reading/quiz points and receive admin bonus after the end date (§4.7), and admin reset deletes/changes the data the winners are derived from. So the "winner" can change after the "unlock".
6. **Some awards can never be won as the app is configured now.** `jijnasu_scholar` requires `quiz_submissions` points; the quiz feature is hidden from the nav and declared "0 points this cycle", so `maxQuizSum` stays 0 and no one qualifies (`:165-170`, requires `> 0`). `brahma_muhurta` ("Active Entity") needs admin bonus rows; if none are given, no winner.
7. **Fragile dependencies:** end date fallback `'2026-07-15'` (`:114`) is already in the past — if the `challenge_end_date` row is missing/renamed, all awards "unlock" immediately for the current leader. Unlock is evaluated in each viewer's local time zone. `awards-stats` is a public service-role endpoint (§9.2), and the admin "Revoke" in `admin/awards/page.tsx:27-35` would be blocked by the missing DELETE policy on `awards` (`schema.sql:118-120` has only SELECT/INSERT) **[verify live]**. The admin Awards page is also not in the admin menu (`admin/layout.tsx:60-64`).

### 7.4 Per-user award history / popup
- **Per-user award history:** only the `awards` table rows (`unlocked_at`, `custom_message`); since nothing creates rows, effectively none. No history of "seen" or of previous competitions.
- **Popup / notification mechanism:** **none exists** for awards. The only popup-like things are react-hot-toast toasts, the confetti, and the "upcoming" toast stub in `Navbar.tsx:15-44` (used for hidden Books/Podcast). A global mechanism would have to be added (e.g. in `ClientLayout`).

---

## 8. CONTENT SECTIONS

| Section | Where content lives | Hard-coded or admin-editable? |
|---|---|---|
| **Books** | `books(title, language Hindi/English/Gujarati, pdf_link)` | Admin-editable (add/delete only, no edit) in Settings → Books CMS (`settings/page.tsx:373-409, 975-1115`; also an older duplicate `app/admin/books/page.tsx`). Links are Dropbox/PDF/.docx; `normalizeDropboxUrl` rewrites `dl=0` → `raw=1` (`books/page.tsx:460-471`). Student page hidden from nav. |
| **Audiobooks / podcasts** | `audiobooks(category F2…F16, title, audio_url, [language])` + `quiz_questions` | Admin-editable in Settings → Podcasts CMS (`settings/page.tsx:449-501, 1118-1257`; duplicate `app/admin/audiobooks/page.tsx`). Audio hosted externally via URL. Hidden from nav. |
| **Quizzes** | `quiz_questions`, `quiz_submissions` | Admin pastes formatted text; parsed client-side. |
| **Awards** | definitions in code (§7.1); grants in `awards` | Hard-coded definitions; manual grant unreachable. |
| **Avatars / levels** | `public/avatars`, `public/levels`, `components/student/AvatarTiers.tsx`; tier = total points 100/300/500/750/1000 (`profile/page.tsx:226-242`) | Hard-coded. `users.avatar_url` is never set. |
| **Rules text** | Leaderboard "Rules & Score Math" modal, Chanting "Rules & Protection" modal, commitment box | Hard-coded in JSX; not editable, and partly stale. |
| **Campaign title / dates / cover photo** | `app_settings` | Admin-editable (see §4.2). |
| **Admin reminder WhatsApp text** | `app/admin/page.tsx:211-217` | Hard-coded template, editable per message; "reminded" status stored only in the admin's `localStorage` per day (`:41-47, 78-86`). |
| **Theme switcher** | `localStorage['app_theme']` | per-browser. |

---

## 9. RISKS & ISSUES

### 9.1 Schema drift — repo SQL ≠ what the app needs
- `audiobooks.language` is used (`settings/page.tsx:460`) but not in any SQL; `challenge_image_url`, `podcast_completion_threshold` are never seeded; `users.email` doesn't exist but is used by admin pages; `quiz_submissions` exists only in `schema.sql`, not in `supabase/migrations/`; there is no `supabase/config.toml`; `admin_emails.role` CHECK vs code roles (§3.4-2); the `app_settings` upsert for **new** keys needs an INSERT policy that `schema.sql` does not define (only SELECT/UPDATE, `:122-124`). Because the app evidently works, the live DB was modified manually. **A fresh deploy from the repo would not work.**
- Missing DELETE/UPDATE policies in the repo SQL for flows the UI relies on: admin delete of `activity_logs`, `awards`, `users`; `awards` upsert; `quiz_submissions` update → those admin buttons would silently do nothing **[verify live]**.
- `scratch/` (service-role scripts, a personal email in `test-admin.js:10`) is tracked in git.

### 9.2 Security gaps (highest priority)
1. **Students can edit their own scores directly.** `users` UPDATE policy is only `auth.uid() = id` with no column restriction (`schema.sql:107`), so anyone can PATCH `total_points`, `streak_count`, `best_streak`, `is_onboarded`, `target_chanting` etc. via the REST API with their own JWT. Likewise `activity_logs` INSERT accepts any `points_earned` (`:110`), `reading_sessions`, `quiz_submissions`, `user_audiobook_progress` inserts are unconstrained. All scoring is computed in the browser and trusted.
2. **`/api/save-reading-session` trusts the client and uses the service role** — any logged-in user can POST `{bookId, secondsRead: huge}` for unlimited points (`route.ts:34-90`).
3. **`/api/awards-stats` is unauthenticated** and returns every user's id, name, points, best streak plus all bonus/logs/quiz rows via the service-role key (`app/api/awards-stats/route.ts:4-45`). Anyone on the internet can call it.
4. **`/api/fetch-book` is an SSRF proxy**: any logged-in user can make the server fetch any URL and return the bytes (`route.ts:33-56`); no host allow-list, no size/time limit.
5. **`/api/admin/update-user` mass-assignment** by any admin role (see §3.3).
6. **Phone numbers exposed to all students** (§6.1).
7. Commitment cannot be reduced in the UI but can be at the DB level; lowering `target_chanting` to 1 multiplies points per round (base = rounds/target × 10). Combined with (1) this makes the leaderboard untrustworthy.
8. `/api/admin-whitelist` role-downgrade and possible default-to-HOD fallback (§3.4); `is_admin` enumeration.
9. Debug logging in production: `console.log("DEBUG URL:", request.url, "|| CODE:", code)` writes the OAuth authorization code to server logs (`app/auth/callback/route.ts:10`); heavy `🔴 DEBUG` logging in `AuthProvider.tsx`.
10. `/api/sync-chanting` mutates state on **GET** (`route.ts:177-179`), called from `leaderboard/page.tsx:48`.
11. No security headers/CSP, no rate limiting, no input validation on API bodies.

### 9.3 Logic bugs
1. **Auto-fulfillment fires for *today* with partial rounds.** `sync-chanting/route.ts:77-79` selects unlogged days with `log_date <= todayStr` (includes today). The counter calls the API after every tap; the moment the first round completes, an `activity_logs` row for today is created with 1 round (≈ 1 point × streak), and from then on today counts as "logged": later rounds update only `user_chanting_logs`, and the student can no longer submit today manually (the modal excludes already-logged dates, `DailyLogModal.tsx:65`). The comment "or today if day ended" (`:58`) is not implemented. This can heavily under-score active chanters and contradicts the UI claim "before the day ends".
2. Auto-fulfill ignores insert errors and still increments totals (`:129-143`); concurrent calls (every tap triggers one) can insert/score the same day twice or hit the UNIQUE constraint while still adding points. No lock/transaction.
3. Manual path also read-modify-write on `users` with stale `userProfile` (`DailyLogModal.tsx:314-321`); editing an existing log re-adds the full points instead of the delta (`:285-321`, mostly unreachable because logged dates are excluded).
4. Hidden `reading_minutes` default (30) saved in every log and shown in the feed (§4.4, §6.2).
5. Logging allowed after `challenge_end_date`; no start-date check either (§4.7).
6. `streak_bonus_multiplier`, `points_per_*`, `log_cutoff_hour`, `freeze_credits_on_join`, `onboarding_fields` (partly) are dead settings; `sync-chanting` passes unused `points_per_* = 1`, `streak_bonus_multiplier: 0.5` (`:120-123`).
7. Award rules disagree between code locations (§7.1); the award modal can't be opened; Awards page confetti on every visit.
8. Admin "Reset All Points" is incomplete (§4.7); "Delete user" (`admin/users/page.tsx:193-201`) deletes only the `users` row (and by cascade their data) but not the `auth.users` account, so they can sign in again; and may be blocked by RLS.
9. Admin dashboard matrix uses log-derived 16-day window, not the competition dates (§4.3). "Completion rate" = users with a log today ÷ all students.
10. Onboarding config vs validation mismatch (§2.2); `isOnboarded` store value only set on initial load.
11. Admin pages `/admin/awards`, `/admin/logs`, `/admin/books`, `/admin/audiobooks` exist but are not linked from the menu (`admin/layout.tsx:60-64`); `/admin/logs` delete doesn't adjust points (it warns in a confirm, `logs/page.tsx:29`).
12. `proxy.ts` makes 1-2 DB round trips per page request (`is_admin` + `is_onboarded`) with no caching.

### 9.4 Hard-coded values / dead code / fragility
- Hard-coded: 26 days, 16 default rounds, 108 beads, 5 pts per quiz answer, tier thresholds, reminder text with production URL, 10-digit mobile rule, streak shield = 1, `+91` prefix in WhatsApp helper (`admin/page.tsx:245-251`).
- Dead / unused: `hooks/useAuth.ts` (no importers), `@supabase/auth-helpers-nextjs` + `@supabase/auth-helpers-react` (deprecated, unused), `NEXT_PUBLIC_APP_URL`, `users.avatar_url` writer, `bonus_points.admin_id`, `checkAwardUnlocks` result, `app/admin/{audiobooks,books,awards,logs}` (not linked), duplicate CMS code between `app/admin/audiobooks` (761 lines) and Settings (1289 lines), `ThemeSwitcher` per-page duplication.
- Many `any` types, no tests, no error boundaries; several pages create their own Supabase browser clients (inconsistent with `lib/supabaseClient.ts`).
- Realtime refetch-everything on any change; `select('*')` on `users` and `activity_logs` for whole-table reads in admin pages (will not scale beyond a few hundred students).
- `.next/` and `tsconfig.tsbuildinfo` present locally (ignored).

---

## 10. OPEN QUESTIONS (need your answer before planning changes)

1. **Live DB truth.** Can you export the live Supabase schema + RLS policies (or let me read `pg_policies`/`information_schema`) so I can reconcile §9.1 and confirm every **[verify live]** item? In particular: is the `admin_emails.role` CHECK still `HOD/FOLK_GUIDE/FOLK_ENABLER`, does `app_settings` have an INSERT policy, and which provider list is enabled in Supabase Auth?
2. **Competition concept.** Should a "competition" become a first-class record (name, type = reading / chanting / combined, start, end, photo, awards, status) with multiple past + one active at a time? Should *all* activity tables get a `competition_id`, and should `users.total_points` become a per-competition total (computed/ledger) instead of a global counter?
3. **Combined reading + chanting.** What is the intended formula? (e.g. rounds + minutes normalised to commitment, weighted? separate leaderboards? caps?) What is the reading unit — in-app timer (books), self-reported minutes, pages? Is the in-app reader staying, or should reading be self-reported like chanting?
4. **Bonus rules per competition.** Should audiobook + quiz be a bonus only for certain competition types, at what rate (currently 5/correct), and capped?
5. **Awards.** For each award: (a) final rule definition (the Awards page rules or the `pointsEngine` rules?), (b) tie handling, (c) should they be generated automatically at end (a "finalize competition" action by the HOD) and stored with winner + date, (d) how should the winner be notified (popup on next login, email, WhatsApp)? Is `jijnasu_scholar` still wanted if quizzes are off?
6. **Role scopes.** Is "Guide = males only" intended (and who guides female students)? Should only the HOD change competition settings/resets/awards? Should Enabler/Guide have read-only vs write access to students?
7. **Time zone.** Is everyone in IST? Should the day boundary/cutoff be fixed to Asia/Kolkata server-side and should `log_cutoff_hour` be implemented?
8. **Late logging & end-of-competition.** Should logging hard-stop at the end date (incl. late-day grace)? Is the "auto-fulfillment" meant to count the *current* day (so partial rounds don't lock the day)?
9. **Registration.** You mentioned *age* — it does not exist today. Do you want age (and college) collected? Should `department` be a controlled list? Is the 10-digit mobile rule right for all students?
10. **Privacy.** Are you OK removing `mobile` from the public `users` read (move to a protected view visible only to admins)?
11. **Reset/archive.** Do you want previous competitions' leaderboards and awards archived and viewable (history page / past winners), rather than wiped?
12. **Hidden features.** Should Books and Podcast stay hidden for the next competition, or be re-enabled (and the API routes disabled while hidden)?
13. **Hosting.** Confirm Vercel + a single Supabase project (prod = dev?). The repo contains no environment separation.
