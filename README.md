# Sadhana Challenge: Event Competition App

A gamified web app where college students log their daily spiritual practice (sadhana) and compete on a live leaderboard during a time-boxed challenge event.

**Live demo:** https://folk-competition.vercel.app

---

## Overview

Sadhana Challenge runs a fixed-length event (by default a 26-day challenge). Students sign in with Google, set their daily commitments, and log chanting rounds, reading and hearing. The app turns that into points, streaks, badges and avatar tiers, so the competition stays friendly. Organisers get an admin console with role-based access. From there they manage participants, content, bonus points and event settings.

Built with Next.js 16 (App Router) and Supabase (Postgres, Auth, Realtime, Storage).

## Features

**For participants**
- **Google sign-in and onboarding.** OAuth through Supabase Auth, then a profile step: name, mobile, department, gender and daily targets for chanting, reading and hearing.
- **Daily activity log.** Log chanting rounds, reading minutes and hearing minutes for today. Late entries are accepted within a configurable window (`late_log_allowed_days`).
- **In-app chanting counter.** A tap-to-count bead counter with vibration feedback and progress saved locally. Rounds sync to the server, and any day that has rounds but no log is filled in automatically.
- **Streaks with freeze credits.** Consecutive-day streaks. A freeze credit covers a single missed day.
- **Live leaderboard.** Ranked by total points, with a "Day X of N" challenge counter and a live activity feed. It updates in real time through Supabase Realtime subscriptions.
- **Library reader.** PDF and DOCX books (DOCX rendered with `mammoth`), fetched through an authenticated server proxy. Bookmarks are included, and reading sessions earn points.
- **Audiobooks and quizzes.** Listen to audiobooks, track progress, then take a quiz that awards points once per book.
- **Awards and avatar tiers.** Badges unlock automatically, and six avatar levels run from *Noob* to *Legend*.
- **Profile.** Personal stats plus a consistency heatmap.
- Light/dark theme switcher and celebration effects (confetti, Lottie).

**For organisers (admin console at `/admin`)**
- **Role-based admin whitelist.** Admins are defined in `admin_emails` and checked by the `is_admin()` Postgres function in route middleware. Supported roles include `HOD`, `FOLK_GUIDE` and `FOLK_ENABLER_MALE`/`FOLK_ENABLER_FEMALE`, and each role can only assign certain other roles. Non-HOD roles see only participants of their assigned gender.
- **Dashboard.** Participation and activity overview.
- **User management.** Edit participants, grant bonus points, manage awards and export everyone to CSV.
- **Activity logs.** Review what participants have submitted.
- **Content management.** Upload and manage books and audiobooks, and write quiz questions.
- **Event settings.** Challenge title, start and end dates, log cutoff hour, late-log window and onboarding fields, all stored in `app_settings`.

## How scoring works

The scoring logic lives in [`lib/pointsEngine.ts`](lib/pointsEngine.ts).

| Source | Rule |
|---|---|
| Daily chanting log | `base = round(rounds / target_chanting × 10)` (default target 16 rounds) |
| Streak multiplier | `total = base × streak_day`: day 1 is 1×, day 2 is 2×, day N is N× |
| Reading sessions | 1 point per full minute read (sessions of 10 seconds or less are ignored) |
| Audiobook quiz | 5 points per correct answer, awarded once per quiz |
| Bonus points | Given manually by admins |

**Streak rules:** a log on the next day extends the streak. If exactly one day is missed and the participant has a freeze credit, the credit is used and the streak continues. Otherwise the streak resets to 1. Only one log per day is allowed.

**Badges** unlock automatically:
- `rising_sadhaka`: first log
- `unbroken_flame`: a 7-day streak
- `mahayogi_crown`: 500 points
- `brahma_muhurta`: 5 logs submitted before 6 AM

## Tech stack

- **Framework:** Next.js 16 (App Router, Route Handlers), React 19, TypeScript
- **Backend:** Supabase: Postgres with row-level security, Google OAuth, Realtime and Storage (`@supabase/ssr`, `@supabase/supabase-js`)
- **State:** Zustand
- **UI:** Tailwind CSS v4, Framer Motion, Lucide icons, Recharts, react-hot-toast, canvas-confetti, Lottie
- **Documents:** mammoth (DOCX to HTML)
- **Hosting:** Vercel

## Architecture

```
proxy.ts            Session refresh and route guard: auth → admin check → onboarding redirect
app/
  page.tsx          Google sign-in (landing)
  auth/callback     OAuth code exchange, creates the user profile, routes to admin/onboarding/leaderboard
  onboarding/       Profile and daily targets
  leaderboard/      Live rankings and activity feed
  chanting/         Bead counter
  books/            PDF/DOCX reader
  podcast/          Audiobooks and quizzes
  awards/           Badges
  profile/          Stats and heatmap
  admin/            Dashboard, users, logs, books, audiobooks, awards, settings
  api/
    sync-chanting         Upsert counter rounds; auto-create missing daily logs with points and streak
    save-reading-session  Record a reading session and award points
    fetch-book            Authenticated proxy for remote book files
    awards-stats          Aggregate points data for the awards page
    user-logs             A participant's activity logs
    admin-whitelist       Manage admin emails and roles (role permission matrix)
    admin/update-user     Admin edits to a participant
lib/pointsEngine.ts Scoring, streak and award rules
schema.sql          Base database schema, settings and is_admin()
supabase/migrations Audiobooks and quizzes, books and reading sessions, chanting logs
```

API routes that write points or read across users use the Supabase service-role key on the server only. Every route checks the caller's session first.

## Getting started

**Prerequisites:** Node.js 20+ and a Supabase project with Google OAuth enabled.

```bash
git clone https://github.com/KaushalPawar14/sadhana-challenge.git
cd sadhana-challenge
npm install
```

Create `.env.local` with these variables:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

(`SUPABASE_URL` and `SUPABASE_ANON_KEY` also work as fallbacks in the auth callback.)

Set up the database:
1. Run `schema.sql` in the Supabase SQL editor.
2. Apply the files in `supabase/migrations/` in order.
3. Add at least one admin email to the `admin_emails` table.
4. Add `http://localhost:3000/auth/callback` to your Supabase Auth redirect URLs.

Run the app:

```bash
npm run dev      # http://localhost:3000
npm run build && npm start
npm run lint
```

## Author

**Kaushal Pawar**, AI / Full-Stack Engineer
Portfolio: https://portfolio-kaushal-chi.vercel.app · GitHub: [@KaushalPawar14](https://github.com/KaushalPawar14)
