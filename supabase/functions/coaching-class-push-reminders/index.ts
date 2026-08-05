import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import {
  buildClassScheduleSignature,
  hasPostClassResources,
  isReminderDueNow,
  type ClassNotificationRow,
} from '../coaching-center/class-notification.ts'
import {
  buildWeekActivationState,
  type CoachingSessionWeekActivationRow,
} from '../coaching-center/week-activation.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-reminder-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ReminderNotificationRow = {
  id: number
  session_id: string
  user_id: string
  week_number: number
  schedule_signature: string
  reminder_minutes: number
  scheduled_at: string | null
  class_join_url: string | null
  status: 'pending' | 'sent' | 'failed' | 'skipped'
}

type SessionRow = {
  id: string
  user_id: string
  status: string
  class_join_url: string | null
}

type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  is_active: boolean
}

type CoachingPreferenceRow = {
  active_session_enabled: boolean
}

type ProfileTimezoneRow = {
  timezone: string | null
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}

function getCallSecret(req: Request): string {
  const customHeader = req.headers.get('x-reminder-secret')
  if (customHeader) return customHeader

  const authHeader = req.headers.get('Authorization') || ''
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '').trim()
  }

  return ''
}

function normalizeReminderMinutes(value: number): 10 | 30 | 60 {
  if (value === 10 || value === 30 || value === 60) return value
  return 30
}

function formatScheduledDateForTimezone(
  value: string | null,
  timezone: string | null,
): string {
  if (!value) return 'fecha pendiente'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'fecha pendiente'
  return parsed.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timezone ? { timeZone: timezone } : {}),
  })
}

