// Push notice when a class of the Calendario ICADEMY changes day or time (Luis, 9 Oct).
// A trigger on calendar_icademy queues one row per person in public.calendar_change_push_outbox
// (students with the reminder of that class on, and the teacher with teacher reminders on).
// calendar-push-reminders claims the queue on every run and sends the pushes from here.

export const CALENDAR_CLASS_TIMEZONE = 'Europe/Madrid'

export type CalendarChangeRow = {
  id: number
  calendar_entry_id: string
  user_id: string
  role: 'student' | 'teacher'
  class_key: string
  class_name: string
  old_date: string
  old_time: string
  new_date: string
  new_time: string
}

/** One notice per person and session: the first old time and the last new time. */
export type CalendarChangeNotice = {
  ids: number[]
  userId: string
  entryId: string
  role: 'student' | 'teacher'
  className: string
  oldDate: string
  oldTime: string
  newDate: string
  newTime: string
}

export function mergeCalendarChanges(rows: CalendarChangeRow[]): CalendarChangeNotice[] {
  const byKey = new Map<string, CalendarChangeNotice>()
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const key = `${row.user_id}:${row.calendar_entry_id}`
    const current = byKey.get(key)
    if (!current) {
      byKey.set(key, {
        ids: [row.id],
        userId: row.user_id,
        entryId: row.calendar_entry_id,
        role: row.role,
        className: row.class_name,
        oldDate: row.old_date,
        oldTime: row.old_time,
        newDate: row.new_date,
        newTime: row.new_time,
      })
      continue
    }
    current.ids.push(row.id)
    current.className = row.class_name
    current.newDate = row.new_date
    current.newTime = row.new_time
    if (row.role === 'teacher') current.role = 'teacher'
  }
  return [...byKey.values()]
}

/** True when the class ends up where it was (moved and moved back): nothing to tell. */
export function isNoChange(notice: CalendarChangeNotice): boolean {
  return notice.oldDate === notice.newDate && notice.oldTime.slice(0, 5) === notice.newTime.slice(0, 5)
}

function timezoneOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || '0')
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - date.getTime()
}

/** The real moment of a class saved as a Madrid date (YYYY-MM-DD) and time (HH:MM[:SS]). */
export function madridClassStart(date: string, time: string): Date | null {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const t = time.match(/^(\d{2}):(\d{2})/)
  if (!d || !t) return null
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]))
  // Two passes so the offset is the one of the class day itself (summer/winter time).
  let instant = naive - timezoneOffsetMs(CALENDAR_CLASS_TIMEZONE, new Date(naive))
  instant = naive - timezoneOffsetMs(CALENDAR_CLASS_TIMEZONE, new Date(instant))
  return new Date(instant)
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

function hourLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const hh = parts.find((part) => part.type === 'hour')?.value || '00'
  const mm = parts.find((part) => part.type === 'minute')?.value || '00'
  // Same style as the class reminders: 18h, 18h30.
  return mm === '00' ? `${hh}h` : `${hh}h${mm}`
}

function dayLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
    .format(date)
    .replace(',', '')
}

export type CalendarChangePush = { title: string; body: string; tag: string; url: string }

/**
 * Text of the notice, in the person's own time zone (Madrid when they have none). Returns null
 * when the class does not really change.
 */
export function buildCalendarChangePush(notice: CalendarChangeNotice, timeZone: string): CalendarChangePush | null {
  if (isNoChange(notice)) return null
  const before = madridClassStart(notice.oldDate, notice.oldTime)
  const after = madridClassStart(notice.newDate, notice.newTime)
  if (!before || !after) return null
  const zone = isValidTimezone(timeZone) ? timeZone : CALENDAR_CLASS_TIMEZONE

  const oldDay = dayLabel(before, zone)
  const newDay = dayLabel(after, zone)
  const ownZone = zone !== CALENDAR_CLASS_TIMEZONE ? ', hora de tu zona' : ''
  const body =
    oldDay === newDay
      ? `La clase del ${oldDay} pasa a las ${hourLabel(after, zone)}${ownZone} (antes a las ${hourLabel(before, zone)}).`
      : `La clase del ${oldDay} pasa al ${newDay} a las ${hourLabel(after, zone)}${ownZone}.`

  return {
    title:
      notice.role === 'teacher'
        ? `Cambio en tu clase de ${notice.className}`
        : `Cambio en la clase de ${notice.className}`,
    body,
    tag: `calendar-change-${notice.entryId}`,
    url: '/calendar-icademy',
  }
}

