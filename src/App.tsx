import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CalendarDays,
  Check,
  Clock,
  Download,
  ExternalLink,
  LogOut,
  NotebookPen,
  Plus,
  School,
  Sparkles,
  Target,
  TimerReset
} from 'lucide-react'
import { format, isBefore, isToday, parseISO } from 'date-fns'
import type { Session } from '@supabase/supabase-js'
import { chooseNextTask } from './lib/recommendations'
import { requestReminderPermission } from './lib/notifications'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import type {
  CalendarEvent,
  Course,
  GoogleCalendarConnection,
  GoogleCalendarSync,
  Lesson,
  Note,
  Priority,
  Reminder,
  Task,
  TaskKind
} from './types/database'

const priorityOptions: Priority[] = ['low', 'medium', 'high', 'urgent']

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function toGoogleDate(value: Date) {
  return value.toISOString().replace(/[-:]|\.\d{3}/g, '')
}

function buildGoogleCalendarUrl({
  title,
  startsAt,
  endsAt,
  details
}: {
  title: string
  startsAt: string
  endsAt?: string | null
  details?: string
}) {
  const start = new Date(startsAt)
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 30 * 60 * 1000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
    details: details ?? 'Created from LifeOS. Set Google Calendar notifications for reliable alarms.'
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoadingSession(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loadingSession) {
    return <CenteredMessage title="Starting LifeOS" body="Checking your session." />
  }

  if (!hasSupabaseConfig) {
    return (
      <CenteredMessage
        title="Supabase is not configured"
        body="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, then run the database migration."
      />
    )
  }

  if (!session) {
    return <AuthScreen />
  }

  return <LifeOS session={session} />
}

