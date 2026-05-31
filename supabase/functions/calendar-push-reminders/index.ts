import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reminder-secret',
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

type CalendarEntryRow = {
  id: string
  class_key: string
  class_name: string
  session_date: string
  session_time: string
  teacher: string
}

type PreferenceRow = {
  user_id: string
  class_key: string
  minutes_before: number
  notifications_enabled: boolean
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  last_notified_for_session_id: string | null
}

type ProfileTimezoneRow = {
  id: string
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

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseLocalDateTimeParts(entry: CalendarEntryRow): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} | null {
  const [yearRaw, monthRaw, dayRaw] = entry.session_date.split('-')
  const [hourRaw, minuteRaw, secondRaw = '0'] = entry.session_time.split(':')

  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const second = Number(secondRaw)

  if (
    [year, month, day, hour, minute, second].some((value) =>
      Number.isNaN(value),
    )
  ) {
    return null
  }

  return { year, month, day, hour, minute, second }
}

function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value || '0')
  const month = Number(parts.find((part) => part.type === 'month')?.value || '0')
  const day = Number(parts.find((part) => part.type === 'day')?.value || '0')
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0')
  const second = Number(parts.find((part) => part.type === 'second')?.value || '0')

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  return asUtc - date.getTime()
}

function parseSessionDateTimeForTimezone(
  entry: CalendarEntryRow,
  timezone: string,
): Date | null {
  const parts = parseLocalDateTimeParts(entry)
  if (!parts) return null

  let utcTs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )

  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(timezone, new Date(utcTs))
    const next =
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      ) - offset

    if (Math.abs(next - utcTs) < 1000) {
      utcTs = next
      break
    }

    utcTs = next
  }

  const result = new Date(utcTs)
  if (Number.isNaN(result.getTime())) return null
  return result
}

function normalizeTimezone(input: string | null | undefined): string {
  const fallback = 'UTC'
  if (!input) return fallback

  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: input })
    formatter.format(new Date())
    return input
  } catch {
    return fallback
  }
}

function formatHourLabel(value: string): string {
  const hour = value.slice(0, 5)
  return hour.endsWith(':00') ? `${hour.slice(0, 2)}h` : hour.replace(':', 'h')
}

