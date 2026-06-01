import type {
  CalendarIcademyEntry,
  CalendarIcademyPreference,
} from '../types'
import { parseCalendarIcademySessionDateTime } from '../utils/calendarIcademyTime'

export type CalendarIcademyReminder = {
  entry: CalendarIcademyEntry
  minutesUntilStart: number
  preference: CalendarIcademyPreference
}

function parseSessionDateTime(entry: CalendarIcademyEntry): Date | null {
  return parseCalendarIcademySessionDateTime({
    sessionDate: entry.sessionDate,
    sessionTime: entry.sessionTime,
  })
}

export function buildCalendarIcademyReminders(params: {
  entries: CalendarIcademyEntry[]
  preferences: CalendarIcademyPreference[]
  blacklistedSessionIds?: string[]
  now?: Date
}): CalendarIcademyReminder[] {
  const now = params.now ?? new Date()
  const blacklistedSessionIds = new Set(params.blacklistedSessionIds || [])
  const preferencesMap = new Map(
    params.preferences
      .filter((item) => item.notificationsEnabled)
      .map((item) => [item.classKey, item]),
  )

  const reminders: CalendarIcademyReminder[] = []

  for (const entry of params.entries) {
    if (blacklistedSessionIds.has(entry.id)) continue

    const preference = preferencesMap.get(entry.classKey)
    if (!preference) continue

    const sessionStart = parseSessionDateTime(entry)
    if (!sessionStart) continue

    const minutesUntilStart = Math.round(
      (sessionStart.getTime() - now.getTime()) / 60000,
    )

    const canNotifyBefore = minutesUntilStart <= preference.minutesBefore
    const notTooLate = minutesUntilStart >= -10

    if (!canNotifyBefore || !notTooLate) continue

    if (preference.lastNotifiedForSessionId === entry.id) continue

    reminders.push({
      entry,
      preference,
      minutesUntilStart,
    })
  }

  return reminders.sort((a, b) => a.minutesUntilStart - b.minutesUntilStart)
}
