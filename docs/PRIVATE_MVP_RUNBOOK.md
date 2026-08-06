# FOLK Surat integrated private MVP runbook

## Safety boundary

This workspace is a private test system. It must not send a real student or
guide message, publish an application, merge to `main`, approve a discount,
change a foundational goal, or upload the Prabhupada corpus to an external
provider.

All three repositories use `codex/overnight-foundation`. The protected daily
sadhana flows remain present. Firebase remains the legacy read/write path during
shadow migration and the FCM transport after cutover; Supabase is the future
canonical application store.

## Current surfaces

### Web and HOD dashboard

- Google-only sign-in shell
- private no-credential dashboard preview
- exclusive chanting-bracket chart
- quarter target position
- college-aware push/cool-down/verify states
- student focus queue with one reason and one next action
- weekly milestone view
- safe Trello outbox/webhook foundation
- local Prabhupada corpus importer and query utility

When Supabase environment variables are absent, the dashboard clearly labels
all displayed student activity as synthetic. The build never silently connects
to a fallback database.

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:3000/admin` for the private dashboard preview.

### Student Flutter app

- existing daily sadhana form and history preserved
- Google-only identity mode enabled by default
- Today journey with ABCDE entry points
- RDUA four-step flow
- japa counter
- mentor-association request preview
- guidance-chat safety boundary
- Supabase shadow-write adapter for legacy sadhana

Private debug preview:

```powershell
flutter run --dart-define=MVP_PREVIEW=true --dart-define=GOOGLE_ONLY_AUTH=true
```

`MVP_PREVIEW` is honored only in debug mode and is false by default.

### Guide Flutter app

- existing student sadhana inspection preserved
- Google-only guide/HOD role gate
- Monday milestone dashboard
- private LIT coordinates, confidence and three-interaction reassessment cue
- separate ABCDE progress view
- mentor-approved interaction-summary composer
- calendar pulse, trips, RDUA, service and approval operations
- no-send preview notices

Private debug preview:

```powershell
flutter run --dart-define=MVP_PREVIEW=true --dart-define=GOOGLE_ONLY_AUTH=true
```

## Supabase test project

- Project reference: `eztlkvzgiepgpylayapv`
- Region: `ap-southeast-1`
- PostgreSQL: 17
- 12 approved migrations applied
- 47 public tables, all with Row Level Security enabled
- security advisor: no findings as of 6 August 2026
- user and student-activity tables: empty until test Google identities sign in

Current Supabase changes include Google-provider enforcement, role-aware access,
guide assignment boundaries, quarterly targets, sadhana parity, interaction
summaries, LIT, ABCDE activities, content, RDUA, trips, competitions, reminders,
approvals, Trello outbox/inbox, and grounded retrieval tables.

Local web environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The service-role key is server-only and must never use a `NEXT_PUBLIC_` prefix.

Flutter test configuration uses build-time values:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
GOOGLE_ONLY_AUTH=true
CANONICAL_DATA_MODE=shadow
```

## Local grounded retrieval

The unchanged OneDrive archive remains canonical. The Git-ignored working copy
contains 737 Markdown sources and the generated index contains 175,819 chunks.
No upload was performed and every source remains pending review.

```powershell
node scripts/rag/query-local.mjs --query "How can a student develop steady taste for chanting?" --limit 8
```

The local search layer retrieves evidence; it does not impersonate Srila
Prabhupada or independently give practical personal guidance. Guide-facing
drafts require citations and approval. Student-facing answers never reveal LIT
or private mentor notes.

## Trello boundary

Trello receives operational tasks only. The safe-card layer rejects LIT,
conversation text, mentor notes, sadhana details and other private fields.
Without test-board credentials the integration remains an outbox draft and does
not contact Trello.

## Verification

- web TypeScript production build passes without credentials
- 13 web business-rule tests pass
- two student widget tests pass
- two guide widget tests pass
- both Flutter analyzers complete with zero errors
- local corpus copy: 737 of 737 SHA-256 matches
- local corpus search returns cited book, letter, conversation and lecture evidence
- dashboard checked at desktop and 390-pixel mobile width
- Supabase security advisor reports no findings

The Android build toolchain is installed without an emulator:

- SDK: `D:\Android\Sdk`
- Java 17: `D:\Android\Jdk17`
- Gradle cache: `D:\Android\Gradle`
- disposable build workspaces and APK handoff: `D:\Android\Builds`
- API 35 and 36, Build Tools 35 and 36, Platform Tools 37.0.1, and NDK
  `28.2.13676358`

Release split APKs were built from disposable D-drive workspaces. Student APK
sizes are 34.04 MB (`armeabi-v7a`), 36.21 MB (`arm64-v8a`) and 37.62 MB
(`x86_64`). Guide APK sizes are 19.57 MB, 21.78 MB and 23.18 MB respectively.
The 64-bit student APK is 1.21 MB above the desired 35 MB ceiling and should
receive a later size-optimization pass. These APKs use the repositories'
existing test/debug signing configuration and must not be publicly distributed.