function AuthScreen() {
  const installPrompt = useInstallPrompt()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!supabase) return
    setBusy(true)
    setStatus('')
    const authCall =
      mode === 'sign-in'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password })

    const { error } = await authCall
    setBusy(false)
    setStatus(error ? error.message : mode === 'sign-up' ? 'Account created. Check email confirmation settings in Supabase.' : '')
  }

  return (
    <main className="min-h-screen bg-panel px-4 py-10">
      <section className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-cyan-200 bg-white px-3 py-2 text-sm font-semibold text-cyan-800">
            <Sparkles size={16} />
            LifeOS
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
            One calm place for tasks, deadlines, study plans, reminders, and decisions.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Built to turn a messy list of obligations into one clear next action, backed by your own database.
          </p>
          <div className="mt-6">
            <InstallButton installPrompt={installPrompt} />
          </div>
        </div>

        <div className="panel p-6">
          <div className="mb-5 flex rounded-md bg-slate-100 p-1">
            <button
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${mode === 'sign-in' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
              onClick={() => setMode('sign-in')}
            >
              Sign in
            </button>
            <button
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${mode === 'sign-up' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}
              onClick={() => setMode('sign-up')}
            >
              Create account
            </button>
          </div>
          <label className="mb-3 block text-sm font-semibold text-slate-700">
            Email
            <input className="input mt-1" value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
          </label>
          <label className="mb-5 block text-sm font-semibold text-slate-700">
            Password
            <input
              className="input mt-1"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
            />
          </label>
          <button className="primary-button w-full" disabled={busy || !email || !password} onClick={submit}>
            {busy ? 'Working' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
          {status && <p className="mt-4 text-sm text-slate-600">{status}</p>}
        </div>
      </section>
    </main>
  )
}

function LifeOS({ session }: { session: Session }) {
  const installPrompt = useInstallPrompt()
  const [tasks, setTasks] = useState<Task[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [googleConnection, setGoogleConnection] = useState<GoogleCalendarConnection | null>(null)
  const [googleSyncs, setGoogleSyncs] = useState<GoogleCalendarSync[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [availableMinutes, setAvailableMinutes] = useState(45)

  async function loadData() {
    if (!supabase) return
    setLoading(true)
    const [taskResult, noteResult, eventResult, reminderResult, courseResult, lessonResult, connectionResult, syncResult] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('notes').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('calendar_events').select('*').order('starts_at', { ascending: true }).limit(20),
      supabase.from('reminders').select('*').order('remind_at', { ascending: true }).limit(20),
      supabase.from('courses').select('*').order('created_at', { ascending: false }),
      supabase.from('lessons').select('*').order('scheduled_at', { ascending: true, nullsFirst: false }).limit(30),
      supabase.from('google_calendar_connections').select('user_id, google_account_email, expires_at, scope, created_at, updated_at').maybeSingle(),
      supabase.from('google_calendar_syncs').select('*').order('synced_at', { ascending: false }).limit(100)
    ])

    setLoading(false)
    const firstError =
      taskResult.error ||
      noteResult.error ||
      eventResult.error ||
      reminderResult.error ||
      courseResult.error ||
      lessonResult.error ||
      connectionResult.error ||
      syncResult.error
    if (firstError) {
      setError(firstError.message)
      return
    }

    setTasks((taskResult.data ?? []) as Task[])
    setNotes((noteResult.data ?? []) as Note[])
    setEvents((eventResult.data ?? []) as CalendarEvent[])
    setReminders((reminderResult.data ?? []) as Reminder[])
    setCourses((courseResult.data ?? []) as Course[])
    setLessons((lessonResult.data ?? []) as Lesson[])
    setGoogleConnection((connectionResult.data ?? null) as GoogleCalendarConnection | null)
    setGoogleSyncs((syncResult.data ?? []) as GoogleCalendarSync[])
  }

  useEffect(() => {
    loadData()
  }, [])

  const recommendation = useMemo(() => chooseNextTask(tasks, availableMinutes), [tasks, availableMinutes])
  const openTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled')
  const todayTasks = openTasks.filter((task) => task.due_at && isToday(parseISO(task.due_at)))
  const overdueTasks = openTasks.filter((task) => task.due_at && isBefore(parseISO(task.due_at), new Date()) && !isToday(parseISO(task.due_at)))
  const openLessons = lessons.filter((lesson) => !lesson.completed_at)

  async function completeTask(task: Task) {
    if (!supabase) return
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', task.id)
    if (updateError) setError(updateError.message)
    await loadData()
  }

  async function completeLesson(lesson: Lesson) {
    if (!supabase) return
    const { error: updateError } = await supabase
      .from('lessons')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', lesson.id)
    if (updateError) setError(updateError.message)
    await loadData()
  }

  async function signOut() {
    await supabase?.auth.signOut()
  }

  async function connectGoogleCalendar() {
    if (!supabase) return
    setNotice('')
    const { data, error: functionError } = await supabase.functions.invoke('google-calendar', {
      body: { action: 'auth-url' }
    })
    if (functionError) {
      setError(functionError.message)
      return
    }
    window.location.href = data.url
  }

  async function syncGoogleCalendar(sourceType: GoogleCalendarSync['source_type'], sourceId: string) {
    if (!supabase) return
    setNotice('')
    const { data, error: functionError } = await supabase.functions.invoke('google-calendar', {
      body: { action: 'sync', sourceType, sourceId }
    })
    if (functionError) {
      setError(functionError.message)
      return
    }
    setNotice(data?.eventLink ? 'Synced to Google Calendar.' : 'Sync complete.')
    await loadData()
  }

  return (
    <div className="min-h-screen bg-panel">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-cyan-200">
              <Sparkles size={20} />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-950">LifeOS</p>
              <p className="text-xs text-slate-500">{session.user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <InstallButton installPrompt={installPrompt} compact />
            <button className="icon-button" title="Sign out" onClick={signOut}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <section className="space-y-6">
          <section className="panel p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-cyan-700">What should I do now?</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">
                  {recommendation ? recommendation.task.title : 'You have no matching open task.'}
                </h1>
                {recommendation && (
                  <p className="mt-2 text-sm text-slate-600">
                    Estimated time: {recommendation.task.estimated_minutes ?? 'not set'} minutes. Reason: {recommendation.reason}.
                  </p>
                )}
              </div>
              <label className="min-w-36 text-sm font-semibold text-slate-700">
                Available time
                <select
                  className="input mt-1"
                  value={availableMinutes}
                  onChange={(event) => setAvailableMinutes(Number(event.target.value))}
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                </select>
              </label>
            </div>
          </section>

          {error && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}

          <GoogleCalendarPanel connection={googleConnection} onConnect={connectGoogleCalendar} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric icon={<Target size={18} />} label="Open tasks" value={openTasks.length} />
            <Metric icon={<Clock size={18} />} label="Today" value={todayTasks.length} />
            <Metric icon={<TimerReset size={18} />} label="Overdue" value={overdueTasks.length} />
            <Metric icon={<School size={18} />} label="Study" value={openLessons.length} />
          </div>

          <QuickCapture onSaved={loadData} />

          <section className="grid gap-6 xl:grid-cols-2">
            <TaskList
              title="Today"
              tasks={todayTasks}
              allTasks={tasks}
              syncs={googleSyncs}
              onComplete={completeTask}
              onSync={syncGoogleCalendar}
              loading={loading}
            />
            <TaskList
              title="Overdue"
              tasks={overdueTasks}
              allTasks={tasks}
              syncs={googleSyncs}
              onComplete={completeTask}
              onSync={syncGoogleCalendar}
              loading={loading}
            />
          </section>

          <MacroTaskProgress tasks={tasks} onComplete={completeTask} />
          <StudyPanel courses={courses} lessons={lessons} syncs={googleSyncs} onSaved={loadData} onComplete={completeLesson} onSync={syncGoogleCalendar} />
        </section>

        <aside className="space-y-6">
          <TaskCreator tasks={tasks} onSaved={loadData} />
          <NotesPanel notes={notes} onSaved={loadData} />
          <CalendarPanel events={events} syncs={googleSyncs} onSaved={loadData} onSync={syncGoogleCalendar} />
          <ReminderPanel tasks={tasks} events={events} notes={notes} reminders={reminders} syncs={googleSyncs} onSaved={loadData} onSync={syncGoogleCalendar} />
        </aside>
      </main>
    </div>
  )
}

function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && Boolean(window.navigator.standalone))

    if (standalone) {
      setInstalled(true)
      return
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
      setStatus('')
    }

    function handleInstalled() {
      setInstalled(true)
      setPromptEvent(null)
      setStatus('LifeOS is installed.')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  async function install() {
    if (installed) {
      setStatus('LifeOS is already installed.')
      return
    }

    if (!promptEvent) {
      setStatus('Install is available after the browser confirms this PWA is eligible.')
      return
    }

    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    setPromptEvent(null)
    setStatus(choice.outcome === 'accepted' ? 'LifeOS is installing.' : 'Install dismissed.')
  }

  return {
    canInstall: Boolean(promptEvent),
    installed,
    status,
    install
  }
}

function InstallButton({
  installPrompt,
  compact = false
}: {
  installPrompt: ReturnType<typeof useInstallPrompt>
  compact?: boolean
}) {
  const label = installPrompt.installed ? 'Installed' : 'Install app'
  const title = installPrompt.canInstall
    ? 'Install LifeOS'
    : installPrompt.installed
      ? 'LifeOS is installed'
      : 'Install prompt is not available yet'

  if (compact) {
    return (
      <button className="icon-button" title={title} onClick={installPrompt.install}>
        <Download size={18} />
      </button>
    )
  }

  return (
    <div>
      <button className="secondary-button" onClick={installPrompt.install}>
        <Download size={16} />
        {label}
      </button>
      {installPrompt.status && <p className="mt-2 text-sm text-slate-500">{installPrompt.status}</p>}
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="panel p-4">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">{icon}</div>
      <p className="text-2xl font-semibold text-slate-950">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  )
}

function GoogleCalendarPanel({
  connection,
  onConnect
}: {
  connection: GoogleCalendarConnection | null
  onConnect: () => void
}) {
  return (
    <section className="panel p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <CalendarDays size={18} />
            Google Calendar sync
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {connection
              ? `Connected${connection.google_account_email ? ` as ${connection.google_account_email}` : ''}. LifeOS can create Google Calendar events for alarms.`
              : 'Connect Google Calendar to create synced events with Google notifications.'}
          </p>
        </div>
        <button className="secondary-button shrink-0" onClick={onConnect}>
          <ExternalLink size={16} />
          {connection ? 'Reconnect' : 'Connect Google'}
        </button>
      </div>
    </section>
  )
}

function GoogleSyncButton({
  sourceType,
  sourceId,
  syncs,
  onSync,
  disabled = false
}: {
  sourceType: GoogleCalendarSync['source_type']
  sourceId: string
  syncs: GoogleCalendarSync[]
  onSync: (sourceType: GoogleCalendarSync['source_type'], sourceId: string) => void
  disabled?: boolean
}) {
  const sync = syncs.find((candidate) => candidate.source_type === sourceType && candidate.source_id === sourceId)

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button className="secondary-button px-2.5 py-1.5 text-xs" disabled={disabled} onClick={() => onSync(sourceType, sourceId)}>
        <CalendarDays size={13} />
        {sync ? 'Sync again' : 'Sync to Google'}
      </button>
      {sync?.google_event_link && (
        <a className="text-xs font-semibold text-cyan-700 hover:text-cyan-900" href={sync.google_event_link} target="_blank" rel="noreferrer">
          Open synced event
        </a>
      )}
    </div>
  )
}

