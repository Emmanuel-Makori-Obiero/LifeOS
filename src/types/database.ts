export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'deferred' | 'cancelled'
export type TaskKind = 'macro' | 'micro'
export type ReminderStatus = 'pending' | 'sent' | 'dismissed'

export interface Task {
  id: string
  user_id: string
  parent_task_id: string | null
  project_id: string | null
  goal_id: string | null
  course_id: string | null
  title: string
  description: string | null
  kind: TaskKind
  status: TaskStatus
  priority: Priority
  due_at: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  estimated_minutes: number | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  user_id: string
  task_id: string | null
  project_id: string | null
  title: string
  body: string
  created_at: string
  updated_at: string
}

export interface Reminder {
  id: string
  user_id: string
  task_id: string | null
  calendar_event_id: string | null
  note_id: string | null
  remind_at: string
  channel: string
  status: ReminderStatus
  created_at: string
}

export interface CalendarEvent {
  id: string
  user_id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  created_at: string
  updated_at: string
}

export interface Course {
  id: string
  user_id: string
  title: string
  code: string | null
  term: string | null
  created_at: string
  updated_at: string
}

export interface Lesson {
  id: string
  user_id: string
  course_id: string | null
  title: string
  scheduled_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface GoogleCalendarConnection {
  user_id: string
  google_account_email: string | null
  expires_at: string | null
  scope: string | null
  created_at: string
  updated_at: string
}

export interface GoogleCalendarSync {
  id: string
  user_id: string
  source_type: 'task' | 'lesson' | 'calendar_event' | 'reminder'
  source_id: string
  google_event_id: string
  google_event_link: string | null
  synced_at: string
}