function parseHourToMinutes(value: string | null): number | null {
  if (!value) return null
  const match = value.match(/^(\d{2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

function isWithinQuietHours(params: {
  date: Date
  timezone: string
  quietStart: string | null
  quietEnd: string | null
}): boolean {
  const start = parseHourToMinutes(params.quietStart)
  const end = parseHourToMinutes(params.quietEnd)
  if (start == null || end == null) return false

  const formatter = new Intl.DateTimeFormat('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    timeZone: params.timezone,
  })
  const parts = formatter.formatToParts(params.date)
  const hh = Number(parts.find((part) => part.type === 'hour')?.value || '0')
  const mm = Number(parts.find((part) => part.type === 'minute')?.value || '0')
  const nowMinutes = hh * 60 + mm

  if (start === end) return true
  if (start < end) {
    return nowMinutes >= start && nowMinutes < end
  }

  return nowMinutes >= start || nowMinutes < end
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
  const minDate = new Date(now.getTime() - 10 * 60 * 1000)
  const maxDate = new Date(now.getTime() + 120 * 60 * 1000)

  const [subscriptionsResult, preferencesResult, entriesResult] = await Promise.all([
    adminClient
      .from('user_push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, is_active')
      .eq('is_active', true),
    adminClient
      .from('users_calendar_icademy')
      .select(
        'user_id, class_key, minutes_before, notifications_enabled, quiet_hours_start, quiet_hours_end, last_notified_for_session_id',
      )
      .eq('notifications_enabled', true),
    adminClient
      .from('calendar_icademy')
      .select('id, class_key, class_name, session_date, session_time, teacher')
      .gte('session_date', toYmd(new Date(minDate.getTime() - 24 * 60 * 60 * 1000)))
      .lte('session_date', toYmd(new Date(maxDate.getTime() + 24 * 60 * 60 * 1000)))
      .order('session_date', { ascending: true })
      .order('session_time', { ascending: true }),
  ])

  if (subscriptionsResult.error || preferencesResult.error || entriesResult.error) {
    return jsonResponse(500, {
      error:
        subscriptionsResult.error?.message ||
        preferencesResult.error?.message ||
        entriesResult.error?.message ||
        'Failed to query reminder data',
    })
  }

  const subscriptions = (subscriptionsResult.data || []) as PushSubscriptionRow[]
  const preferences = (preferencesResult.data || []) as PreferenceRow[]
  const entries = (entriesResult.data || []) as CalendarEntryRow[]

  if (subscriptions.length === 0 || preferences.length === 0 || entries.length === 0) {
    return jsonResponse(200, {
      ok: true,
      sent: 0,
      skipped: 0,
      failed: 0,
      reason: 'No subscriptions/preferences/entries to process',
    })
  }

  const userIds = Array.from(new Set(preferences.map((item) => item.user_id)))
  const { data: profileRows } = await adminClient
    .from('profiles')
    .select('id, timezone')
    .in('id', userIds)

  const timezoneByUser = new Map<string, string>()
  for (const row of (profileRows || []) as ProfileTimezoneRow[]) {
    timezoneByUser.set(row.id, normalizeTimezone(row.timezone))
  }

  const preferencesByUserClass = new Map<string, PreferenceRow>()
  for (const preference of preferences) {
    preferencesByUserClass.set(
      `${preference.user_id}:${preference.class_key}`,
      preference,
    )
  }

  const entriesByClass = new Map<string, CalendarEntryRow[]>()
  for (const entry of entries) {
    const current = entriesByClass.get(entry.class_key) || []
    current.push(entry)
    entriesByClass.set(entry.class_key, current)
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const subscription of subscriptions) {
    const dueForSubscription: Array<{
      entry: CalendarEntryRow
      preference: PreferenceRow
      minutesUntilStart: number
    }> = []

    for (const preference of preferences) {
      if (preference.user_id !== subscription.user_id) continue

      const classEntries = entriesByClass.get(preference.class_key) || []
      for (const entry of classEntries) {
        if (preference.last_notified_for_session_id === entry.id) {
          continue
        }

        const timezone = timezoneByUser.get(subscription.user_id) || 'UTC'
        const sessionStart = parseSessionDateTimeForTimezone(entry, timezone)
        if (!sessionStart) continue

        const minutesUntilStart = Math.round(
          (sessionStart.getTime() - now.getTime()) / 60000,
        )

        if (minutesUntilStart > preference.minutes_before || minutesUntilStart < -10) {
          continue
        }

        if (
          isWithinQuietHours({
            date: now,
            timezone,
            quietStart: preference.quiet_hours_start,
            quietEnd: preference.quiet_hours_end,
          })
        ) {
          continue
        }

        dueForSubscription.push({ entry, preference, minutesUntilStart })
      }
    }

    dueForSubscription.sort((a, b) => a.minutesUntilStart - b.minutesUntilStart)

    for (const item of dueForSubscription.slice(0, 3)) {
      const { data: existingLog } = await adminClient
        .from('calendar_push_delivery_log')
        .select('id')
        .eq('subscription_id', subscription.id)
        .eq('calendar_entry_id', item.entry.id)
        .maybeSingle()

      if (existingLog) {
        skipped += 1
        continue
      }

      const whenLabel =
        item.minutesUntilStart <= 0
          ? 'Comienza en breve'
          : `Empieza en ${item.minutesUntilStart} min`

      const payload = {
        title: `Clase ICADEMY: ${item.entry.class_name}`,
        body: `${whenLabel} · ${formatHourLabel(item.entry.session_time)} · con ${item.entry.teacher}`,
        url: '/calendar-icademy',
        tag: `calendar-reminder-${item.entry.id}`,
      }

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload),
        )

        sent += 1

        await adminClient.from('calendar_push_delivery_log').insert({
          user_id: subscription.user_id,
          subscription_id: subscription.id,
          calendar_entry_id: item.entry.id,
          class_key: item.entry.class_key,
          status: 'sent',
        })

        await adminClient
          .from('users_calendar_icademy')
          .update({
            last_notified_for_session_id: item.entry.id,
            last_notified_at: now.toISOString(),
          })
          .eq('user_id', subscription.user_id)
          .eq('class_key', item.entry.class_key)
      } catch (err) {
        failed += 1
        const message = err instanceof Error ? err.message : 'PUSH_SEND_FAILED'

        await adminClient.from('calendar_push_delivery_log').insert({
          user_id: subscription.user_id,
          subscription_id: subscription.id,
          calendar_entry_id: item.entry.id,
          class_key: item.entry.class_key,
          status: 'failed',
          error_message: message.slice(0, 450),
        })

        const statusCode = Number((err as { statusCode?: number })?.statusCode || 0)
        if (statusCode === 404 || statusCode === 410) {
          await adminClient
            .from('user_push_subscriptions')
            .update({ is_active: false, last_seen_at: now.toISOString() })
            .eq('id', subscription.id)
        }
      }
    }
  }

  return jsonResponse(200, {
    ok: true,
    sent,
    skipped,
    failed,
  })
})