function QuickCapture({ onSaved }: { onSaved: () => void }) {
  const [title, setTitle] = useState('')

  async function save() {
    if (!supabase || !title.trim()) return
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      kind: 'micro',
      priority: 'medium',
      status: 'todo'
    })
    if (!error) {
      setTitle('')
      onSaved()
    }
  }

  return (
    <section className="panel p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className="input"
          placeholder="Quick capture a task before it escapes"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
          }}
        />
        <button className="primary-button sm:w-40" onClick={save}>
          <Plus size={16} />
          Capture
        </button>
      </div>
    </section>
  )
}

function TaskCreator({ tasks, onSaved }: { tasks: Task[]; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TaskKind>('micro')
  const [priority, setPriority] = useState<Priority>('medium')
  const [dueAt, setDueAt] = useState('')
  const [estimatedMinutes, setEstimatedMinutes] = useState(45)
  const [parentTaskId, setParentTaskId] = useState('')

  async function saveTask() {
    if (!supabase || !title.trim()) return
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      kind,
      priority,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      estimated_minutes: estimatedMinutes,
      parent_task_id: parentTaskId || null,
      status: 'todo'
    })
    if (!error) {
      setTitle('')
      setDueAt('')
      setParentTaskId('')
      onSaved()
    }
  }

  return (
    <section className="panel p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-950">
        <Plus size={18} />
        New task
      </h2>
      <div className="space-y-3">
        <input className="input" placeholder="Task title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <select className="input" value={kind} onChange={(event) => setKind(event.target.value as TaskKind)}>
            <option value="micro">Micro</option>
            <option value="macro">Macro</option>
          </select>
          <select className="input" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
            {priorityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <input className="input" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        <input
          className="input"
          type="number"
          min="5"
          step="5"
          value={estimatedMinutes}
          onChange={(event) => setEstimatedMinutes(Number(event.target.value))}
        />
        <select className="input" value={parentTaskId} onChange={(event) => setParentTaskId(event.target.value)}>
          <option value="">No macro parent</option>
          {tasks
            .filter((task) => task.kind === 'macro')
            .map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
        </select>
        <button className="primary-button w-full" onClick={saveTask}>
          Save task
        </button>
      </div>
    </section>
  )
}

function TaskList({
  title,
  tasks,
  allTasks,
  syncs,
  onComplete,
  onSync,
  loading
}: {
  title: string
  tasks: Task[]
  allTasks: Task[]
  syncs: GoogleCalendarSync[]
  onComplete: (task: Task) => void
  onSync: (sourceType: GoogleCalendarSync['source_type'], sourceId: string) => void
  loading: boolean
}) {
  return (
    <section className="panel p-5">
      <h2 className="mb-4 text-lg font-semibold text-slate-950">{title}</h2>
      {loading && <p className="text-sm text-slate-500">Loading tasks.</p>}
      {!loading && tasks.length === 0 && <p className="text-sm text-slate-500">Nothing here right now.</p>}
      <div className="space-y-3">
        {tasks.map((task) => {
          const parent = allTasks.find((candidate) => candidate.id === task.parent_task_id)
          return <TaskRow key={task.id} task={task} parentTitle={parent?.title} syncs={syncs} onComplete={onComplete} onSync={onSync} />
        })}
      </div>
    </section>
  )
}

function TaskRow({
  task,
  parentTitle,
  syncs,
  onComplete,
  onSync
}: {
  task: Task
  parentTitle?: string
  syncs: GoogleCalendarSync[]
  onComplete: (task: Task) => void
  onSync: (sourceType: GoogleCalendarSync['source_type'], sourceId: string) => void
}) {
  return (
    <article className="rounded-md border border-slate-200 p-3">
      <div className="flex items-start gap-3">
        <button className="icon-button h-8 w-8 shrink-0" title="Complete task" onClick={() => onComplete(task)}>
          <Check size={15} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-slate-950">{task.title}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded bg-slate-100 px-2 py-1">{task.priority}</span>
            <span className="rounded bg-slate-100 px-2 py-1">{task.estimated_minutes ?? '?'} min</span>
            {task.due_at && <span className="rounded bg-slate-100 px-2 py-1">{format(parseISO(task.due_at), 'MMM d, h:mm a')}</span>}
          </div>
          {task.due_at && (
            <>
              <GoogleSyncButton sourceType="task" sourceId={task.id} syncs={syncs} onSync={onSync} />
              <GoogleCalendarLink
                className="mt-2"
                href={buildGoogleCalendarUrl({
                  title: task.title,
                  startsAt: task.due_at,
                  endsAt: new Date(parseISO(task.due_at).getTime() + (task.estimated_minutes ?? 30) * 60 * 1000).toISOString(),
                  details: task.description ?? 'LifeOS task. Add Google Calendar notifications for alarms.'
                })}
              />
            </>
          )}
          {parentTitle && <p className="mt-2 text-xs text-slate-500">Part of {parentTitle}</p>}
        </div>
      </div>
    </article>
  )
}

function MacroTaskProgress({ tasks, onComplete }: { tasks: Task[]; onComplete: (task: Task) => void }) {
  const macros = tasks.filter((task) => task.kind === 'macro')

  return (
    <section className="panel p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-950">
        <Target size={18} />
        Macro tasks
      </h2>
      {macros.length === 0 && <p className="text-sm text-slate-500">Create a macro task, then attach micro tasks to see progress.</p>}
      <div className="space-y-4">
        {macros.map((macro) => {
          const children = tasks.filter((task) => task.parent_task_id === macro.id)
          const done = children.filter((task) => task.status === 'done').length
          const progress = children.length > 0 ? Math.round((done / children.length) * 100) : 0
          return (
            <article key={macro.id} className="rounded-md border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{macro.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{done}/{children.length} micro tasks complete</p>
                </div>
                <button className="secondary-button px-3 py-2" onClick={() => onComplete(macro)}>
                  <Check size={15} />
                </button>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-cyan-500" style={{ width: `${progress}%` }} />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function NotesPanel({ notes, onSaved }: { notes: Note[]; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  async function saveNote() {
    if (!supabase || !title.trim()) return
    const { error } = await supabase.from('notes').insert({ title: title.trim(), body })
    if (!error) {
      setTitle('')
      setBody('')
      onSaved()
    }
  }

  return (
    <section className="panel p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-950">
        <NotebookPen size={18} />
        Notes
      </h2>
      <div className="space-y-3">
        <input className="input" placeholder="Note title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <textarea className="input min-h-24 resize-y" placeholder="Memory, idea, context" value={body} onChange={(event) => setBody(event.target.value)} />
        <button className="secondary-button w-full" onClick={saveNote}>
          Save note
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {notes.slice(0, 3).map((note) => (
          <article key={note.id} className="rounded-md bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-950">{note.title}</p>
            <p className="mt-1 line-clamp-2 text-sm text-slate-500">{note.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function StudyPanel({
  courses,
  lessons,
  syncs,
  onSaved,
  onComplete,
  onSync
}: {
  courses: Course[]
  lessons: Lesson[]
  syncs: GoogleCalendarSync[]
  onSaved: () => void
  onComplete: (lesson: Lesson) => void
  onSync: (sourceType: GoogleCalendarSync['source_type'], sourceId: string) => void
}) {
  const [courseTitle, setCourseTitle] = useState('')
  const [lessonTitle, setLessonTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')

  async function saveCourse() {
    if (!supabase || !courseTitle.trim()) return
    const { error } = await supabase.from('courses').insert({ title: courseTitle.trim() })
    if (!error) {
      setCourseTitle('')
      onSaved()
    }
  }

  async function saveLesson() {
    if (!supabase || !lessonTitle.trim()) return
    const { error } = await supabase.from('lessons').insert({
      title: lessonTitle.trim(),
      course_id: courseId || null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null
    })
    if (!error) {
      setLessonTitle('')
      setScheduledAt('')
      onSaved()
    }
  }

  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
          <School size={18} />
          Study activities
        </h2>
        <span className="rounded bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700">
          {lessons.filter((lesson) => !lesson.completed_at).length} open
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-700">Add course</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="input"
              placeholder="Constitutional Law"
              value={courseTitle}
              onChange={(event) => setCourseTitle(event.target.value)}
            />
            <button className="secondary-button sm:w-28" onClick={saveCourse}>
              Add
            </button>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-700">Add lesson or study block</p>
          <div className="space-y-3">
            <input
              className="input"
              placeholder="Read Topic 2 cases"
              value={lessonTitle}
              onChange={(event) => setLessonTitle(event.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select className="input" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                <option value="">No course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              <input className="input" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
            </div>
            <button className="primary-button w-full" onClick={saveLesson}>
              Save study activity
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {lessons.length === 0 && <p className="text-sm text-slate-500">No study activities yet.</p>}
        {lessons.map((lesson) => {
          const course = courses.find((candidate) => candidate.id === lesson.course_id)
          return (
            <article key={lesson.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-start gap-3">
                <button
                  className="icon-button h-8 w-8 shrink-0"
                  title={lesson.completed_at ? 'Study activity complete' : 'Check off study activity'}
                  disabled={Boolean(lesson.completed_at)}
                  onClick={() => onComplete(lesson)}
                >
                  <Check size={15} />
                </button>
                <div className="min-w-0">
                  <p className={`break-words text-sm font-semibold ${lesson.completed_at ? 'text-slate-400 line-through' : 'text-slate-950'}`}>
                    {lesson.title}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    {course && <span className="rounded bg-slate-100 px-2 py-1">{course.title}</span>}
                    {lesson.scheduled_at && (
                      <span className="rounded bg-slate-100 px-2 py-1">{format(parseISO(lesson.scheduled_at), 'MMM d, h:mm a')}</span>
                    )}
                    {lesson.completed_at && <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">checked</span>}
                  </div>
                  {lesson.scheduled_at && (
                    <>
                      <GoogleSyncButton sourceType="lesson" sourceId={lesson.id} syncs={syncs} onSync={onSync} />
                      <GoogleCalendarLink
                        className="mt-2"
                        href={buildGoogleCalendarUrl({
                          title: `Study: ${lesson.title}`,
                          startsAt: lesson.scheduled_at,
                          endsAt: new Date(parseISO(lesson.scheduled_at).getTime() + 60 * 60 * 1000).toISOString(),
                          details: course ? `LifeOS study activity for ${course.title}. Set Google Calendar notifications for alarms.` : undefined
                        })}
                      />
                    </>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function CalendarPanel({
  events,
  syncs,
  onSaved,
  onSync
}: {
  events: CalendarEvent[]
  syncs: GoogleCalendarSync[]
  onSaved: () => void
  onSync: (sourceType: GoogleCalendarSync['source_type'], sourceId: string) => void
}) {
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  async function saveEvent() {
    if (!supabase || !title.trim() || !startsAt || !endsAt) return
    const { error } = await supabase.from('calendar_events').insert({
      title: title.trim(),
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString()
    })
    if (!error) {
      setTitle('')
      setStartsAt('')
      setEndsAt('')
      onSaved()
    }
  }

  return (
    <section className="panel p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-950">
        <CalendarDays size={18} />
        Calendar
      </h2>
      <div className="space-y-3">
        <input className="input" placeholder="Event title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input className="input" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          <input className="input" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
        </div>
        <button className="secondary-button w-full" onClick={saveEvent}>
          Save event
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {events.length === 0 && <p className="text-sm text-slate-500">No calendar events yet.</p>}
        {events.slice(0, 5).map((event) => (
          <article key={event.id} className="rounded-md border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-950">{event.title}</p>
            <p className="mt-1 text-xs text-slate-500">
              {format(parseISO(event.starts_at), 'MMM d, h:mm a')} to {format(parseISO(event.ends_at), 'h:mm a')}
            </p>
            <GoogleSyncButton sourceType="calendar_event" sourceId={event.id} syncs={syncs} onSync={onSync} />
            <GoogleCalendarLink
              className="mt-2"
              href={buildGoogleCalendarUrl({
                title: event.title,
                startsAt: event.starts_at,
                endsAt: event.ends_at,
                details: event.description ?? 'LifeOS calendar event. Set Google Calendar notifications for alarms.'
              })}
            />
          </article>
        ))}
      </div>
    </section>
  )
}

function ReminderPanel({
  tasks,
  events,
  notes,
  reminders,
  syncs,
  onSaved,
  onSync
}: {
  tasks: Task[]
  events: CalendarEvent[]
  notes: Note[]
  reminders: Reminder[]
  syncs: GoogleCalendarSync[]
  onSaved: () => void
  onSync: (sourceType: GoogleCalendarSync['source_type'], sourceId: string) => void
}) {
  const [status, setStatus] = useState('')
  const [remindAt, setRemindAt] = useState('')
  const [target, setTarget] = useState('')

  async function enableNotifications() {
    const permission = await requestReminderPermission()
    setStatus(
      permission === 'unsupported'
        ? 'This browser does not support notifications.'
        : permission === 'granted'
          ? 'Browser notifications are enabled while supported by the browser and PWA.'
          : 'Notification permission was not granted.'
    )
  }

  async function saveReminder() {
    if (!supabase || !remindAt || !target) return
    const [targetType, targetId] = target.split(':')
    const payload = {
      remind_at: new Date(remindAt).toISOString(),
      task_id: targetType === 'task' ? targetId : null,
      calendar_event_id: targetType === 'event' ? targetId : null,
      note_id: targetType === 'note' ? targetId : null
    }
    const { error } = await supabase.from('reminders').insert(payload)
    if (!error) {
      setRemindAt('')
      setTarget('')
      onSaved()
    }
  }

  return (
    <section className="panel p-5">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-950">
        <Bell size={18} />
        Reminders
      </h2>
      <p className="text-sm leading-6 text-slate-600">
        Browser notifications can support in-app reminders. They are not the same as guaranteed native phone alarms.
      </p>
      <div className="mt-4 space-y-3">
        <select className="input" value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">Attach reminder to</option>
          {tasks.map((task) => (
            <option key={task.id} value={`task:${task.id}`}>
              Task: {task.title}
            </option>
          ))}
          {events.map((event) => (
            <option key={event.id} value={`event:${event.id}`}>
              Event: {event.title}
            </option>
          ))}
          {notes.map((note) => (
            <option key={note.id} value={`note:${note.id}`}>
              Note: {note.title}
            </option>
          ))}
        </select>
        <input className="input" type="datetime-local" value={remindAt} onChange={(event) => setRemindAt(event.target.value)} />
        <button className="secondary-button w-full" onClick={saveReminder}>
          Save reminder
        </button>
      </div>
      <button className="secondary-button mt-4 w-full" onClick={enableNotifications}>
        Enable notifications
      </button>
      {status && <p className="mt-3 text-sm text-slate-500">{status}</p>}
      <div className="mt-4 space-y-3">
        {reminders.length === 0 && <p className="text-sm text-slate-500">No reminders scheduled yet.</p>}
        {reminders.slice(0, 5).map((reminder) => (
          <article key={reminder.id} className="rounded-md border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-950">{format(parseISO(reminder.remind_at), 'MMM d, h:mm a')}</p>
            <p className="mt-1 text-xs text-slate-500">{reminder.status}</p>
            <GoogleSyncButton sourceType="reminder" sourceId={reminder.id} syncs={syncs} onSync={onSync} />
            <GoogleCalendarLink
              className="mt-2"
              href={buildGoogleCalendarUrl({
                title: 'LifeOS reminder',
                startsAt: reminder.remind_at,
                endsAt: new Date(parseISO(reminder.remind_at).getTime() + 10 * 60 * 1000).toISOString(),
                details: 'LifeOS reminder. Use Google Calendar notifications for alarms.'
              })}
            />
          </article>
        ))}
      </div>
    </section>
  )
}

function GoogleCalendarLink({ href, className = '' }: { href: string; className?: string }) {
  return (
    <a
      className={`inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 focus-ring ${className}`}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      <ExternalLink size={13} />
      Add to Google Calendar
    </a>
  )
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-panel px-4">
      <section className="panel max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
      </section>
    </main>
  )
}

export default App
