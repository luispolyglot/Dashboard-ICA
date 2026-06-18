type ClassResourceFields = {
  loomUrl: string | null
  report: string | null
  reportImagePath?: string | null
  reportImageUrl?: string | null
}

type UpcomingClassFields = {
  scheduledAt: string | null
  classJoinUrl: string | null
}

function toTrimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function hasPostClassResources(input: ClassResourceFields): boolean {
  return Boolean(
    toTrimmedOrNull(input.loomUrl) ||
      toTrimmedOrNull(input.report) ||
      toTrimmedOrNull(input.reportImagePath) ||
      toTrimmedOrNull(input.reportImageUrl),
  )
}

export function shouldRenderUpcomingClassResources(
  input: ClassResourceFields & UpcomingClassFields,
): boolean {
  if (hasPostClassResources(input)) return false
  return Boolean(
    toTrimmedOrNull(input.scheduledAt) || toTrimmedOrNull(input.classJoinUrl),
  )
}

export function toDateTimeLocalInputValue(value: string | null): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000
  const localDate = new Date(parsed.getTime() - offsetMs)
  return localDate.toISOString().slice(0, 16)
}

export function toIsoFromDateTimeLocalInput(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export function formatScheduledClassDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Fecha no disponible'
  return parsed.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
