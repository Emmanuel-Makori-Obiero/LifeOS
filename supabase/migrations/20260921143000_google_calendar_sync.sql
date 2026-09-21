create table public.google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_account_email text,
  access_token text,
  refresh_token text not null,
  expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.google_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.google_calendar_syncs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('task', 'lesson', 'calendar_event', 'reminder')),
  source_id uuid not null,
  google_event_id text not null,
  google_event_link text,
  synced_at timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);

create trigger google_calendar_connections_updated_at
before update on public.google_calendar_connections
for each row execute function public.set_updated_at();

alter table public.google_calendar_connections enable row level security;
alter table public.google_oauth_states enable row level security;
alter table public.google_calendar_syncs enable row level security;

create policy "Users can see their Google connection status"
on public.google_calendar_connections
for select
using (auth.uid() = user_id);

create policy "Users can delete their Google connection"
on public.google_calendar_connections
for delete
using (auth.uid() = user_id);

create policy "OAuth states are service managed"
on public.google_oauth_states
for all
using (false)
with check (false);

create policy "Users can read their Google sync records"
on public.google_calendar_syncs
for select
using (auth.uid() = user_id);
