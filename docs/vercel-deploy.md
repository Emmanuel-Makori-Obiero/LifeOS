# Deploy LifeOS To Vercel

LifeOS is a Vite React app, so Vercel can build it directly.

## Vercel Project Settings

Use these settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

## Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

These are safe to expose because Supabase anon access is protected by Row Level Security.

Do not put Google OAuth client secrets in Vercel for this app. The Google Calendar sync secret values belong in Supabase Edge Function secrets.

## Google Calendar Sync After Deploy

When the Vercel deployment has a real URL, update the Supabase Edge Function secret:

```bash
APP_ORIGIN=https://your-vercel-domain.vercel.app
```

Keep this redirect URI in Google Cloud Console and Supabase secrets:

```text
https://your-project-ref.functions.supabase.co/google-calendar
```

## Required Supabase Setup

Run both migrations in Supabase SQL Editor:

```text
supabase/migrations/20260921130000_initial_lifeos_schema.sql
supabase/migrations/20260921143000_google_calendar_sync.sql
```

Deploy or create the Supabase Edge Function named:

```text
google-calendar
```

## Notes

The `vercel.json` file rewrites all routes to `index.html`, which is recommended for Vite single-page apps on Vercel so refreshes do not produce 404s.
