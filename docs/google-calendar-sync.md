# Google Calendar Sync Setup

LifeOS keeps its own database and can optionally sync scheduled items into Google Calendar for Google notifications and alarms.

## What Sync Does

- Connects a user's Google Calendar account with OAuth.
- Stores the Google refresh token server-side in Supabase.
- Creates Google Calendar events from LifeOS tasks, study activities, calendar events, and reminders.
- Adds default Google Calendar event reminders: popup 10 minutes before and email 30 minutes before.

## Google Cloud Setup

1. Create or open a Google Cloud project.
2. Enable the Google Calendar API.
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 Client ID for a web application.
5. Add this authorized redirect URI:

```text
https://your-project-ref.functions.supabase.co/google-calendar
```

For local testing through a deployed Supabase function, keep the same redirect URI and set `APP_ORIGIN` to your local app URL.

## Supabase Setup

Apply both migrations:

```text
supabase/migrations/20260921130000_initial_lifeos_schema.sql
supabase/migrations/20260921143000_google_calendar_sync.sql
```

Deploy the function:

```bash
supabase functions deploy google-calendar
```

Set function secrets:

```bash
supabase secrets set GOOGLE_CLIENT_ID=your-google-oauth-client-id
supabase secrets set GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
supabase secrets set GOOGLE_REDIRECT_URI=https://your-project-ref.functions.supabase.co/google-calendar
supabase secrets set APP_ORIGIN=http://127.0.0.1:5173
```

For production, set `APP_ORIGIN` to your deployed LifeOS URL.

## Security Note

Google OAuth client secrets and refresh tokens must never be stored in frontend code. The Edge Function uses the Supabase service role server-side to store and refresh tokens.

For a hardened production version, move refresh-token storage to Supabase Vault or encrypted storage before broad release.
