# Sadhana Competitions — Complete Developer & Operator Guide

> **Read this first.** This is the single source of truth for how this application works, why it is built the way it is, how to run it, and how to change it safely.
> If this guide and any other file disagree (for example the older `README.md`, `AUDIT_REPORT.md` or the early parts of `CHANGES_REPORT.md`), **this guide wins** — it describes the system as it is now.
>
> Last verified against the code at commit `4aa3f76` (migrations through `20261031000700` applied to the live project). This guide was added in the commit right after it.

---

## Table of contents

1. [What this app is](#1-what-this-app-is)
2. [Glossary](#2-glossary)
3. [Quick start (run it locally in 15 minutes)](#3-quick-start)
4. [Architecture](#4-architecture)
5. [Repository map](#5-repository-map)
6. [The domain model — how competitions work](#6-the-domain-model--how-competitions-work)
7. [Scoring in detail (with worked examples)](#7-scoring-in-detail)
8. [Database reference](#8-database-reference)
9. [Security model](#9-security-model)
10. [Roles and permissions](#10-roles-and-permissions)
11. [Backend: API routes and the proxy](#11-backend-api-routes-and-the-proxy)
12. [Frontend: pages, components, state](#12-frontend-pages-components-state)
13. [End-to-end flows](#13-end-to-end-flows)
14. [Competition configuration reference](#14-competition-configuration-reference)
15. [Migrations: history and how to add one](#15-migrations-history-and-how-to-add-one)
16. [Testing](#16-testing)
17. [Deployment and operations](#17-deployment-and-operations)
18. [Cookbook: "How do I change…?"](#18-cookbook-how-do-i-change)
19. [Troubleshooting](#19-troubleshooting)
20. [Design decisions and the reasons behind them](#20-design-decisions-and-the-reasons-behind-them)
21. [Known limitations and legacy leftovers](#21-known-limitations-and-legacy-leftovers)
22. [Appendices](#22-appendices)

---

## 1. What this app is

**Sadhana Competitions** is a mobile-first web app for the FOLK spiritual program of a college. A HOD (head) creates time-boxed **competitions**; students sign in with Google, set a **daily commitment**, **log** what they did each day, and compete on a **live leaderboard**. After a competition ends the HOD **finalizes** the results and **awards** are given to winners, who see a celebratory popup.

A competition can be one of three **types**:

| Type | What students log every day | Commitment they must set (once, at the first log) |
|---|---|---|
| **Chanting** | rounds of japa (mantra chanting) | rounds per day, **1–16** |
| **Reading** | minutes of book reading | minutes per day, **1–60** |
| **Both** | rounds **and** minutes | **both**, together |

Any type can also switch **Bonus** on: students can earn extra points by listening to audiobooks and passing a quiz (graded on the server), and the HOD can give manual bonus points.

**Hard rules of the product** (everything else follows from these):

1. **The leaderboard is fed only by the daily log** (what the student *submits*), plus the **quiz bonus** and the **HOD's manual bonus**. The app never measures reading time, and the Japa counter never creates points — it only pre-fills the log form.
2. **All points are written by the database** (server-side functions). The browser can never write points, streaks, totals, awards or quiz scores.
3. **Time zone is Asia/Kolkata (IST) everywhere.** A competition runs from 00:00 IST on its start date to 23:59:59 IST on its end date.
4. **Only the HOD can write.** Guides and Enablers are view-only (restricted to their gender scope).
5. **One competition is open at a time.** Competitions that are published cannot overlap in dates.

Tech stack: **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4**, **Supabase** (Postgres + Row Level Security + Google OAuth + Realtime + Storage), hosted on **Vercel**.

> ⚠️ **Next.js 16 differs from older versions.** The route gate is `proxy.ts` (formerly `middleware.ts`). Before writing Next-specific code, read the bundled docs in `node_modules/next/dist/docs/` (this is also required by `AGENTS.md`).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Sadhana** | Daily spiritual practice. |
| **Japa / round** | Chanting the Hare Krishna mantra. 1 **round = 108 beads** (the counter page counts beads). |
| **FOLK** | The student spiritual program that runs this app. |
| **HOD** | "Folk HOD": the admin with full control. The only role that can write. |
| **Guide / Enabler** | View-only admins (`FOLK_GUIDE`, `FOLK_ENABLER_MALE`, `FOLK_ENABLER_FEMALE`). |
| **Student** | Any signed-in Google user whose email is **not** in `admin_emails`. |
| **Competition** | A time-boxed event: title, type, dates, scoring config, awards. |
| **Commitment** | The daily target a student promises: rounds (≤16) and/or minutes (≤60). Fixed at first log, can only be **raised**. |
| **Log / log activity** | The one daily submission (rounds and/or minutes) that earns points. |
| **Streak** | Consecutive days with a submitted log. Multiplies the day's points (capped). |
| **Shield** | Lets a streak survive exactly **one** missed day (default 1 per competition). |
| **Bonus** | Quiz points (+ HOD manual points). Only when `bonus_enabled`. |
| **Ledger** | `points_ledger` — the single source of truth for points. |
| **Totals** | `competition_totals` — per student per competition sums, always rebuildable from the logs and ledger. |
| **Finalize** | HOD action after the end date: freezes standings and writes winners (`user_awards`). |
| **IST** | Asia/Kolkata (UTC+05:30). |
| **RPC** | A Postgres function called from the browser/server through Supabase (`supabase.rpc('name', args)`). |
| **RLS** | Row Level Security — Postgres policies deciding which rows a user can read/write. |
| **Service role** | The Supabase secret key that bypasses RLS. **Server only, never in the browser.** |

---

## 3. Quick start

### 3.1 Prerequisites

* Node.js 20+ (developed on 24), npm.
* A Supabase project (free tier is fine) and a Google Cloud OAuth client.
* (Deploy) a Vercel account connected to the GitHub repo.

### 3.2 Clone and install

```bash
git clone https://github.com/KaushalPawar14/sadhana-challenge
cd sadhana-challenge
npm install            # .npmrc sets legacy-peer-deps=true (needed for some peer conflicts)
```

### 3.3 Environment variables

Create `.env.local` in the project root (it is git-ignored — **never commit it**):

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL (Supabase → Project Settings → API). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | The public `anon` key. Safe in the browser because RLS protects data. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS. Used by API routes, `proxy.ts` (to sign its cookie) and the scripts. Never expose it. |
| `NEXT_PUBLIC_APP_URL` | nothing | Present in the old `.env.local`; **not read by any code**. Safe to omit. |

Set the same three variables in **Vercel → Project → Settings → Environment Variables**.

### 3.4 Set up a fresh Supabase project

1. **Create the schema:** open Supabase → SQL Editor → paste the entire [`schema.sql`](schema.sql) → Run. (It builds all tables, functions and policies. A test proves it works from an empty database: `node scripts/db-tests/check-schema.mjs`.)
2. **Google sign-in:** Supabase → Authentication → Providers → enable **Google** with your OAuth client ID/secret. In Google Cloud add the Supabase callback URL shown there as an authorized redirect URI.
3. **Redirect URLs:** Supabase → Authentication → URL Configuration → set **Site URL** to your production URL and add `http://localhost:3000/**` and your Vercel URL(s) to **Redirect URLs**. (The app sends users to `<origin>/auth/callback`.)
4. **Storage:** create public buckets named `avatars` (used for competition cover photos) and, optionally, `public` (fallback). Allow authenticated uploads in their storage policies.
5. **Create the first HOD** (there is no seed). After the HOD has signed in once with Google, run:
   ```sql
   insert into public.admin_emails (email, role) values ('hod@example.com', 'HOD');
   ```
   (Emails are matched case-insensitively. Admins never get a `users` row — they are not students.)

### 3.5 Run

```bash
npm run dev          # http://localhost:3000
npm run build        # production build (must pass before you push)
npm run lint         # 0 errors expected (≈100 style warnings are known and tolerated)
npm run test:db      # database scenario tests (see §16)
```

### 3.6 Useful commands

| Command | Purpose |
|---|---|
| `npm run db:backup` | Read-only export of the live DB (tables + auth users) to `backups/<timestamp>/` (git-ignored, contains personal data). |
| `npm run schema:build` | Regenerate `schema.sql` from the base tables + migrations. Run after adding a migration. |
| `npm run test:db` | Run the PGlite scenario suite. |
| `node scripts/apply-migrations.mjs --yes [file.sql …]` | Apply migrations to the live project via the Supabase Management API (needs `SUPABASE_ACCESS_TOKEN`). |

---

## 4. Architecture

### 4.1 The big idea

> **The database is the authority.** The browser asks; Postgres decides.

```
┌────────────────────────┐        ┌──────────────────────────┐
│  Browser (React 19)    │        │  Vercel (Next.js 16)     │
│  pages + components    │        │  proxy.ts  (route gate)  │
│  zustand auth store    │──────▶ │  app/api/*  (thin APIs)  │
│  supabase-js (anon key)│        │  uses service role ONLY  │
└──────────┬─────────────┘        │  where unavoidable       │
           │ supabase.rpc / selects└──────────┬───────────────┘
           ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase                                                   │
│  • Auth (Google OAuth)         • Realtime (activity_feed)   │
│  • Postgres                    • Storage (cover photos)     │
│     - tables + RLS policies                                 │
│     - SECURITY DEFINER functions (the real business logic)  │
└─────────────────────────────────────────────────────────────┘
```

* **Reads:** most pages call RPC read-models (`get_leaderboard`, `get_my_state`, …) that return only public/allowed columns, or select from tables that RLS already restricts.
* **Writes:** students write only through RPCs (`log_activity`, `set_commitment`, `submit_quiz`, …). Those functions derive the user from the JWT (`auth.uid()`), validate everything, and write the activity row **and** the ledger/totals in one transaction.
* **HOD writes** are also RPCs (`save_competition`, `finalize_competition`, `give_bonus`, …) that re-check `is_hod()` inside; RLS additionally allows HOD-only writes on content tables (books, audiobooks, quiz rows, settings).
* **API routes** exist only where a server is needed: onboarding validation, admin whitelist, admin user edit, admin e-mails (from `auth.users`), the book proxy, and the Japa counter sync.

### 4.2 Request life cycle

1. Browser requests a page → `proxy.ts` runs for (almost) every request: verifies the session with Supabase Auth, resolves **role** and **onboarded** flag (cached 5 minutes in a signed `sadhana_ctx` cookie), and redirects:
   * signed-out → `/` (login),
   * student not onboarded → `/onboarding`,
   * non-admin on `/admin/*` → `/leaderboard`,
   * signed-in visiting `/` → `/admin` or `/leaderboard`.
2. The page (client component) loads data with `supabase.rpc(...)` using the **anon key + the user's JWT**; Postgres evaluates RLS/function checks as that user.
3. Mutations call an RPC. Errors raised by the database are plain strings like `ALREADY_LOGGED`; `lib/errors.ts → friendlyError()` turns them into friendly messages (see [Appendix A](#appendix-a-error-codes)).

### 4.3 Time

* One clock: SQL `app_now()` (= `now()` in production; tests override it) and `ist_today()` = `(app_now() at time zone 'Asia/Kolkata')::date`.
* TypeScript mirror: `lib/ist.ts` (`istToday()`, `istDateOf()`, `addDays()`, `diffDays()`, `dateRange()`, `formatDMY()`, `formatLong()`, `formatShort()`).
* **Never use `new Date().toISOString().slice(0,10)` or `toLocaleDateString` for "today"** — those use UTC or the device zone and break the IST day boundary (00:00–05:30 IST).

### 4.4 Realtime

The leaderboard subscribes to `INSERT`s on `activity_feed` (`filter: competition_id=eq.<id>`). Each feed row carries a `delta` (`chanting`, `reading`, `bonus`, `total`) so the client patches the board **incrementally** instead of refetching. A full refetch still happens every ~60 s and whenever a delta is missing.

---

## 5. Repository map

```
.
├─ GUIDE.md                  ← this file
├─ README.md                 older marketing-style readme (partly outdated; see banner)
├─ AGENTS.md / CLAUDE.md     rule for AI agents: read node_modules/next/dist/docs/ first
├─ AUDIT_REPORT.md           audit of the ORIGINAL app (historical)
├─ CHANGES_REPORT.md         what was changed, decisions, test results (+ addenda §9–§11)
├─ schema.sql                GENERATED full schema (do not edit by hand → npm run schema:build)
├─ proxy.ts                  Next 16 route gate (auth, role, onboarding, cached ctx cookie)
├─ package.json / .npmrc / next.config.ts / eslint.config.mjs / tsconfig.json
│
├─ app/                      Next.js App Router
│  ├─ layout.tsx             root layout: AuthProvider + ClientLayout + toaster
│  ├─ page.tsx               login (Google button)
│  ├─ onboarding/            registration form
│  ├─ leaderboard/           main student screen
│  ├─ chanting/              Japa (108-bead) counter
│  ├─ books/                 library + DOCX/PDF reader (no tracking)
│  ├─ podcast/               audiobooks + quizzes (bonus)
│  ├─ profile/               student hub: stats, commitments, award history
│  ├─ awards/                awards for a competition
│  ├─ auth/callback/         OAuth code exchange (route handler)
│  ├─ auth/auth-code-error/  error page
│  ├─ admin/                 admin console (layout, dashboard, competitions/*, users, logs, awards, settings)
│  │   └─ _shared.tsx        helpers shared by admin pages (not a route)
│  └─ api/                   route handlers (see §11)
│
├─ components/
│  ├─ AuthProvider.tsx       loads user + role + onboarded into the store
│  ├─ ClientLayout.tsx       navbar + theme + mounts AwardPopup
│  ├─ Navbar.tsx             feature-aware navigation (Books/Podcast/Chanting appear only when allowed)
│  ├─ ThemeSwitcher.tsx
│  ├─ student/               DailyLogModal, CommitmentForm, AwardPopup, UserProfileModal,
│  │                         ConsistencyHeatmap, AwardIcons (Lottie/image), AvatarTiers
│  └─ ui/                    Button, Card
│
├─ lib/
│  ├─ competition.ts         types, DEFAULT_CONFIG, status helpers, buildRulesText, validation
│  ├─ pointsEngine.ts        pure scoring helpers (mirror of the SQL; used for previews/tests)
│  ├─ ist.ts                 IST date helpers
│  ├─ errors.ts              error-code → message mapping
│  ├─ supabaseClient.ts      browser Supabase singleton
│  └─ supabase/server.ts     server clients + getCaller() (user + admin role)
├─ hooks/useActiveCompetition.ts   loads get_active_competition (+ feature flags)
├─ store/authStore.ts        zustand: user, adminRole, isAdmin, isHod, isOnboarded, signOut
│
├─ supabase/migrations/      ordered SQL migrations (see §15)
├─ scripts/
│  ├─ backup-live.mjs        export live data (REST) → backups/
│  ├─ apply-migrations.mjs   apply migrations to live (Management API)
│  ├─ build-schema.mjs       regenerate schema.sql
│  └─ db-tests/              PGlite harness + the scenario suite (run.mjs)
├─ public/                   animations (Lottie), avatars, level images
├─ backups/   (git-ignored)  data exports — contain phone numbers/e-mails!
└─ scratch/   (git-ignored)  local one-off scripts (never committed)
```

---

## 6. The domain model — how competitions work

### 6.1 Competition lifecycle

A competition has an **explicit stored status** (`draft`, `published`, `archived`, `finalized`) and a **derived display status** computed from the dates:

```
draft ──publish──▶ published ──(dates)──▶ scheduled → active → ended ──finalize──▶ finalized
   ▲                    │                                              │
   └──(only if no data)─┘            archive/unarchive (hide from students)
                                     delete (HOD, typed title, removes all data)
```

| Display status | Meaning |
|---|---|
| `draft` | HOD is still editing; invisible to students. May overlap other competitions. |
| `scheduled` | published, start date in the future. |
| `active` | published, today (IST) between start and end (inclusive). |
| `ended` | published, end date passed, **not finalized yet**. Awaiting the HOD's Finalize. |
| `finalized` | results frozen, winners stored. Nothing can change anymore. |
| `archived` | hidden from students; data kept; can be un-archived (re-published, which re-checks overlap). |

Rules enforced in the database (`save_competition`, `set_competition_status`):

* `end_date ≥ start_date`.
* **No overlap** with any other `published`/`finalized` competition (drafts may overlap but cannot be published while they do).
* A competition that already has activity cannot go back to `draft`.
* A finalized competition cannot be edited (only archived or deleted).
* Editing a **started** published competition (type, bonus flag, config or dates) triggers `rebuild_competition_totals` so every student's totals match the new rules.

### 6.2 What "open" and "active" mean

| Function | True when |
|---|---|
| `active_competition()` | published and `start ≤ today ≤ end` (IST). Used for books/podcast/quiz/listening. |
| `open_competition()` | published and `start ≤ today ≤ end + late_log_days`. Used for logging/commitments, so the **last day can still be submitted the next day** (default grace = 1 day). |

### 6.3 Students and onboarding

* Sign in with **Google only** (Supabase Auth). The callback creates a `users` row (`full_name` from Google) and sends the student to `/onboarding`.
* Onboarding collects: **full name, mobile (10 digits), gender (M/F), age (10–100), department**. Gender and age are always required; the HOD may hide name/mobile/department through `app_settings.onboarding_fields`.
* Saved by `POST /api/onboarding` (validated server-side). Students can later edit only `full_name, mobile, gender, department, age, avatar_url` of their own row (column privileges).

### 6.4 Commitments (mandatory, per competition)

* Required **before the first log** of every competition, for each part the type needs. For **Both**, both numbers must be supplied together (neither alone is accepted).
* Limits: **rounds 1–16**, **minutes 1–60**. Enforced in `set_commitment` (database) and in `CommitmentForm` (UI).
* **Raise-only:** a commitment can be increased later (Profile page) but never lowered by the student. The HOD can correct it (`hod_set_commitment`, API `update-user`).
* Each log stores a **snapshot** of the commitment in force that day (`activity_logs.commitment_rounds`, `reading_commitment_minutes`) so raising it later does not re-score past days.
* Where the form appears: first time the student opens **Log Activity** (leaderboard) in a competition; also editable on **Profile**.

### 6.5 Daily logging

* One log per student per day per competition (`unique (competition_id, user_id, log_date)`).
* **Chanting**: `rounds` 0–300. **Reading**: `minutes` 0–600. (Hard sanity caps; the commitment limits are 16/60.)
* Allowed dates: inside the competition window, not in the future, and not older than `late_log_days` (default **1**: today and yesterday).
* A day without a submitted log simply has no points and breaks the streak.
* The UI shows only the fields the competition type needs. The **Japa counter** value for today is pre-filled into the rounds field.

### 6.6 Bonus

* Only when the competition has `bonus_enabled`.
* **Quiz bonus (in-app, server-controlled):** the student listens to an audiobook (listening progress is credited by the **server clock** through heartbeats), reaching `listen_threshold_pct` of the duration unlocks the quiz; questions are fetched **without answers**; the whole quiz is graded in `submit_quiz`; one attempt per audiobook per competition; points = correct × `quiz_points_per_correct`, optionally capped by `max_quiz_bonus`.
* **Manual bonus (HOD):** `give_bonus(user, points, title)`; positive → `manual_bonus`, negative → `adjustment`; |points| ≤ 10 000; requires an open competition with bonus on.
* On the leaderboard a **Bonuses** button (beside *Log Activity*) opens the audiobooks page whenever the open competition has bonus on.

### 6.7 Leaderboard

* Source: RPC `get_leaderboard(competition_id)` — public columns only (name, avatar, gender, department, points, streaks). **Phone numbers are never returned.**
* Order: total points ↓, then who reached the score **earliest** (`reached_at`), then name.
* Columns follow the competition: **Chanting** (if included), **Reading** (if included), **Bonus** (if bonus is on or anyone has bonus points) and **Total**. A single part without bonus shows only the total.
* Finalized competitions are served from the **frozen snapshot** (`competition_final_standings`).
* Guides/Enablers see only their gender scope (enforced in the function).
* The page also shows: title, type, dates, day *N of M*, days left, cover photo, "x of N participants logged today", a rules modal generated from the config, and a **live activity feed**.

### 6.8 Live activity feed

`activity_feed` rows are written **only by server functions** (`emit_feed`) when something real happens: a log is submitted, a quiz is passed, a listen is completed, a manual bonus is given, or an award unlocks. Rows hold public-safe columns plus a `delta`. Award events have `visible_from = unlock_date`, so they appear only when the award unlocks.

### 6.9 Awards

* Defined **per competition** in `competition_awards` (one canonical definition — there are no other copies). New competitions are seeded with defaults: *Rising Sadhaka* (highest total), *Unbroken Flame* (longest streak), *Mahayogi Crown* (highest single day), and, if bonus is on, *Active Entity* (most bonus) and *Jijnasu Scholar* (most quiz bonus). All editable by the HOD.
* Criteria: `highest_total`, `highest_chanting`, `highest_reading`, `longest_streak`, `highest_single_day`, `most_quiz_bonus`, `highest_bonus`, `top_n_total` (with N), `manual`. Each has a `gender_scope` (`all`/`M`/`F`) and an `unlock_date` (default = end date + 1).
* **Before finalization** students see each award with its unlock date and the **current leader(s)**, clearly marked *provisional*.
* **Finalize** (HOD, only after the end date): review screen shows the suggested winners per award (**ties listed together**; tie-break = earliest to reach the score, then best streak). The HOD can accept, **swap** a student, add a **custom message**, or leave an award unassigned. Confirming writes `user_awards`, freezes the standings and sets status `finalized`. Nothing can change afterwards.
* **Popup:** on every page load the app calls `get_pending_award_popups` — awards whose `unlock_date ≤ today (IST)`, not revoked, not yet seen. One celebratory modal per award (confetti, image, message); dismissing calls `mark_award_seen` so it never repeats.
* Before the unlock date the winner sees "You've won X — unlocks on <date>" on the Awards page, but no popup.
* **Award History** (Profile) lists every award across competitions, permanently.
* **Revoke** is soft (`revoked_at`). **Manual grant** (HOD) is available from the admin Users page.

### 6.10 Content (CMS)

* **Books** (`books`: title, language Hindi/English/Gujarati, link) and **Audiobooks** (`audiobooks`: category F2/F4/F8/F12/F16, language, URL, duration, plus questions) are managed in **Admin → Settings & CMS** (HOD only).
* Visibility is gated by the competition: books table is readable by students only when the active competition includes reading **or** bonus; audiobooks/quiz tables only when bonus is on. The Navbar entries and the pages follow the same flags (`get_active_competition().features`).
* Books are a **library only** (DOCX rendered with `mammoth` via `/api/fetch-book`, PDF via an embed). Reading is **not measured**.

---

## 7. Scoring in detail

All scoring is computed by **`recompute_user(competition, user)`** in Postgres (migration `000700`). It re-derives everything for one student from the **log rows** and the **bonus ledger rows**, so it is idempotent and rebuildable. `lib/pointsEngine.ts` mirrors it for previews/tests only.

### 7.1 Per-day points

For each log (ordered by date):

```
streak     = consecutive-day counter (see 7.2)
multiplier = streak_multiplier_enabled ? min(streak, streak_multiplier_cap) : 1

chanting_base   = round( rounds  / commitment_rounds   × chanting_points_at_commitment )   // default ×10
reading_base    = round( minutes / commitment_minutes  × reading_points_at_commitment )    // default ×10

chanting_points = chanting_base × multiplier       (only for types chanting/both)
reading_points  = reading_base  × multiplier       (only for types reading/both)
```

* Not capped at 100 %: chanting 32 rounds on a 16-round commitment = base 20.
* Commitment is the **snapshot stored on the log**.

### 7.2 Streak and shield

Walking the logs in date order: previous day → `streak + 1`; a gap of exactly **2 days** (one missed day) while a **shield** remains → `streak + 1` and the shield is consumed; anything else → streak resets to 1. `shield_count` (default 1) is per competition. `best_streak` is the maximum reached.

### 7.3 Totals

```
total = chanting_total × w_chanting + reading_total × w_reading + bonus_total
```

* Weights apply **only for type Both** (defaults 1/1). For single-type competitions the weight is 1.
* `bonus_total` = sum of `quiz_bonus` + `manual_bonus` + `adjustment` ledger rows.
* `reached_at` = timestamp of the latest positive ledger row (used as the tie-break "earliest to reach the score").

### 7.4 Worked examples (these are asserted by the test suite)

| Scenario | Calculation | Result |
|---|---|---|
| Reading, commitment 60 min, logs 30 min on day 1 | round(30/60×10)=5 × streak 1 | **5** |
| …then 60 min on day 2 | round(60/60×10)=10 × streak 2 | **+20 → 25** |
| Chanting, commit 10, rounds 10 on days 1–3, cap 2 | 10×1, 10×2, 10×min(3,2) | **10, 20, 20 → 50** |
| Both, weights 1/2, 16/16 rounds, 15 of 30 min, +7 manual bonus | 10×1 + 5×2 + 7 | **27** |
| Quiz 1/2 correct, 5 pts each | 1×5 | **+5 bonus** |

### 7.5 The ledger and rebuilding

* `points_ledger` rows: `source` ∈ `chanting | reading | quiz_bonus | manual_bonus | adjustment`, `points` (can be negative), `activity_date`, `reference_id`, `meta` (rounds/minutes/commitment/base/multiplier/streak), `note`.
* `chanting` and `reading` rows are **unique per day** (so recomputing never double-counts); they are upserted/deleted to match the logs.
* `rebuild_competition_totals(comp)` recomputes every affected student (HOD or direct DB access). Use it after changing scoring config, or to repair data.
* After finalization `recompute_user` and rebuild raise `COMPETITION_FINALIZED` — results cannot drift.

### 7.6 Migrated "Competition 1"

The competition that existed before this system was migrated from `app_settings` with `config.use_logged_points = true`: its **historical per-day points are kept exactly as logged** (the old formula changed several times while it ran). Rebuilds keep those values. Untick the option in the competition form to re-score it with the current rules.

---

## 8. Database reference

All objects live in schema `public`. The authoritative DDL is `schema.sql` (generated) and `supabase/migrations/`.

### 8.1 Tables

| Table | Purpose | Key columns / notes |
|---|---|---|
| `admin_emails` | Admin whitelist | `email` (unique, case-insensitive), `role` ∈ HOD / FOLK_GUIDE / FOLK_ENABLER_MALE / FOLK_ENABLER_FEMALE. Service-role only (no client policy). |
| `users` | Student profile | `id` = auth user id, `full_name, mobile, gender (M/F), department, age, avatar_url, is_onboarded`. `total_points` = **derived lifetime** value (maintained by the DB). Legacy, no longer maintained: `streak_count, best_streak, last_log_date, freeze_credits, target_chanting/reading/hearing`. |
| `competitions` | The competition | `title, description, cover_photo_url, type, bonus_enabled, start_date, end_date, stored_status, config (jsonb), created_by, finalized_at…` |
| `competition_participants` | Commitments | PK (competition, user): `commitment_rounds` (1–16), `reading_commitment_minutes` (1–60). |
| `activity_logs` | **The daily log** | `competition_id, user_id, log_date, chanting_rounds, reading_minutes, commitment_rounds, reading_commitment_minutes, is_late_submission, source, submitted_at`; `points_earned` is a derived copy. Unique per (competition, user, date). |
| `points_ledger` | Single source of truth for points | see §7.5 |
| `competition_totals` | Per student sums | `chanting_points, reading_points, bonus_points, total, current_streak, best_streak, shields_left, last_log_date, reached_at` |
| `competition_final_standings` | Frozen results | written by `finalize_competition`: rank, totals, name, department, gender |
| `competition_awards` | Award definitions | `award_key, name, description, icon_key, image_url, criterion, top_n, gender_scope, unlock_date, sort_order` |
| `user_awards` | Winners (history) | `rank, score_at_finalization, unlock_date, custom_message, granted_by, seen_at, revoked_at`; unique (award, user) |
| `activity_feed` | Public live feed | kind, user display columns, `detail`, `delta`, `streak`, `visible_from` |
| `user_chanting_logs` | Japa counter value per day | pre-fills the log form only; never scores |
| `books` / `audiobooks` | Content | audiobooks have `category, language, audio_url, duration_seconds` |
| `quiz_questions` | Questions + 4 options | **no answers here** |
| `quiz_answers` | Correct answers | HOD-only table; students can never read it |
| `user_audiobook_progress` | Listening progress | per (competition, user, audiobook): `listened_seconds, duration_reported, is_completed` |
| `quiz_submissions` | One attempt per audiobook per competition | `score, max_score, points_earned, answers` (chosen + right/wrong flags, no correct text) |
| `bonus_points` | Audit of manual bonuses | `admin_id` is **not** a FK (admins aren't in `users`) |
| `app_settings` | Generic key/value | only `onboarding_fields` is still used |
| `reading_sessions` | **Legacy**, history only | old reader timer rows; no longer used for scoring |
| `awards_legacy` | **Legacy** (was empty) | read-only for admins |
| `migration_report_competition1`, `migration_flags_competition1` | Output of the one-off data migration | service/SQL only |

### 8.2 Functions (RPC reference)

Student-callable functions derive the user from `auth.uid()`; HOD functions call `assert_hod()` first. "Who" = who may execute (`authenticated` grant) — *every* function re-checks inside.

| Function | Who | What it does |
|---|---|---|
| `get_active_competition()` | any signed-in | Open competition + next/last + `features` {books, podcast, chanting, reading}. |
| `list_competitions()` | any (admins see drafts) | All visible competitions as JSON. |
| `get_leaderboard(comp)` | any | Ranked rows (public columns; gender-scoped for guides/enablers; snapshot if finalized). |
| `get_competition_stats(comp)` | any | `{participants, active_today}`. |
| `get_my_state()` | student | Commitments, `required` flags, loggable dates, counter value, totals. |
| `get_public_profile(user, comp)` | any | Name/department/gender, totals, daily points, unlocked awards. **No phone number.** |
| `set_commitment(rounds, minutes)` | student | Mandatory commitment (limits, raise-only, both-together for Both). |
| `log_activity(date, rounds, minutes)` | student | **The daily log.** Validates, stores, recomputes, emits feed. |
| `sync_chanting(rounds)` | student | Records the Japa counter (max 300, never decreases). Never creates logs/points. |
| `start_listening(audiobook, duration)` / `listening_heartbeat(audiobook)` | student | Server-clock listening credit; completion unlocks the quiz. |
| `get_quiz(audiobook)` / `submit_quiz(audiobook, answers)` | student | Questions without answers / server grading + ledger + feed. |
| `get_awards_view(comp)` | any | Awards with provisional leaders or final winners + "mine". |
| `get_my_awards()` | student | Award history. |
| `get_pending_award_popups()` / `mark_award_seen(id)` | student | Popup queue. |
| `list_departments()` | student | Department suggestions for onboarding. |
| `save_competition(json)` | **HOD** | Create/update (validates, overlap, seeds default awards, rebuilds when needed). |
| `set_competition_status(id, status)` | **HOD** | draft/published/archived. |
| `delete_competition_draft(id)` | **HOD** | Delete an empty draft. |
| `delete_competition(id, typed_title)` | **HOD** | Delete **any** competition and all its data; needs the exact title. |
| `save_competition_awards(comp, json)` | **HOD** | Replace the award list. |
| `rebuild_competition_totals(comp)` | **HOD** | Recompute everyone. |
| `suggest_award_winners(comp)` | any admin | Suggested winners per award. |
| `finalize_competition(comp, assignments)` | **HOD** | Freeze standings + write winners. |
| `grant_award(user, award, message)` / `revoke_award(id)` | **HOD** | Manual grant / soft revoke. |
| `give_bonus(user, points, title)` | **HOD** | Atomic manual bonus into the ledger. |
| `hod_set_commitment(comp, user, rounds, minutes)` | **HOD** | Correct a student's commitment. |
| `hod_save_audiobook(json)` / `hod_set_audiobook_duration(id, s)` | **HOD** | Atomic audiobook + questions + answers; durations. |

Internal helpers (not callable from the API): `recompute_user`, `emit_feed`, `award_candidates`, `competition_json`, `seed_default_awards`, `listen_required_seconds`, `assert_hod`, `assert_hod_or_system`, `is_system_context`, `open_competition`, `active_competition`, `competition_status`. Policy helpers callable by clients: `current_admin_role`, `is_hod`, `is_any_admin`, `is_admin(text)` (argument ignored — kept only for backward compatibility), `admin_can_see_user`, `feature_enabled`, `ist_today`, `ist_date_of`, `app_now`, `comp_cfg`.

### 8.3 Direct database access vs. SQL editor

`is_system_context()` is true when no JWT claims are present (a direct database connection such as migrations; the Supabase SQL editor normally behaves this way). `assert_hod_or_system()` allows those, so `select rebuild_competition_totals('<id>');` normally works from the SQL editor. If it answers `FORBIDDEN`, use the **Rebuild totals** button on *Admin → Competitions* instead (signed in as HOD). Other HOD functions use `is_hod()` and therefore always need a signed-in HOD.

---

## 9. Security model

Defense in depth — each layer assumes the one above can be bypassed.

1. **Row Level Security on every table.** All pre-existing policies were dropped and recreated in migration `000300`. API roles (`anon`, `authenticated`) have **no** INSERT/UPDATE/DELETE on scoring tables.
2. **Column privileges on `users`:** students may `UPDATE` only `full_name, mobile, gender, department, age, avatar_url` of **their own** row. Points, streaks, commitments, onboarding flag are not writable.
3. **Students read only their own row** of `users`. Everyone else's data reaches them only through RPCs that return public columns (so phone numbers are never exposed).
4. **Gender scope for Guides/Enablers is enforced by RLS/functions** via `admin_can_see_user()` — not in the UI.
5. **HOD-only writes** are enforced in the database (RPCs call `assert_hod()`; content tables have HOD-only write policies) **and** in API routes.
6. **Quiz answers** live in `quiz_answers` (HOD-only). `quiz_questions` has no answer column. Grading happens in `submit_quiz`; the review returns only right/wrong flags.
7. **Function privileges:** `EXECUTE` revoked from `PUBLIC/anon/authenticated` on all functions, then granted selectively (see end of `000300` and each migration's `grant`). Anonymous callers get `permission denied`.
8. **`is_admin(email)` no longer discloses anything:** it ignores its argument and answers for the caller.
9. **`fetch-book` proxy** (SSRF-hardened): signed-in only; allowed only while the active competition uses Books (admins always); https only; host allow-list (Dropbox, Google Drive/googleusercontent, the Supabase host, hosts found in `books`); private/loopback/link-local IPs refused on every redirect hop; 25 MB and 20 s limits.
10. **`proxy.ts` cookie `sadhana_ctx`:** HMAC-signed with the service-role key, httpOnly, 5-minute TTL. It only caches *routing* info; every API/DB call re-checks the real role.
11. **Secrets:** `.env*`, `backups/`, `scratch/` are git-ignored. Never log OAuth codes or keys (the old debug logging was removed).

**Security checklist before every release:** no new table without RLS + explicit grants; no new function without `revoke … grant …`; no client-side points/awards writes; no `select *` of `users` for non-admins; run `npm run test:db` (scenario 7 attacks the API as a student).

---

## 10. Roles and permissions

| Capability | Student | Guide / Enabler | HOD |
|---|:--:|:--:|:--:|
| Sign in, onboard, edit own safe profile fields | ✅ | — | — |
| Set commitment (raise only), log activity, listen/quiz | ✅ | — | — |
| See leaderboard, feed, awards, public profiles | ✅ | ✅ (own gender scope) | ✅ all |
| See all students, logs, ledger, totals | — | ✅ (own gender scope) | ✅ |
| See phone numbers / e-mails | — | ✅ (scope) | ✅ |
| Create / edit / publish / finalize / archive / **delete** competitions | — | ❌ | ✅ |
| Give bonus, grant/revoke awards | — | ❌ | ✅ |
| Edit students (name, gender, commitment…) | — | ❌ | ✅ |
| Manage books, audiobooks, quizzes, settings | — | ❌ | ✅ |
| Manage the admin whitelist | — | ❌ (view only) | ✅ |

**Gender scope:** `FOLK_GUIDE` and `FOLK_ENABLER_MALE` → male students; `FOLK_ENABLER_FEMALE` → female students; `HOD` → everyone. (Students with no gender are visible to the HOD only.)

**Whitelist rules** (`/api/admin-whitelist`, HOD-only writes): valid email, explicit valid role (no silent default), unique case-insensitive, cannot demote or remove the **last HOD**.

---

## 11. Backend: API routes and the proxy

All routes use the cookie session. Unauthenticated `/api/*` returns `401 {"error":"Unauthorized"}` from the proxy.

| Route | Method | Who | Body → Response |
|---|---|---|---|
| `/api/onboarding` | POST | student | `{full_name?, mobile?, gender, department?, age}` → `{success}`. Validates (mobile = 10 digits, age 10–100, hidden fields not required). Uses service role to upsert `users` + `is_onboarded`. |
| `/api/sync-chanting` | POST only | student | `{roundsChanted?}` → `{success, active, todayRounds, autoFulfilledDates: []}`. Calls `sync_chanting` as the user. **GET never mutates.** |
| `/api/admin-whitelist` | GET / POST / PUT / DELETE | admins read; **HOD** writes | list `{admins, currentUserRole, currentUserEmail}`; POST `{email, role}`; PUT `{id, role}`; DELETE `?id=`. |
| `/api/admin/update-user` | POST | **HOD** | `{userId, full_name?, mobile?, gender?, department?, age?}` or `{userId, commitment:{competitionId, rounds?, minutes?}}`. Whitelisted columns only. |
| `/api/admin/user-emails` | GET | any admin | `{emails:{userId:email}}` (scoped to the caller's visible students; reads `auth.users` with the service role). |
| `/api/fetch-book` | GET `?url=` | signed-in | proxies a book file (see §9.9). |
| `/auth/callback` | GET | OAuth redirect | exchanges the code, creates the `users` row, redirects (admin → `/admin`, new student → `/onboarding`, else `/leaderboard`). |

### `proxy.ts` decision table

| Condition | Result |
|---|---|
| `/auth/*` | pass |
| signed out, path `/` | pass (login page) |
| signed out, `/api/*` | `401` JSON |
| signed out, anything else | redirect `/` |
| signed in on `/` | redirect `/admin` (admin) · `/leaderboard` (onboarded) · `/onboarding` |
| `/admin*` and not admin | redirect `/leaderboard` |
| student not onboarded, page ≠ `/onboarding` | redirect `/onboarding` |
| onboarded student or admin on `/onboarding` | redirect away |

Static assets (`_next`, images, lottie, mp3…) are excluded by the `matcher`.

---

## 12. Frontend: pages, components, state

### 12.1 Student pages

| Route | File | Purpose | Data |
|---|---|---|---|
| `/` | `app/page.tsx` | Google login | — |
| `/onboarding` | `app/onboarding/page.tsx` | Registration | `list_departments`, `POST /api/onboarding` |
| `/leaderboard` | `app/leaderboard/page.tsx` | Standings, feed, rules, **Log Activity**, **Bonuses** | `get_active_competition`, `list_competitions`, `get_leaderboard`, `get_competition_stats`, `get_my_state`, `activity_feed` (+ Realtime), `get_awards_view` (finalized) |
| `/chanting` | `app/chanting/page.tsx` | 108-bead counter (pre-fills the log) | `POST /api/sync-chanting`; localStorage per IST day |
| `/books` | `app/books/page.tsx` | Library + reader (**no tracking**) | `books`, `/api/fetch-book` |
| `/podcast` | `app/podcast/page.tsx` | Audiobooks, listening, quizzes (**bonus**) | `audiobooks`, `start_listening`, `listening_heartbeat`, `get_quiz`, `submit_quiz` |
| `/profile` | `app/profile/page.tsx` | Stats, commitment raise, award history, charts | `get_public_profile`, `get_my_state`, `set_commitment`, `get_my_awards` |
| `/awards` | `app/awards/page.tsx` | Awards of a competition (provisional → final) | `get_awards_view` |

Navigation (`components/Navbar.tsx`): *Leaderboard*, *Chanting* (if `features.chanting`), *Books* (if `features.books`), *Podcast* (if `features.podcast`), *Profile*, *Awards*, plus *Admin* for admins.

### 12.2 Admin pages

| Route | Purpose |
|---|---|
| `/admin` | Dashboard: competition selector, KPIs, **attendance matrix** driven by the competition's dates, WhatsApp reminder tool (uses `window.location.origin`). |
| `/admin/competitions` | List with status badges and per-competition actions: **Finalize results** (when ended), Rebuild totals, Archive/Unarchive, **Delete** (typed title). |
| `/admin/competitions/new` and `/[id]` | The form (`CompetitionForm.tsx`): title, description, cover photo (URL or upload to `avatars`/`public`), dates, **type cards** (Reading / Chanting / Both), **Include bonus?** toggle, collapsible **Advanced scoring**, **awards editor**, live **rules preview**. Buttons: *Save draft*, *Save & publish*, *Save changes*. |
| `/admin/competitions/[id]/finalize` | Winner review: accept / swap / message / leave unassigned → confirm. |
| `/admin/users` | Students: filters, age, e-mail (via API), per-competition totals & commitments, CSV export; HOD: change gender/commitment, **Give Bonus**, **Grant Award**. No delete button (by design). |
| `/admin/logs` | Read-only daily logs and ledger for a competition. |
| `/admin/awards` | Given awards; HOD can revoke (soft). |
| `/admin/settings` | Admin whitelist, Books CMS, Podcasts CMS (HOD write). |

For non-HOD admins every write control is hidden and a "View only" notice is shown; the database refuses the writes anyway.

### 12.3 Shared pieces

| File | Role |
|---|---|
| `components/student/DailyLogModal.tsx` | THE log form. Steps: loading → (commitment) → form → summary. Calls `get_my_state`, `set_commitment` (via `CommitmentForm`), `log_activity`. |
| `components/student/CommitmentForm.tsx` | Mandatory commitment step. Exports `MAX_ROUNDS_COMMITMENT = 16`, `MAX_MINUTES_COMMITMENT = 60`. |
| `components/student/AwardPopup.tsx` | Queue of unlocked awards; mounted in `ClientLayout`. |
| `components/student/UserProfileModal.tsx` | Public profile (RPC `get_public_profile`). |
| `components/student/ConsistencyHeatmap.tsx` | Calendar of the competition days (start→end). |
| `components/student/AwardIcons.tsx` | `AwardIcon` (Lottie by `icon_key` or image URL). |
| `app/admin/_shared.tsx` | `useCompetitions`, `StatusBadge`, `CompetitionSelect`, `CompetitionActions`, `ViewOnlyNote`. |
| `hooks/useActiveCompetition.ts` | Cached read of `get_active_competition`. |
| `store/authStore.ts` | zustand: `user, adminRole, isAdmin, isHod, isOnboarded, signOut()`. |
| `lib/competition.ts` | Types, `DEFAULT_CONFIG`, `buildRulesText()`, `validateCompetitionInput()`, status helpers. |
| `lib/errors.ts` | `friendlyError()` + code map. |

### 12.4 Conventions

* Client pages use `'use client'` and the browser client from `lib/supabaseClient.ts` (or `createBrowserClient`). Server code uses `lib/supabase/server.ts` (`createSupabaseServer()` for the user, `createSupabaseAdmin()` for the service role, `getCaller()` for user + role).
* Always surface errors with `toast.error(friendlyError(err))`.
* Always use `lib/ist.ts` for dates.
* Styling: Tailwind utility classes, rounded-2xl/3xl cards, indigo/amber palette, mobile-first. Dark-mode classes exist on several student components.

---

## 13. End-to-end flows

### 13.1 HOD creates and runs a competition

1. **Admin → Competitions → New competition.**
2. Fill title/dates, pick **type**, toggle **bonus**, adjust *Advanced scoring* if needed, review the awards list, check the **rules preview**.
3. **Save & publish** (`save_competition` with `status:'published'`). Overlap with another published competition is rejected with a clear message. Default awards are seeded.
4. During the competition: monitor *Dashboard*, *Logs*, *Users*; give bonus (HOD) if bonus is on.
5. After the end date the status becomes **ended** → **Finalize results** (review/swap/message/confirm) → **finalized**. Winners get popups on/after each award's unlock date.
6. Optional: **Archive** to hide, or **Delete** (type the title) to remove everything.

### 13.2 Student's first day

1. Login → onboarding (name, mobile, gender, age, department) → leaderboard.
2. **Log Activity** → *Set Your Daily Commitment* (rounds ≤16 and/or minutes ≤60 depending on the type) → enter the day's rounds and/or minutes → submit → summary (base, streak multiplier, total).
3. The live feed and leaderboard update for everyone via Realtime.
4. Next days: log again (today, or yesterday within the late window). Raise the commitment any time from **Profile**.

### 13.3 Quiz bonus

1. **Bonuses** button → audiobooks page → play an audiobook (the page calls `start_listening` then `listening_heartbeat` every ~10 s while playing).
2. When the server-credited listening reaches `listen_threshold_pct` of the duration the quiz unlocks (`get_quiz`).
3. Answer all questions → `submit_quiz` grades on the server, writes the ledger, shows right/wrong flags. One attempt per audiobook per competition.

### 13.4 Finalization and the award popup

`ended` → HOD opens *Finalize* → `suggest_award_winners` → HOD edits → `finalize_competition` writes `competition_final_standings` + `user_awards`, emits `award` feed rows with `visible_from = unlock_date`, sets `finalized`. On or after the unlock date the winner's next page load shows the popup once (`seen_at` set on dismiss).

---

## 14. Competition configuration reference

Stored in `competitions.config` (jsonb). Missing keys fall back to defaults via `comp_cfg()` (SQL) / `DEFAULT_CONFIG` (TS). **Keep both in sync.** Validated by `save_competition` and `validateCompetitionInput`.

| Key | Default | Applies to | Meaning |
|---|---|---|---|
| `chanting_points_at_commitment` | 10 | chanting/both | Base points when 100 % of the rounds commitment is done. |
| `reading_points_at_commitment` | 10 | reading/both | Base points when 100 % of the minutes commitment is done. |
| `streak_multiplier_enabled` | true | all | Multiply daily points by the streak. |
| `streak_multiplier_cap` | 5 | all | Highest multiplier (≥1). |
| `shield_count` | 1 | all | Missed days a streak can survive (one each). |
| `weight_chanting` / `weight_reading` | 1 / 1 | **both** only | Weights in the total (≥0). |
| `quiz_points_per_correct` | 5 | bonus | Points per correct quiz answer. |
| `listen_threshold_pct` | 80 | bonus | % of the audiobook that must be listened to unlock the quiz (1–100). |
| `max_quiz_bonus` | null | bonus | Optional cap of total quiz points per student (null = none). |
| `late_log_days` | 1 | all | How many days back a log may be submitted (and the grace after the end date). |
| `use_logged_points` | false | chanting | Migrated competitions: keep historical per-day points. |

Top-level columns (not in `config`): `type`, `bonus_enabled`, `start_date`, `end_date`, `title`, `description`, `cover_photo_url`.

Hard-coded (change in code/SQL, not in config): commitment limits **16 rounds / 60 minutes**, sanity caps **300 rounds / 600 minutes** per day, manual bonus ≤ **10 000**, Japa counter cap 300.

---

## 15. Migrations: history and how to add one

### 15.1 History

| File | What it does |
|---|---|
| `20260518000000_add_audiobooks_and_quizzes.sql` | Original audiobooks/quiz tables (pre-existing). |
| `20260519120000_add_books_and_reading_sessions.sql` | Books + (legacy) reading sessions. |
| `20260815000000_add_user_chanting_logs.sql` | Counter table — **was never applied live**; recreated in `000100`. |
| `20261031000100_competition_core.sql` | IST helpers, role functions, `competitions` & all new tables/columns, uniqueness per competition, quiz answers moved out. |
| `20261031000200_competition_functions.sql` | Scoring engine, student & HOD RPCs, awards, read models. |
| `20261031000300_security_rls.sql` | Drops all old policies; RLS + grants for everything; function privileges. |
| `20261031000400_migrate_competition_1.sql` | One-off data migration of the legacy single competition (idempotent). |
| `20261031000500_mandatory_commitments.sql` | Commitments: rounds ≤16, minutes ≤60, mandatory, both together for Both. |
| `20261031000600_delete_competition.sql` | HOD delete with typed-title confirmation. |
| `20261031000700_reading_is_logged.sql` | Reading becomes a **log** scored by commitment; session tracking removed; counter never creates logs. |

### 15.2 Adding a migration (checklist)

1. Create `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_case_name>.sql` (later than the last file).
2. Make it **idempotent** where possible (`create or replace`, `if not exists`, `drop … if exists`).
3. Every new function: `security definer set search_path = public, pg_temp`, validate `auth.uid()`/`is_hod()`, and add `grant execute … to authenticated, service_role` (default privileges revoke execute from everyone).
4. Every new table: `enable row level security`, `revoke all … from anon, authenticated`, then explicit `grant select` + policies. Never let the browser write scoring data.
5. If you change a function body that earlier migrations created, put the full new definition in your migration (`create or replace`) — don't edit old migration files that are already applied.
6. Update the TypeScript side if the contract changed (types in `lib/competition.ts`, callers).
7. `npm run schema:build` (regenerates `schema.sql`) and `node scripts/db-tests/check-schema.mjs` (fresh deploy still works).
8. Add/adjust scenarios in `scripts/db-tests/run.mjs`; `npm run test:db` must be green.
9. Apply to live: paste into the Supabase SQL editor, or `SUPABASE_ACCESS_TOKEN=… node scripts/apply-migrations.mjs --yes <file>.sql`.
10. **Deploy order:** if the new code *requires* the migration (new RPC) → apply the migration first, then push. If the migration *removes* something the deployed code uses → apply and push together, as quickly as possible. Always `npm run db:backup` before destructive migrations.

`schema.sql` includes every migration from `20261031000100` onward **except** the legacy data migration (`…migrate_competition_1`). The test harness and `apply-migrations.mjs` use the same rule ("14-digit prefix ≥ `20261031000100`").

---

## 16. Testing

### 16.1 Database scenario suite — `npm run test:db`

* Runs on **PGlite** (a real PostgreSQL 18 in WASM), no cloud needed. `scripts/db-tests/baseline.sql` recreates the pre-competition live schema + a stub of Supabase `auth`, then **all migrations are applied**, then the suite runs.
* If a `backups/<timestamp>/` folder exists, the live data is restored first (scenario 11 dry-runs the Competition 1 migration against it). **Create a backup first (`npm run db:backup`) or scenario 11 will fail** — the other scenarios don't need data.
* Simulated callers: `as(db, user|'anon'|'system', sql, params)` sets the JWT claims and `SET ROLE`, so RLS and grants are really exercised.
* The test clock: `setClock(db, isoUTC)` (tests replace `app_now()`; production never does). Handy: `04:30Z = 10:00 IST`, `18:40Z = 00:10 IST next day`.

Scenarios (199 checks): 1 reading as a log scored by commitment · 2 chanting + bonus + server-graded quiz · 3 both with weights and rebuild · 4 overlap rules · 5 before/after dates · 6 Guide/Enabler view-only (RPC **and** direct table writes) + gender scope · 7 student cannot bypass via REST · 8 finalize/freeze · 9 award popup timing · 10 IST day boundary and the Japa counter · 12 HOD delete · 11 Competition 1 migration dry-run.

### 16.2 Other checks

* `node scripts/db-tests/check-schema.mjs` — `schema.sql` builds a working DB from empty.
* `npm run lint` — 0 errors (React-Compiler-style rules and `no-explicit-any` are deliberately warnings).
* `npm run build` — must pass.
* **Not automated:** UI/E2E, Realtime, storage uploads, Vercel. Use the manual checklist below.

### 16.3 Manual QA checklist (after a release)

1. HOD signs in → Competitions → create a competition starting today (type Both, bonus on) → publish. Try an overlapping one → rejected.
2. Test student: onboarding (age required) → Log Activity → commitment form asks rounds **and** minutes (try 17 / 61 → rejected) → log → leaderboard shows Chanting / Reading / Bonus / Total.
3. Second student sees the first one's points appear live.
4. **Bonuses** button opens audiobooks; listen → quiz unlocks → submit → bonus shows.
5. Guide account: sees data but no write buttons; a direct API/RPC attempt is refused.
6. After the end date: Finalize → swap a winner → confirm → the winner sees the popup once.
7. `npm run test:db` green.

---

## 17. Deployment and operations

### 17.1 Deploy

* Vercel is connected to GitHub: **every push to `main` deploys** to https://folk-competition.vercel.app/ (build `next build`).
* Required Vercel env vars: the three in §3.3. No `vercel.json`, no CI config.
* Verify a deploy: the home page returns 200 and its `ETag` changes; protected pages redirect signed-out users; `GET /api/sync-chanting` returns 401 when signed out.

### 17.2 Release procedure

1. `npm run lint && npm run build && npm run test:db` (+ `npm run schema:build` if SQL changed).
2. If there is a migration → follow §15.2 step 10 for ordering.
3. `git add -A && git commit && git push origin main` (make sure `backups/`, `scratch/`, `.env*` are untracked — they are in `.gitignore`).
4. Check the live site.

### 17.3 Backups and recovery

* `npm run db:backup` → `backups/<timestamp>/` (JSON per table + `auth_users.json` + `schema-openapi.json`). **It cannot export RLS policies or functions** (not exposed over REST) — those live in `schema.sql`/migrations. Supabase's own daily backups (dashboard) are the real safety net for production.
* The backup folder contains **phone numbers and e-mails**: never commit, share or leave it around.

### 17.4 Handy operational SQL (Supabase SQL editor)

```sql
-- make someone an admin / change role / remove
insert into public.admin_emails (email, role) values ('new.hod@example.com', 'HOD');
update public.admin_emails set role = 'FOLK_GUIDE' where lower(email) = 'someone@example.com';
delete from public.admin_emails where lower(email) = 'someone@example.com';   -- keep at least one HOD!

-- competitions and their status
select id, title, type, bonus_enabled, start_date, end_date, stored_status,
       public.competition_status(c) as derived_status
from public.competitions c order by start_date desc;

-- recompute everyone's totals for a competition (or use the 'Rebuild totals' button in Admin → Competitions)
select public.rebuild_competition_totals('<competition-uuid>');

-- a student's ledger
select activity_date, source, points, meta from public.points_ledger
where competition_id = '<competition-uuid>' and user_id = '<user-uuid>' order by activity_date;

-- who has NOT logged today (IST)
select u.full_name from public.users u
where u.is_onboarded and not exists (
  select 1 from public.activity_logs a
  where a.user_id = u.id and a.log_date = public.ist_today());

-- legacy data migration report (Competition 1)
select * from public.migration_report_competition1 where diff <> 0;
```

### 17.5 Operating tips

* Prefer **Archive** over **Delete** when history might matter; Delete is irreversible.
* Changing the scoring config of a running competition rebuilds all totals — students' points can change. Warn them.
* If someone is missing from the leaderboard: check they finished onboarding (`users.is_onboarded`), and that gender/age are set.
* After the end date remember to **Finalize**; awards never appear before that (only provisional leaders).

---

## 18. Cookbook: "How do I change…?"

> General pattern: **database first** (migration + tests), then types/callers, then UI, then docs.

### Change the commitment limits (16 rounds / 60 minutes)
* SQL: the `between 1 and 16` / `between 1 and 60` checks in `set_commitment`, `hod_set_commitment` and the table constraints (new migration with `create or replace` + `alter table … drop/add constraint`); `sync_chanting` clamps the auto default to 16.
* TS: `MAX_ROUNDS_COMMITMENT` / `MAX_MINUTES_COMMITMENT` in `CommitmentForm.tsx`, the `max={16}` / `max={60}` in `app/profile/page.tsx` and `app/admin/users/page.tsx`, validations in `app/api/admin/update-user/route.ts`, texts in `lib/competition.ts` (`buildRulesText`) and `lib/errors.ts`.
* Update the tests (`run.mjs` scenarios 1–3).

### Change a scoring formula
* Edit `recompute_user` (new migration, full `create or replace`). Mirror it in `lib/pointsEngine.ts`. Update `buildRulesText`. Add a worked example to the tests. After applying, run `rebuild_competition_totals` for open competitions.

### Add a new scoring/config option
1. Add the key + default to `comp_cfg()` (SQL) **and** `DEFAULT_CONFIG` + `CompetitionConfig` (TS).
2. Add it to the validation lists in `save_competition` (SQL) and `validateCompetitionInput` (TS).
3. Add the field to `app/admin/competitions/CompetitionForm.tsx` (`NUMERIC_KEYS` + a `NumField`).
4. Use it in `recompute_user` / the relevant function and in `buildRulesText`.

### Add a new award criterion
* Add the value to the `check` constraint of `competition_awards.criterion`, a `case` branch in `award_candidates`, a label in `AWARD_CRITERIA` (`lib/competition.ts`), and a test.

### Add a new competition type
* Extend the `type` check, `competitions.type`, `includesChanting/includesReading` helpers, `recompute_user`, `log_activity`, `set_commitment`, the Navbar feature flags (`get_active_competition`), the form's type cards, `buildRulesText`, and the leaderboard column logic. This touches many places — grep for `'both'` and `includesChanting` first.

### Add a field to registration
* Column on `users` (+ add it to the column-privilege `grant update (...)` if students may edit it) → `app/api/onboarding/route.ts` validation → `app/onboarding/page.tsx` → admin Users table/CSV (`app/admin/users/page.tsx`) → `/api/admin/update-user` whitelist if the HOD may edit it.

### Change the time zone
* It is deliberately fixed to IST. To change: `ist_today`, `ist_date_of`, `lib/ist.ts` (`const IST`), the `competition_json` day math, and all tests that assume `04:30Z = 10:00 IST`.

### Add an admin role or change a scope
* Update the `admin_emails_role_check`, `admin_can_see_user()`, `canSeeAdminRole()` in `app/api/admin-whitelist/route.ts`, `ADMIN_ROLES` in `lib/supabase/server.ts`, `AdminRoleName` in `store/authStore.ts`, UI labels in `app/admin/layout.tsx` / settings, and tests (scenario 6).

### Add a new page
* Create `app/<route>/page.tsx` (`'use client'` if it uses hooks). The proxy already protects it (signed-in + onboarded). Add it to `components/Navbar.tsx`. If it should be feature-gated, add a flag in `get_active_competition().features`.

### Add a new RPC
* Write it in a migration (security definer, validate `auth.uid()`/`is_hod()`, `grant execute`), call with `supabase.rpc('name', {...})`, map new error codes in `lib/errors.ts`, add tests, update §8.2 of this guide.

### Add a new API route
* `app/api/<name>/route.ts`; authenticate with `getCaller()` (`lib/supabase/server.ts`); use `createSupabaseAdmin()` only if RLS must be bypassed and **only after** checking the caller's role. Update §11.

### Change texts/rules students see
* Rules text is generated by `buildRulesText()` in `lib/competition.ts` (single place) — never hard-code rules in pages. Commitment-form copy is in `CommitmentForm.tsx`; error messages in `lib/errors.ts`.

### Change default awards
* `seed_default_awards` (SQL). Existing competitions keep their own copies (edit them in the competition form).

### Change who sees Books/Podcast
* `feature_enabled()` and `get_active_competition().features` (SQL) + the RLS policies `books_select`/`audiobooks_select`/`quiz_questions_select` and `components/Navbar.tsx`.

---

## 19. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Student stuck on `/onboarding` | `users.is_onboarded` false (or cached 5 min in `sadhana_ctx`). | Finish onboarding; if the DB says true wait ≤5 min or sign out/in. |
| "No competition is running right now" | No published competition covering today (IST) (+ grace). | Publish one / check dates; remember IST. |
| `COMMITMENT_REQUIRED` / `READING_COMMITMENT_REQUIRED` | Commitment not set for this competition. | Student sets it in the log form or Profile. |
| `ALREADY_LOGGED` | One log per day. | Choose another date. |
| `LATE_NOT_ALLOWED` / `DATE_OUTSIDE_COMPETITION` | Older than `late_log_days` or outside the dates. | Adjust `late_log_days` or the dates (rebuild happens automatically). |
| `OVERLAPS_EXISTING_COMPETITION` | Another published/finalized competition covers some of those dates. | Change dates or archive/delete the other one. |
| `permission denied for table/function` | Missing grant/policy (new object) or caller not allowed. | Add `grant`/policy in a migration; never grant writes on scoring tables to `authenticated`. |
| `FORBIDDEN: HOD only` from the SQL editor | The function uses `is_hod()` (needs a signed-in HOD). | Use the app as HOD, or a function that allows system context (`rebuild_competition_totals`). |
| Leaderboard shows no Bonus column | Bonus is off and nobody has bonus points. | Toggle *Include bonus* in the competition. |
| Books/Podcast missing in the menu | Active competition doesn't include reading/bonus (flags), or no active competition. | Check `get_active_competition().features`. |
| Quiz won't unlock | Server hasn't credited enough listening, or the audiobook has no duration. | Let it play (heartbeats); HOD uses *Detect missing durations* in Settings. |
| `COMPETITION_FINALIZED` | Trying to change a finalized competition. | It is frozen by design (archive/delete only). |
| Realtime updates stop | Realtime publication/permissions. | Ensure `activity_feed` is in `supabase_realtime`; the board still refetches every ~60 s. |
| Login loop after deploy | Supabase redirect URL not allow-listed. | Add `https://<domain>/**` in Supabase → Auth → URL configuration. |
| `npm run test:db` scenario 11 fails | No `backups/` folder. | `npm run db:backup` (needs `.env.local`), or ignore scenario 11. |
| Build errors about `.next/types/validator.ts` after deleting a route | Stale generated types. | `rm -rf .next` and rebuild. |
| Strange line-ending warnings on Windows | Git autocrlf. | Harmless. Scripts that parse SQL normalize `\r\n`. |

---

## 20. Design decisions and the reasons behind them

| Decision | Why |
|---|---|
| **Logic in Postgres functions** | One transactional place; students cannot cheat; the same rules apply to every client. |
| **Ledger + rebuildable totals** | Points are auditable; changing rules or fixing data is a `rebuild`, not a manual edit. |
| **Reading is logged, not timed** | Requirement: leaderboard data must come only from the log; reader timers were gameable and not the organizers' source of truth. |
| **Japa counter never creates logs** | Same rule, applied strictly. The counter only pre-fills the form. (If an auto-fill fallback is ever wanted, implement it explicitly and document it.) |
| **Commitments per competition, snapshot per log** | Fair normalization (rounds ÷ commitment); raising later doesn't rewrite history. |
| **16 rounds / 60 minutes caps** | Organizer's rule — prevents unrealistic commitments gaming the ratio. |
| **IST fixed** | All participants are in India; avoids the UTC/IST off-by-one between 00:00 and 05:30. |
| **Admins aren't in `users`** | They are managers, not participants; roles live in `admin_emails` matched by e-mail. |
| **Gender scope by RLS** | A UI-only filter is not security. |
| **Quiz answers in a separate HOD-only table** | Students must never be able to read them. |
| **`is_admin(email)` neutralized** | The old signature let anyone probe which e-mails are admins. |
| **`activity_feed` instead of reading private tables** | Public-safe live feed + incremental client updates + gender scoping. |
| **Competition 1 keeps logged points** | Historical fairness: its formula changed while it ran. |
| **Hard delete for competitions (HOD)** | Explicit request; guarded by a typed title; Archive is the soft option. |
| **No student delete in the admin UI** | It cascaded scored history across competitions. |
| **`proxy.ts` cookie cache** | Removes two DB round trips per request; it only affects routing, never authorization. |
| **`schema.sql` is generated** | Prevents drift between migrations and the "fresh install" file. |

---

## 21. Known limitations and legacy leftovers

* **Legacy columns/tables kept for history:** `users.streak_count/best_streak/last_log_date/freeze_credits/target_*`, `activity_logs.reading_minutes` is *live* but `hearing_minutes` is unused, table `reading_sessions` (old reader data), `awards_legacy`. They can be dropped in a future migration after a backup.
* One migrated student has a legacy chanting commitment above 16 (kept; the new range check is `NOT VALID`).
* Only **one open competition at a time**; no per-group (e.g. per-college) leaderboards.
* No e-mail/WhatsApp notifications (the admin dashboard only prepares reminder messages).
* No automated UI/E2E tests; Realtime and Storage are untested in CI.
* Lint: ~100 warnings (mostly `any` and effect-state patterns) are tolerated by configuration.
* `README.md` describes the **old** single-challenge version (26-day challenge, hearing minutes, auto-fulfil, etc.). Use this guide instead.
* `audiobooks.duration_seconds` may be empty for old audiobooks until the HOD runs *Detect missing durations*; until then the longest reported duration is used.
* Reading minutes are **self-reported** by design (no verification).
* DNS-rebinding between the `fetch-book` host check and the actual fetch is a residual (low) risk.

Ideas that fit the architecture: per-group leaderboards (add a `group` on `users` and filter in `get_leaderboard`), push/WhatsApp reminders via a scheduled function, CSV/PDF result export for finalized competitions, award image upload, an admin audit log table, E2E tests with Playwright against a staging Supabase project.

---

## 22. Appendices

### Appendix A: Error codes

Raised by the database (as the exception message) and mapped by `lib/errors.ts`.

| Code | Meaning |
|---|---|
| `NOT_AUTHENTICATED` | No valid session. |
| `NOT_ONBOARDED` | Profile not completed. |
| `NO_ACTIVE_COMPETITION` | Nothing open today. |
| `CHANTING_NOT_ENABLED` / `READING_NOT_ENABLED` / `BONUS_NOT_ENABLED` | The competition doesn't include that part. |
| `DATE_OUTSIDE_COMPETITION` / `FUTURE_DATE` / `LATE_NOT_ALLOWED` | Bad log date. |
| `INVALID_ROUNDS` / `INVALID_MINUTES` | Out of range (rounds 0–300, minutes 0–600). |
| `ALREADY_LOGGED` | Day already submitted. |
| `COMMITMENT_REQUIRED` / `READING_COMMITMENT_REQUIRED` | Set the commitment first. |
| `INVALID_COMMITMENT` / `INVALID_READING_COMMITMENT` | Not within 1–16 / 1–60. |
| `COMMITMENT_CANNOT_DECREASE` / `READING_COMMITMENT_CANNOT_DECREASE` | Raise-only. |
| `QUIZ_LOCKED` / `QUIZ_ALREADY_SUBMITTED` / `QUIZ_EMPTY` / `LISTEN_NOT_STARTED` | Quiz flow. |
| `AUDIOBOOK_NOT_FOUND` / `BOOK_NOT_FOUND` | Content missing. |
| `COMPETITION_NOT_FOUND` / `COMPETITION_FINALIZED` | Lookup / frozen. |
| `OVERLAPS_EXISTING_COMPETITION: …` | Date overlap (message includes the other title). |
| `FORBIDDEN: HOD only` | Caller is not the HOD. |
| `USER_NOT_FOUND` / `INVALID_POINTS` / `INVALID_TITLE` | Bonus/award input problems. |
| `INVALID: …` | Free-text validation message from HOD functions (shown as-is). |

### Appendix B: Table → who can read what (RLS summary)

| Table | Student | Admin (scoped) | HOD |
|---|---|---|---|
| `users` | own row | rows in gender scope | all |
| `activity_logs`, `points_ledger`, `competition_totals`, `competition_participants`, `user_awards`, `quiz_submissions`, `bonus_points`, `user_audiobook_progress`, `user_chanting_logs`, `reading_sessions` | own rows | rows of students in scope | all |
| `competitions`, `competition_awards` | published/finalized | all | all (write via RPC) |
| `activity_feed` | rows with `visible_from ≤ today` | + gender scope | all |
| `competition_final_standings` | via RPC only | in scope | all |
| `books` | only when books are enabled | always | write |
| `audiobooks`, `quiz_questions` | only when podcast/bonus is enabled | always | write |
| `quiz_answers` | ❌ | ❌ | read/write |
| `app_settings` | read | read | write |
| `admin_emails` | ❌ (service role / API only) | ❌ | via API |

### Appendix C: Where each requirement lives

| Requirement | Where |
|---|---|
| "Reading and chanting commitments are mandatory at the first log, ≤16 rounds / ≤60 min" | `set_commitment`, `log_activity`, `CommitmentForm.tsx` |
| "Leaderboard from the log activity only" | `recompute_user`, `log_activity`; no reader/counter points |
| "Bonus shown for any type when enabled" | `app/leaderboard/page.tsx` (`breakdownParts`) |
| "Bonuses button next to Log Activity" | `app/leaderboard/page.tsx` → `/podcast` |
| "Awards actually reach winners" | `finalize_competition`, `get_pending_award_popups`, `AwardPopup.tsx` |
| "Only HOD writes" | `assert_hod()`, HOD policies, `/api` role checks, hidden buttons |
| "IST day boundary" | `ist_today()`, `lib/ist.ts` |
| "Delete a competition" | `delete_competition`, `CompetitionActions` in `app/admin/_shared.tsx` |

### Appendix D: Documents in the repo

| File | Use |
|---|---|
| `GUIDE.md` | This guide (current truth). |
| `CHANGES_REPORT.md` | Chronological change log with decisions and test results. Sections 1–8 describe the first big rebuild (some details, e.g. reader sessions, were later superseded); §9, §10, §11 are the later addenda. |
| `AUDIT_REPORT.md` | Audit of the original app (bugs and risks that motivated the rebuild). |
| `README.md` | Older overview — see the banner at its top. |
| `schema.sql` | Generated full schema. |

---

*Keep this guide up to date: when you change behavior, update the relevant section (and the function table in §8.2 / config table in §14) in the same commit.*
