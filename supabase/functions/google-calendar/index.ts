import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const rawAppOrigin = Deno.env.get('APP_ORIGIN') ?? ''
const appOrigin = rawAppOrigin.replace(/\/+$/, '')

const baseCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

function getCorsHeaders(request?: Request) {
  const reqOrigin = request?.headers.get('Origin')
  return {
    ...baseCorsHeaders,
    'Access-Control-Allow-Origin': reqOrigin || appOrigin || '*'
  }
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const googleRedirectUri = Deno.env.get('GOOGLE_REDIRECT_URI') ?? ''

const serviceClient = createClient(supabaseUrl, serviceRoleKey)

type SourceType = 'task' | 'lesson' | 'calendar_event' | 'reminder'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(request) })
  }

  try {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.searchParams.has('code')) {
      return handleCallback(url)
    }

    const body = await request.json()
    if (body.action === 'auth-url') return handleAuthUrl(request)
    if (body.action === 'sync') return handleSync(request, body.sourceType, body.sourceId)

    return json({ error: 'Unknown action' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})

async function handleAuthUrl(request: Request) {
  const user = await getUser(request)
  const state = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error } = await serviceClient.from('google_oauth_states').insert({
    state,
    user_id: user.id,
    expires_at: expiresAt
  })
  if (error) throw error

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: googleRedirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state
  })

  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` })
}

async function handleCallback(url: URL) {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return redirectWithStatus('missing_oauth_params')

  const { data: stateRow, error: stateError } = await serviceClient
    .from('google_oauth_states')
    .select('*')
    .eq('state', state)
    .single()
  if (stateError || !stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
    return redirectWithStatus('invalid_oauth_state')
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: googleRedirectUri,
      grant_type: 'authorization_code'
    })
  })

  if (!tokenResponse.ok) return redirectWithStatus('token_exchange_failed')
  const tokenData = await tokenResponse.json()
  if (!tokenData.refresh_token) return redirectWithStatus('missing_refresh_token')

  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  })
  const profile = profileResponse.ok ? await profileResponse.json() : {}

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : null

  const { error: upsertError } = await serviceClient.from('google_calendar_connections').upsert({
    user_id: stateRow.user_id,
    google_account_email: profile.email ?? null,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
    scope: tokenData.scope ?? null
  })
  if (upsertError) return redirectWithStatus('connection_save_failed')

  await serviceClient.from('google_oauth_states').delete().eq('state', state)
  return redirectWithStatus('connected')
}

async function handleSync(request: Request, sourceType: SourceType, sourceId: string) {
  const user = await getUser(request)
  const { data: connection, error: connectionError } = await serviceClient
    .from('google_calendar_connections')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (connectionError || !connection) return json({ error: 'Google Calendar is not connected.' }, 400)

  const accessToken = await getFreshAccessToken(connection)
  const event = await buildEventForSource(user.id, sourceType, sourceId)

  const googleResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  })

  if (!googleResponse.ok) {
    const detail = await googleResponse.text()
    return json({ error: 'Google Calendar sync failed.', detail }, 400)
  }

  const googleEvent = await googleResponse.json()
  await serviceClient.from('google_calendar_syncs').upsert({
    user_id: user.id,
    source_type: sourceType,
    source_id: sourceId,
    google_event_id: googleEvent.id,
    google_event_link: googleEvent.htmlLink,
    synced_at: new Date().toISOString()
  })

  return json({ eventId: googleEvent.id, eventLink: googleEvent.htmlLink })
}

async function getUser(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) throw new Error('Missing Authorization header')

  const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } }
  })
  const { data, error } = await anonClient.auth.getUser()
  if (error || !data.user) throw new Error('Not authenticated')
  return data.user
}

async function getFreshAccessToken(connection: { refresh_token: string; expires_at: string | null; access_token: string | null; user_id: string }) {
  if (connection.access_token && connection.expires_at && new Date(connection.expires_at).getTime() > Date.now() + 60_000) {
    return connection.access_token
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token'
    })
  })
  if (!response.ok) throw new Error('Could not refresh Google access token')

  const data = await response.json()
  const expiresAt = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : null
  await serviceClient
    .from('google_calendar_connections')
    .update({ access_token: data.access_token, expires_at: expiresAt, scope: data.scope ?? null })
    .eq('user_id', connection.user_id)

  return data.access_token
}

async function buildEventForSource(userId: string, sourceType: SourceType, sourceId: string) {
  if (sourceType === 'task') {
    const { data, error } = await serviceClient.from('tasks').select('*').eq('user_id', userId).eq('id', sourceId).single()
    if (error || !data?.due_at) throw new Error('Task must have a due date before syncing.')
    return timedEvent(data.title, data.due_at, addMinutes(data.due_at, data.estimated_minutes ?? 30), data.description ?? 'LifeOS task')
  }

  if (sourceType === 'lesson') {
    const { data, error } = await serviceClient.from('lessons').select('*, courses(title)').eq('user_id', userId).eq('id', sourceId).single()
    if (error || !data?.scheduled_at) throw new Error('Study activity must have a scheduled time before syncing.')
    const courseTitle = data.courses?.title ? ` for ${data.courses.title}` : ''
    return timedEvent(`Study: ${data.title}`, data.scheduled_at, addMinutes(data.scheduled_at, 60), `LifeOS study activity${courseTitle}`)
  }

  if (sourceType === 'calendar_event') {
    const { data, error } = await serviceClient.from('calendar_events').select('*').eq('user_id', userId).eq('id', sourceId).single()
    if (error || !data) throw new Error('Calendar event not found.')
    return timedEvent(data.title, data.starts_at, data.ends_at, data.description ?? 'LifeOS calendar event')
  }

  const { data, error } = await serviceClient.from('reminders').select('*').eq('user_id', userId).eq('id', sourceId).single()
  if (error || !data) throw new Error('Reminder not found.')
  return timedEvent('LifeOS reminder', data.remind_at, addMinutes(data.remind_at, 10), 'LifeOS reminder')
}

function timedEvent(summary: string, startsAt: string, endsAt: string, description: string) {
  return {
    summary,
    description,
    start: { dateTime: startsAt },
    end: { dateTime: endsAt },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 10 },
        { method: 'email', minutes: 30 }
      ]
    }
  }
}

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60 * 1000).toISOString()
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...baseCorsHeaders, 'Content-Type': 'application/json' }
  })
}

function redirectWithStatus(status: string) {
  return Response.redirect(`${appOrigin || '/'}?google_calendar=${encodeURIComponent(status)}`, 302)
}
