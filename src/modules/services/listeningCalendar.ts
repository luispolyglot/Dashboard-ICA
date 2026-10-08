export function getListeningDayStamp(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function getLocalListeningDayStamp(date = new Date()): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return getListeningDayStamp(date, timezone)
}
