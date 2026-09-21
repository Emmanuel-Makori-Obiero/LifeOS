create extension if not exists pgcrypto;

create type public.priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_status as enum ('todo', 'in_progress', 'done', 'deferred', 'cancelled');
create type public.task_kind as enum ('macro', 'micro');
create type public.reminder_status as enum ('pending', 'sent', 'dismissed');
create type public.ai_message_role as enum ('user', 'assistant', 'system');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id = auth.uid();
  end if;
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Africa/Nairobi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  title text not null,
  description text,
  target_date date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  goal_id uuid references public.goals(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'active',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  code text,
  term text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  title text not null,
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  goal_id uuid references public.goals(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  description text,
  kind public.task_kind not null default 'micro',
  status public.task_status not null default 'todo',
  priority public.priority not null default 'medium',
  due_at timestamptz,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_task_id is null or kind = 'micro')
);

create table public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  calendar_event_id uuid references public.calendar_events(id) on delete cascade,
  note_id uuid references public.notes(id) on delete cascade,
  remind_at timestamptz not null,
  channel text not null default 'in_app',
  status public.reminder_status not null default 'pending',
  created_at timestamptz not null default now(),
  check (task_id is not null or calendar_event_id is not null or note_id is not null)
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  cadence text not null default 'daily',
  target_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_available_minutes integer not null default 45,
  notification_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Assistant chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role public.ai_message_role not null,
  content text not null,
  proposed_action jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index tasks_user_due_idx on public.tasks(user_id, due_at);
create index tasks_parent_idx on public.tasks(parent_task_id);
create index calendar_events_user_start_idx on public.calendar_events(user_id, starts_at);
create index reminders_user_remind_idx on public.reminders(user_id, remind_at, status);
create index notes_user_created_idx on public.notes(user_id, created_at desc);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger areas_updated_at before update on public.areas for each row execute function public.set_updated_at();
create trigger goals_updated_at before update on public.goals for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger milestones_updated_at before update on public.milestones for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses for each row execute function public.set_updated_at();
create trigger lessons_updated_at before update on public.lessons for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger calendar_events_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();
create trigger notes_updated_at before update on public.notes for each row execute function public.set_updated_at();
create trigger habits_updated_at before update on public.habits for each row execute function public.set_updated_at();
create trigger user_preferences_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
create trigger ai_conversations_updated_at before update on public.ai_conversations for each row execute function public.set_updated_at();

create trigger areas_set_user_id before insert on public.areas for each row execute function public.set_user_id();
create trigger goals_set_user_id before insert on public.goals for each row execute function public.set_user_id();
create trigger projects_set_user_id before insert on public.projects for each row execute function public.set_user_id();
create trigger milestones_set_user_id before insert on public.milestones for each row execute function public.set_user_id();
create trigger courses_set_user_id before insert on public.courses for each row execute function public.set_user_id();
create trigger lessons_set_user_id before insert on public.lessons for each row execute function public.set_user_id();
create trigger tasks_set_user_id before insert on public.tasks for each row execute function public.set_user_id();
create trigger task_dependencies_set_user_id before insert on public.task_dependencies for each row execute function public.set_user_id();
create trigger calendar_events_set_user_id before insert on public.calendar_events for each row execute function public.set_user_id();
create trigger notes_set_user_id before insert on public.notes for each row execute function public.set_user_id();
create trigger reminders_set_user_id before insert on public.reminders for each row execute function public.set_user_id();
create trigger habits_set_user_id before insert on public.habits for each row execute function public.set_user_id();
create trigger ai_conversations_set_user_id before insert on public.ai_conversations for each row execute function public.set_user_id();
create trigger ai_messages_set_user_id before insert on public.ai_messages for each row execute function public.set_user_id();

alter table public.profiles enable row level security;
alter table public.areas enable row level security;
alter table public.goals enable row level security;
alter table public.projects enable row level security;
alter table public.milestones enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.calendar_events enable row level security;
alter table public.notes enable row level security;
alter table public.reminders enable row level security;
alter table public.habits enable row level security;
alter table public.user_preferences enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy "Profiles are owned by user" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "Preferences are owned by user" on public.user_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Areas are owned by user" on public.areas for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Goals are owned by user" on public.goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Projects are owned by user" on public.projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Milestones are owned by user" on public.milestones for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Courses are owned by user" on public.courses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Lessons are owned by user" on public.lessons for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Tasks are owned by user" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Task dependencies are owned by user" on public.task_dependencies for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Calendar events are owned by user" on public.calendar_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Notes are owned by user" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Reminders are owned by user" on public.reminders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Habits are owned by user" on public.habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "AI conversations are owned by user" on public.ai_conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "AI messages are owned by user" on public.ai_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