function minutesOf(value: string | null): number | null {
  const match = (value || '').match(/^(\d{2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** Same rule as the class reminders: quiet hours are read in the person's own time zone. */
export function isInQuietHours(now: Date, timeZone: string, start: string | null, end: string | null): boolean {
  const from = minutesOf(start)
  const to = minutesOf(end)
  if (from == null || to == null) return false
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now)
  const current =
    Number(parts.find((part) => part.type === 'hour')?.value || '0') * 60 +
    Number(parts.find((part) => part.type === 'minute')?.value || '0')
  if (from === to) return true
  if (from < to) return current >= from && current < to
  return current >= from || current < to
}

type PushSubscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

type WebPushLike = {
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>
}

// deno-lint-ignore no-explicit-any
type AdminClientLike = any

type QuietHours = { start: string | null; end: string | null }

/**
 * Claims the queued notices and sends them. Never throws: a failure here must not stop the class
 * reminders. Notices for someone in their quiet hours go back to the queue for the next run.
 */
export async function sendCalendarChangeNotices(input: {
  adminClient: AdminClientLike
  webpush: WebPushLike
  now?: Date
}): Promise<{ notices: number; sent: number; held: number }> {
  const { adminClient, webpush } = input
  const now = input.now || new Date()
  try {
    const { data, error } = await adminClient.rpc('claim_calendar_change_push_outbox', { p_limit: 300 })
    if (error) return { notices: 0, sent: 0, held: 0 }
    const notices = mergeCalendarChanges((data || []) as CalendarChangeRow[])
    if (notices.length === 0) return { notices: 0, sent: 0, held: 0 }

    const userIds = [...new Set(notices.map((notice) => notice.userId))]
    const [subscriptionsResult, profilesResult, classPrefsResult, teacherPrefsResult] = await Promise.all([
      adminClient
        .from('user_push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .in('user_id', userIds)
        .eq('is_active', true),
      adminClient.from('profiles').select('id, timezone').in('id', userIds),
      adminClient
        .from('users_calendar_icademy')
        .select('user_id, class_key, quiet_hours_start, quiet_hours_end')
        .in('user_id', userIds),
      adminClient
        .from('users_calendar_icademy_teacher_notifications')
        .select('user_id, quiet_hours_start, quiet_hours_end')
        .in('user_id', userIds),
    ])

    const subscriptionsByUser = new Map<string, PushSubscription[]>()
    for (const subscription of (subscriptionsResult.data || []) as PushSubscription[]) {
      const list = subscriptionsByUser.get(subscription.user_id) || []
      list.push(subscription)
      subscriptionsByUser.set(subscription.user_id, list)
    }
    const timezones = new Map<string, string>()
    for (const profile of (profilesResult.data || []) as Array<{ id: string; timezone: string | null }>) {
      const zone = (profile.timezone || '').trim()
      if (zone && isValidTimezone(zone)) timezones.set(profile.id, zone)
    }
    // Quiet hours of the class the notice is about (students) or of the teacher reminders.
    const classQuiet = new Map<string, QuietHours>()
    for (const row of (classPrefsResult.data || []) as Array<{
      user_id: string
      class_key: string
      quiet_hours_start: string | null
      quiet_hours_end: string | null
    }>) {
      classQuiet.set(`${row.user_id}:${row.class_key}`, { start: row.quiet_hours_start, end: row.quiet_hours_end })
    }
    const teacherQuiet = new Map<string, QuietHours>()
    for (const row of (teacherPrefsResult.data || []) as Array<{
      user_id: string
      quiet_hours_start: string | null
      quiet_hours_end: string | null
    }>) {
      teacherQuiet.set(row.user_id, { start: row.quiet_hours_start, end: row.quiet_hours_end })
    }
    const classKeyOf = new Map<string, string>()
    for (const row of (data || []) as CalendarChangeRow[]) classKeyOf.set(row.calendar_entry_id, row.class_key)

    let sent = 0
    const heldIds: number[] = []
    for (const notice of notices) {
      const start = madridClassStart(notice.newDate, notice.newTime)
      if (!start || start.getTime() <= now.getTime()) continue // The class already started.

      const zone = timezones.get(notice.userId) || CALENDAR_CLASS_TIMEZONE
      const quiet =
        notice.role === 'teacher'
          ? teacherQuiet.get(notice.userId)
          : classQuiet.get(`${notice.userId}:${classKeyOf.get(notice.entryId) || ''}`)
      if (quiet && isInQuietHours(now, zone, quiet.start, quiet.end)) {
        heldIds.push(...notice.ids)
        continue
      }

      const push = buildCalendarChangePush(notice, zone)
      if (!push) continue
      const payload = JSON.stringify(push)
      for (const subscription of subscriptionsByUser.get(notice.userId) || []) {
        try {
          await webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            payload,
          )
          sent += 1
        } catch (err) {
          const statusCode = Number((err as { statusCode?: number }).statusCode || 0)
          if (statusCode === 404 || statusCode === 410) {
            await adminClient
              .from('user_push_subscriptions')
              .update({ is_active: false, last_seen_at: now.toISOString() })
              .eq('id', subscription.id)
          }
        }
      }
    }

    if (heldIds.length > 0) {
      await adminClient.rpc('release_calendar_change_push_outbox', { p_ids: heldIds })
    }
    return { notices: notices.length, sent, held: heldIds.length }
  } catch {
    return { notices: 0, sent: 0, held: 0 }
  }
}
