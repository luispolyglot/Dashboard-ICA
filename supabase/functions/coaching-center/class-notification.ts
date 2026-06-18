export type ClassNotificationRow = {
  week_number: number
  loom_url: string | null
  report: string | null
  report_image_path: string | null
  scheduled_at: string | null
  class_join_url: string | null
}

export type ClassScheduleNotificationEvent = {
  weekNumber: number
  type: 'scheduled' | 'rescheduled'
  scheduleSignature: string
  scheduledAt: string | null
  classJoinUrl: string | null
}

function toTrimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toNormalizedIsoOrNull(value: string | null | undefined): string | null {
  const trimmed = toTrimmedOrNull(value)
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function normalizeWeekNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const week = Math.trunc(value)
  if (week < 1 || week > 12) return null
  return week
}

export function hasPostClassResources(row: ClassNotificationRow | null): boolean {
  if (!row) return false
  return Boolean(
    toTrimmedOrNull(row.loom_url) ||
      toTrimmedOrNull(row.report) ||
      toTrimmedOrNull(row.report_image_path),
  )
}

export function hasUpcomingClassResources(
  row: Pick<ClassNotificationRow, 'scheduled_at' | 'class_join_url'> | null,
): boolean {
  if (!row) return false
  return Boolean(
    toTrimmedOrNull(row.scheduled_at) || toTrimmedOrNull(row.class_join_url),
  )
}

export function buildClassScheduleSignature(
  row: Pick<ClassNotificationRow, 'scheduled_at' | 'class_join_url'> | null,
): string {
  if (!row) return ''
  const scheduledAt = toNormalizedIsoOrNull(row.scheduled_at) || ''
  const classJoinUrl = toTrimmedOrNull(row.class_join_url) || ''
  return `${scheduledAt}|${classJoinUrl}`
}

export function resolveClassScheduleNotificationEvent(input: {
  activeWeekNumber: number | null
  previousRows: ClassNotificationRow[]
  nextRows: ClassNotificationRow[]
}): ClassScheduleNotificationEvent | null {
  const activeWeekNumber = normalizeWeekNumber(input.activeWeekNumber)
  if (!activeWeekNumber) return null

  const previousRow =
    input.previousRows.find((row) => row.week_number === activeWeekNumber) || null
  const nextRow =
    input.nextRows.find((row) => row.week_number === activeWeekNumber) || null

  if (!nextRow) return null
  if (hasPostClassResources(nextRow)) return null
  if (!hasUpcomingClassResources(nextRow)) return null

  const previousSignature = buildClassScheduleSignature(previousRow)
  const nextSignature = buildClassScheduleSignature(nextRow)
  if (!nextSignature || nextSignature === previousSignature) return null

  const hadUpcomingBefore =
    Boolean(previousSignature) &&
    hasUpcomingClassResources(previousRow) &&
    !hasPostClassResources(previousRow)

  return {
    weekNumber: activeWeekNumber,
    type: hadUpcomingBefore ? 'rescheduled' : 'scheduled',
    scheduleSignature: nextSignature,
    scheduledAt: toTrimmedOrNull(nextRow.scheduled_at),
    classJoinUrl: toTrimmedOrNull(nextRow.class_join_url),
  }
}

export function isReminderDueNow(input: {
  scheduledAt: string | null
  reminderMinutes: number
  nowMs?: number
}): boolean {
  const rawDate = toTrimmedOrNull(input.scheduledAt)
  if (!rawDate) return false
  if (!Number.isFinite(input.reminderMinutes) || input.reminderMinutes <= 0) {
    return false
  }

  const scheduledMs = Date.parse(rawDate)
  if (!Number.isFinite(scheduledMs)) return false

  const nowMs = input.nowMs ?? Date.now()
  const reminderMs = scheduledMs - Math.trunc(input.reminderMinutes) * 60 * 1000
  return nowMs >= reminderMs && nowMs < scheduledMs
}