async function fetchProfileTimezone(
  adminClient: any,
  userId: string,
): Promise<string | null> {
  const { data } = await adminClient
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle<ProfileTimezoneRow>()

  const value = data?.timezone
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function updateNotificationStatus(input: {
  adminClient: any
  id: number
  status: 'sent' | 'failed' | 'skipped'
  errorMessage?: string | null
}): Promise<void> {
  await input.adminClient
    .from('coaching_class_schedule_notifications')
    .update({
      status: input.status,
      error_message: input.errorMessage || null,
      sent_at: input.status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', input.id)
    .eq('status', 'pending')
}

async function sendCoachingReminderNotification(input: {
  adminClient: any
  recipientUserId: string
  sessionId: string
  weekNumber: number
  reminderMinutes: 10 | 30 | 60
  scheduledAt: string | null
  classJoinUrl: string | null
}): Promise<{ sent: boolean; skippedReason: string | null }> {
  const { data: preference } = await input.adminClient
    .from('user_coaching_notification_preferences')
    .select('active_session_enabled')
    .eq('user_id', input.recipientUserId)
    .maybeSingle<CoachingPreferenceRow>()

  if (preference && !preference.active_session_enabled) {
    return { sent: false, skippedReason: 'notifications_disabled' }
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return { sent: false, skippedReason: 'vapid_not_configured' }
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const { data: subscriptions, error: subscriptionsError } =
    await input.adminClient
      .from('user_push_subscriptions')
      .select('id, endpoint, p256dh, auth, is_active')
      .eq('user_id', input.recipientUserId)
      .eq('is_active', true)

  if (subscriptionsError) {
    return { sent: false, skippedReason: 'subscriptions_query_failed' }
  }

  const activeSubscriptions = (subscriptions || []) as PushSubscriptionRow[]
  if (activeSubscriptions.length === 0) {
    return { sent: false, skippedReason: 'no_active_subscriptions' }
  }

  const userTimezone = await fetchProfileTimezone(
    input.adminClient,
    input.recipientUserId,
  )
  const localScheduleLabel = formatScheduledDateForTimezone(
    input.scheduledAt,
    userTimezone,
  )

  const payload = JSON.stringify({
    title: 'Coaching ICA',
    body: `Tu clase de coaching (Semana ${input.weekNumber}) empieza en ${input.reminderMinutes} minutos (${localScheduleLabel}).`,
    url: '/coaching-personalized',
    tag: `coaching-class-reminder-${input.sessionId}-${input.weekNumber}-${input.reminderMinutes}`,
    data: {
      type: 'coaching-class-reminder',
      sessionId: input.sessionId,
      weekNumber: input.weekNumber,
      reminderMinutes: input.reminderMinutes,
      scheduledAt: input.scheduledAt,
      classJoinUrl: input.classJoinUrl,
      url: '/coaching-personalized',
    },
  })

  let sentCount = 0
  for (const subscription of activeSubscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
      )
      sentCount += 1
    } catch {
      await input.adminClient
        .from('user_push_subscriptions')
        .update({ is_active: false, last_seen_at: new Date().toISOString() })
        .eq('id', subscription.id)
    }
  }

  return {
    sent: sentCount > 0,
    skippedReason: sentCount > 0 ? null : 'send_failed',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const expectedSecret = Deno.env.get('PUSH_REMINDERS_CRON_SECRET')
  const callSecret = getCallSecret(req)
  if (!expectedSecret || callSecret !== expectedSecret) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Missing Supabase service configuration.' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: pendingRows, error: pendingError } = await adminClient
    .from('coaching_class_schedule_notifications')
    .select(
      'id, session_id, user_id, week_number, schedule_signature, reminder_minutes, scheduled_at, class_join_url, status',
    )
    .eq('status', 'pending')
    .eq('notification_type', 'reminder')
    .order('created_at', { ascending: true })
    .limit(500)

  if (pendingError) {
    return jsonResponse(500, { error: pendingError.message })
  }

  const nowMs = Date.now()
  let sent = 0
  let skipped = 0
  let keptPending = 0

  for (const row of (pendingRows || []) as ReminderNotificationRow[]) {
    const reminderMinutes = normalizeReminderMinutes(row.reminder_minutes)
    const scheduledMs = row.scheduled_at ? Date.parse(row.scheduled_at) : Number.NaN

    if (!Number.isFinite(scheduledMs)) {
      await updateNotificationStatus({
        adminClient,
        id: row.id,
        status: 'skipped',
        errorMessage: 'invalid_scheduled_at',
      })
      skipped += 1
      continue
    }

    if (nowMs >= scheduledMs) {
      await updateNotificationStatus({
        adminClient,
        id: row.id,
        status: 'skipped',
        errorMessage: 'class_already_started',
      })
      skipped += 1
      continue
    }

    const { data: sessionRow, error: sessionError } = await adminClient
      .from('coaching_sessions')
      .select('id, user_id, status, class_join_url')
      .eq('id', row.session_id)
      .maybeSingle<SessionRow>()

    if (sessionError || !sessionRow || sessionRow.status !== 'active') {
      await updateNotificationStatus({
        adminClient,
        id: row.id,
        status: 'skipped',
        errorMessage: 'session_not_active',
      })
      skipped += 1
      continue
    }

    const { data: activationRows, error: activationError } = await adminClient
      .from('coaching_session_week_activations')
      .select('session_id, week_number, activated_at, ended_at')
      .eq('session_id', row.session_id)
      .order('week_number', { ascending: true })

    if (activationError) {
      await updateNotificationStatus({
        adminClient,
        id: row.id,
        status: 'failed',
        errorMessage: activationError.message,
      })
      continue
    }

    const activationState = buildWeekActivationState(
      (activationRows || []) as CoachingSessionWeekActivationRow[],
      {},
      nowMs,
    )

    if (activationState.currentActiveWeek !== row.week_number) {
      await updateNotificationStatus({
        adminClient,
        id: row.id,
        status: 'skipped',
        errorMessage: 'week_not_active',
      })
      skipped += 1
      continue
    }

    const { data: classRows, error: classRowsError } = await adminClient
      .from('coaching_session_classes')
      .select(
        'week_number, loom_url, report, report_image_path, scheduled_at, created_at',
      )
      .eq('session_id', row.session_id)
      .eq('week_number', row.week_number)
      .order('created_at', { ascending: false })
      .limit(1)

    if (classRowsError) {
      await updateNotificationStatus({
        adminClient,
        id: row.id,
        status: 'failed',
        errorMessage: classRowsError.message,
      })
      continue
    }

    const currentClass = ((classRows || [])[0] || null) as ClassNotificationRow | null
    if (!currentClass) {
      await updateNotificationStatus({
        adminClient,
        id: row.id,
        status: 'skipped',
        errorMessage: 'class_not_found',
      })
      skipped += 1
      continue
    }

    if (hasPostClassResources(currentClass)) {
      await updateNotificationStatus({
        adminClient,
        id: row.id,
        status: 'skipped',
        errorMessage: 'class_already_happened',
      })
      skipped += 1
      continue
    }

    const currentSignature = buildClassScheduleSignature(
      currentClass,
      sessionRow.class_join_url,
    )
    if (currentSignature !== row.schedule_signature) {
      await updateNotificationStatus({
        adminClient,
        id: row.id,
        status: 'skipped',
        errorMessage: 'schedule_changed',
      })
      skipped += 1
      continue
    }

    if (
      !isReminderDueNow({
        scheduledAt: row.scheduled_at,
        reminderMinutes,
        nowMs,
      })
    ) {
      keptPending += 1
      continue
    }

    const sendResult = await sendCoachingReminderNotification({
      adminClient,
      recipientUserId: row.user_id,
      sessionId: row.session_id,
      weekNumber: row.week_number,
      reminderMinutes,
      scheduledAt: row.scheduled_at,
      classJoinUrl: row.class_join_url,
    })

    await updateNotificationStatus({
      adminClient,
      id: row.id,
      status: sendResult.sent ? 'sent' : 'skipped',
      errorMessage: sendResult.sent ? null : sendResult.skippedReason,
    })

    if (sendResult.sent) sent += 1
    else skipped += 1
  }

  return jsonResponse(200, {
    ok: true,
    scanned: (pendingRows || []).length,
    sent,
    skipped,
    pending: keptPending,
  })
})
