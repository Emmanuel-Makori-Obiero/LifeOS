# LifeOS Development Rules

LifeOS is a real standalone personal life-management PWA. Treat every feature as production-bound, not as a visual prototype.

## Product Principles

- Build incrementally and keep each phase usable.
- Prefer working features over decorative placeholders.
- Do not add fake buttons or UI that appears complete but has no behavior.
- The core user question is: "What should I do next?"
- Keep the interface calm, modern, minimal, clear, and fast.

## Architecture Rules

- Use React, TypeScript, Tailwind CSS, Supabase, PostgreSQL, Supabase Auth, and PWA support unless a future migration plan gives a strong reason to change.
- Keep Supabase database access centralized in `src/lib/supabase.ts` and feature data helpers.
- All user-owned database tables must have `user_id` and RLS policies enforcing `auth.uid() = user_id`.
- Important AI-driven or assistant-driven writes must require explicit confirmation.
- Never invent tasks, deadlines, events, reminders, notes, or commitments.

## Implementation Rules

- Inspect existing code before changing architecture.
- Keep edits scoped to the current phase.
- Prefer simple, understandable modules over premature abstraction.
- Use real database records for task, reminder, note, and calendar behavior.
- Document environment variables when adding new services.
- Make mobile layouts first-class.

## Verification Rules

- For each phase, run the app and test the main workflow.
- Run `npm run build` before reporting completion when dependencies are available.
- Check RLS whenever schema changes.
- Report known limitations plainly.

