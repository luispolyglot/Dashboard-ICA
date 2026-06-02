export const CALENDAR_ICADEMY_TIMEZONE = 'Europe/Madrid'

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

export function parseCalendarIcademySessionDateTime(params: {
  sessionDate: string
  sessionTime: string
}): Date | null {
  const [yearRaw, monthRaw, dayRaw] = params.sessionDate.split('-')
  const [hourRaw, minuteRaw, secondRaw = '0'] = params.sessionTime.split(':')

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

  let utcTs = Date.UTC(year, month - 1, day, hour, minute, second)

  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(CALENDAR_ICADEMY_TIMEZONE, new Date(utcTs))
    const next = Date.UTC(year, month - 1, day, hour, minute, second) - offset

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

export function getCalendarIcademyTodayKey(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR_ICADEMY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value || '0000'
  const month = parts.find((part) => part.type === 'month')?.value || '01'
  const day = parts.find((part) => part.type === 'day')?.value || '01'

  return `${year}-${month}-${day}`
}
