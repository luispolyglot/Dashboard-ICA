import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-reminder-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  is_active: boolean
}

type PreferencesRow = {
  user_id: string
  ica_streak_enabled: boolean
  ica_streak_hour: number
  flashcards_streak_enabled: boolean
  flashcards_streak_hour: number
  habit_loss_enabled: boolean
  habit_loss_last_stage: number
  ica_streak_last_reminded_day: string | null
  flashcards_streak_last_reminded_day: string | null
}

type ProfileRow = {
  id: string
  timezone: string | null
}

type DailyMetricsGoalRow = {
  user_id: string
  day: string
  creation_goal_completed: boolean
  review_goal_completed: boolean
}

type DailyMetricsActivityRow = {
  user_id: string
  updated_at: string
}

type ReminderEvent = {
  kind: 'ica_streak' | 'flashcards_streak' | 'habit_loss'
  payload: {
    title: string
    body: string
    url: string
    tag: string
  }
  stage?: 1 | 2 | 3
  localDay?: string
}

const HABIT_MESSAGES: Record<1 | 2 | 3, string> = {
  1: 'Hey, no falles hoy también a tu racha ICA para no perder el hábito',
  2: 'Todavía estas a tiempo de recuperar tu ritmo ICA. Sólo necesitas unos minutos para sumar ese 1%.',
  3: 'Veo que las notificaciones no están funcionando contigo. No te defraudes. Ya no te molestaré más',
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

function normalizeHour(value: number): number {
  if (Number.isNaN(value)) return 20
  if (value < 5) return 5
  if (value > 23) return 23
  return Math.round(value)
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

function getLocalDayAndHour(now: Date, timeZone: string): {
  day: string
  hour: number
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value || '1970'
  const month = parts.find((part) => part.type === 'month')?.value || '01'
  const day = parts.find((part) => part.type === 'day')?.value || '01'
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0')

  return {
    day: `${year}-${month}-${day}`,
    hour: Number.isNaN(hour) ? 0 : hour,
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
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !vapidPublicKey ||
    !vapidPrivateKey ||
    !vapidSubject
  ) {
    return jsonResponse(500, { error: 'Function environment is not configured' })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const now = new Date()

  const [subscriptionsResult, preferencesResult] = await Promise.all([
    adminClient
      .from('user_push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, is_active')
      .eq('is_active', true),
    adminClient
      .from('user_push_notification_preferences')
      .select(
        'user_id, ica_streak_enabled, ica_streak_hour, flashcards_streak_enabled, flashcards_streak_hour, habit_loss_enabled, habit_loss_last_stage, ica_streak_last_reminded_day, flashcards_streak_last_reminded_day',
      )
      .or('ica_streak_enabled.eq.true,flashcards_streak_enabled.eq.true,habit_loss_enabled.eq.true'),
  ])

  if (subscriptionsResult.error || preferencesResult.error) {
    return jsonResponse(500, {
      error:
        subscriptionsResult.error?.message ||
        preferencesResult.error?.message ||
        'Failed to query subscriptions/preferences',
    })
  }

  const subscriptions = (subscriptionsResult.data || []) as PushSubscriptionRow[]
  const preferences = (preferencesResult.data || []) as PreferencesRow[]

  if (subscriptions.length === 0 || preferences.length === 0) {
    return jsonResponse(200, {
      ok: true,
      sent: 0,
      failed: 0,
      skipped: 0,
      reason: 'No subscriptions or preferences to process',
    })
  }

  const userIds = Array.from(new Set(preferences.map((item) => item.user_id)))

  const [profilesResult, activityResult] = await Promise.all([
    adminClient.from('profiles').select('id, timezone').in('id', userIds),
    adminClient
      .from('daily_metrics')
      .select('user_id, updated_at')
      .in('user_id', userIds)
      .order('updated_at', { ascending: false }),
  ])

  if (profilesResult.error || activityResult.error) {
    return jsonResponse(500, {
      error:
        profilesResult.error?.message ||
        activityResult.error?.message ||
        'Failed to query profile/activity data',
    })
  }

  const profiles = (profilesResult.data || []) as ProfileRow[]
  const profileTimezoneByUser = new Map<string, string>(
    profiles.map((profile) => {
      const candidate = (profile.timezone || '').trim()
      const timezone =
        candidate.length > 0 && isValidTimeZone(candidate) ? candidate : 'UTC'
      return [profile.id, timezone]
    }),
  )

  const lastActivityByUser = new Map<string, Date>()
  for (const row of (activityResult.data || []) as DailyMetricsActivityRow[]) {
    if (lastActivityByUser.has(row.user_id)) continue
    const timestamp = new Date(row.updated_at)
    if (Number.isNaN(timestamp.getTime())) continue
    lastActivityByUser.set(row.user_id, timestamp)
  }

  const goalDayByUser = new Map<string, string>()
  for (const preference of preferences) {
    const timezone = profileTimezoneByUser.get(preference.user_id) || 'UTC'
    const { day } = getLocalDayAndHour(now, timezone)
    goalDayByUser.set(preference.user_id, day)
  }

  const dayValues = Array.from(new Set(goalDayByUser.values()))
  const goalsByUserDay = new Map<string, DailyMetricsGoalRow>()
  if (dayValues.length > 0) {
    const metricsResult = await adminClient
      .from('daily_metrics')
      .select('user_id, day, creation_goal_completed, review_goal_completed')
      .in('user_id', userIds)
      .in('day', dayValues)

    if (metricsResult.error) {
      return jsonResponse(500, {
        error: metricsResult.error.message || 'Failed to query streak metrics',
      })
    }

    for (const row of (metricsResult.data || []) as DailyMetricsGoalRow[]) {
      goalsByUserDay.set(`${row.user_id}:${row.day}`, row)
    }
  }

  const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>()
  for (const subscription of subscriptions) {
    const current = subscriptionsByUser.get(subscription.user_id) || []
    current.push(subscription)
    subscriptionsByUser.set(subscription.user_id, current)
  }

  let sent = 0
  let failed = 0
  let skipped = 0
  let updatesApplied = 0

  for (const preference of preferences) {
    const timezone = profileTimezoneByUser.get(preference.user_id) || 'UTC'
    const local = getLocalDayAndHour(now, timezone)
    const todayGoals = goalsByUserDay.get(`${preference.user_id}:${local.day}`)
    const userEvents: ReminderEvent[] = []
    const updatePayload: Record<string, unknown> = {}

    if (
      preference.ica_streak_enabled &&
      normalizeHour(Number(preference.ica_streak_hour)) === local.hour &&
      preference.ica_streak_last_reminded_day !== local.day
    ) {
      const completedToday = Boolean(todayGoals?.creation_goal_completed)
      if (!completedToday) {
        userEvents.push({
          kind: 'ica_streak',
          localDay: local.day,
          payload: {
            title: 'Racha ICA pendiente',
            body: 'Todavia no completaste hoy tu racha ICA. Te toma solo unos minutos.',
            url: '/streaks',
            tag: `ica-streak-${local.day}`,
          },
        })
      }
    }

    if (
      preference.flashcards_streak_enabled &&
      normalizeHour(Number(preference.flashcards_streak_hour)) === local.hour &&
      preference.flashcards_streak_last_reminded_day !== local.day
    ) {
      const completedToday = Boolean(todayGoals?.review_goal_completed)
      if (!completedToday) {
        userEvents.push({
          kind: 'flashcards_streak',
          localDay: local.day,
          payload: {
            title: 'Racha Flashcards pendiente',
            body: 'Tu racha de flashcards de hoy sigue abierta. Cerrala para mantener el ritmo.',
            url: '/streaks',
            tag: `flashcards-streak-${local.day}`,
          },
        })
      }
    }

    if (preference.habit_loss_enabled) {
      const lastActivity = lastActivityByUser.get(preference.user_id)
      const previousStage = Math.max(0, Number(preference.habit_loss_last_stage || 0))

      if (lastActivity) {
        const elapsedHours = (now.getTime() - lastActivity.getTime()) / 3600000

        if (elapsedHours < 36 && previousStage > 0) {
          updatePayload.habit_loss_last_stage = 0
          updatePayload.habit_loss_last_notified_at = null
        } else {
          let dueStage: 1 | 2 | 3 | null = null
          if (elapsedHours >= 24 * 7 && previousStage < 3) {
            dueStage = 3
          } else if (elapsedHours >= 72 && previousStage < 2) {
            dueStage = 2
          } else if (elapsedHours >= 36 && previousStage < 1) {
            dueStage = 1
          }

          if (dueStage) {
            userEvents.push({
              kind: 'habit_loss',
              stage: dueStage,
              payload: {
                title: 'Recupera tu hábito ICA',
                body: HABIT_MESSAGES[dueStage],
                url: '/streaks',
                tag: `habit-loss-stage-${dueStage}`,
              },
            })
          }
        }
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await adminClient
        .from('user_push_notification_preferences')
        .update(updatePayload)
        .eq('user_id', preference.user_id)

      if (!updateError) {
        updatesApplied += 1
      }
    }

    if (userEvents.length === 0) {
      skipped += 1
      continue
    }

    const userSubscriptions = subscriptionsByUser.get(preference.user_id) || []
    if (userSubscriptions.length === 0) {
      skipped += userEvents.length
      continue
    }

    for (const event of userEvents) {
      let eventSent = false

      for (const subscription of userSubscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            JSON.stringify(event.payload),
          )
          sent += 1
          eventSent = true
        } catch (err) {
          failed += 1
          const statusCode = Number((err as { statusCode?: number })?.statusCode || 0)
          if (statusCode === 404 || statusCode === 410) {
            await adminClient
              .from('user_push_subscriptions')
              .update({ is_active: false, last_seen_at: now.toISOString() })
              .eq('id', subscription.id)
          }
        }
      }

      if (!eventSent) continue

      if (event.kind === 'ica_streak' && event.localDay) {
        updatePayload.ica_streak_last_reminded_day = event.localDay
      }

      if (event.kind === 'flashcards_streak' && event.localDay) {
        updatePayload.flashcards_streak_last_reminded_day = event.localDay
      }

      if (event.kind === 'habit_loss' && event.stage) {
        updatePayload.habit_loss_last_stage = event.stage
        updatePayload.habit_loss_last_notified_at = now.toISOString()
        if (event.stage === 3) {
          updatePayload.habit_loss_enabled = false
        }
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await adminClient
        .from('user_push_notification_preferences')
        .update(updatePayload)
        .eq('user_id', preference.user_id)

      if (!updateError) {
        updatesApplied += 1
      }
    }
  }

  return jsonResponse(200, {
    ok: true,
    sent,
    failed,
    skipped,
    updatesApplied,
  })
})
