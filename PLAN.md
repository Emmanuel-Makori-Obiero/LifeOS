# LifeOS Architecture And Implementation Plan

## Repository Inspection

The repository was empty at inspection time:

- No existing application files.
- No `package.json`.
- No framework, database, authentication, or component architecture.
- No Git repository metadata in this folder.

Because there is no existing architecture to preserve, LifeOS will start as a standalone React, TypeScript, Tailwind CSS, Supabase, PostgreSQL, Supabase Auth, and PWA application.

## Architecture Plan

LifeOS will be a single-page PWA deployed as a static web app, with Supabase providing authentication, relational data storage, Row Level Security, and later edge functions for AI/database actions that require server-side secrets.

Frontend:

- Vite React with TypeScript.
- Tailwind CSS for a calm, responsive interface.
- Componentized feature folders under `src/features`.
- Shared Supabase client under `src/lib`.
- Client-side routing through application state for Phase 1, with React Router considered when navigation grows.

Backend:

- Supabase Auth for user accounts.
- PostgreSQL tables owned by each authenticated user.
- RLS policies on all user data tables.
- SQL migrations in `supabase/migrations`.
- Future Supabase Edge Functions for AI assistant actions, reminders, and scheduled processing.

AI:

- Phase 1 includes deterministic recommendation logic for "What Should I Do Now?" using real task data.
- Later phases should add an Edge Function-backed AI assistant that reads authorized LifeOS data and requires confirmation before writes.

PWA:

- Vite PWA service worker.
- Installable manifest.
- Browser notification permission flow for reminders where supported.
- Native phone alarm limitations documented in-app before relying on mobile alarms.

## Database Plan

Initial relational schema:

- `profiles`: user display metadata.
- `areas`: high-level life domains.
- `goals`: long-term outcomes.
- `projects`: concrete bodies of work.
- `milestones`: project checkpoints.
- `tasks`: macro and micro tasks with parent-child relationships.
- `task_dependencies`: blocking relationships between tasks.
- `reminders`: task/event/note reminder records.
- `notes`: standalone notes and task/project-linked notes.
- `habits`: recurring behaviors.
- `courses`: study domains.
- `lessons`: course study units.
- `calendar_events`: standalone scheduled events.
- `user_preferences`: per-user settings.
- `ai_conversations`: assistant sessions.
- `ai_messages`: assistant messages and proposed actions.

Every user-owned table includes `user_id uuid not null references auth.users(id) on delete cascade` and RLS policies requiring `auth.uid() = user_id`.

## MVP Implementation Plan

Phase 1:

- Scaffold Vite React/TypeScript/Tailwind/PWA.
- Add Supabase client and environment variable contract.
- Add database migration with RLS.
- Build authentication screen.
- Build app shell, dashboard, quick capture, task creation, today view, macro/micro task rendering, completion, overdue visibility, notes, and deterministic "What Should I Do Now?" recommendation.

Phase 2:

- Add full CRUD screens for areas, goals, projects, milestones, notes, reminders, courses, lessons, and calendar events.
- Add editing, filtering, and task dependency management.
- Add richer mobile navigation and empty/error/loading states.

Phase 2 started:

- Calendar event creation is now available from the dashboard sidebar.
- Reminder creation is now available for tasks, calendar events, and notes.
- Course and lesson creation is now available in the Study activities panel.
- Lessons can be checked complete with `completed_at`.
- Scheduled tasks, study activities, calendar events, and reminders can be handed off to Google Calendar for alarm notifications through Google Calendar event links.
- Google Calendar OAuth sync has been started with Supabase Edge Function support for connecting Google and creating Google Calendar events from LifeOS records.

Remaining Phase 2 work:

- Add update/delete flows for calendar events, reminders, courses, and lessons.
- Add areas, goals, projects, milestones, and dependency management screens.
- Add richer filtering and mobile navigation.
- Harden Google Calendar sync with encrypted token storage, disconnect/revoke flow, duplicate update behavior, and background sync policies.

Phase 3:

- Add Supabase Edge Functions for AI assistant read operations and confirmed write proposals.
- Add assistant conversation persistence.
- Add "plan tomorrow", "what am I forgetting", overload analysis, and macro breakdown generation.

Phase 4:

- Add reminder processing, browser notification scheduling while app is open, and backend reminder dispatch strategy.
- Add recurring tasks/habits and notification preference controls.

Phase 5:

- Harden security, add test coverage, deploy to Vercel, document operations, and prepare optional integrations.

## File And Folder Structure

```text
.
├── AGENTS.md
├── PLAN.md
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig*.json
├── vite.config.ts
├── public/
│   ├── favicon.svg
│   └── pwa-*.svg
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── components/
│   ├── features/
│   ├── lib/
│   └── types/
└── supabase/
    └── migrations/
```

## Phase Reporting Template

After each phase, report:

- What was built.
- Files changed.
- Database changes.
- Environment variables required.
- Tests performed.
- Known issues.
- Next recommended phase.
