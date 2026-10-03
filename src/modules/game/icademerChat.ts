import { langName, uiLocale } from '@/i18n'

// CHAT DE ICADEMERS POR IDIOMA: mensajes cerrados (solo los de esta lista).
// El servidor (send_icademer_chat_message) acepta exactamente estas claves.

/** «polaco» en español (en minúscula dentro de la frase), «Polish» en inglés. */
export function chatLanguageLabel(targetLang: string): string {
  const name = langName(targetLang)
  return uiLocale().startsWith('es') ? name.toLowerCase() : name
}

export type ChatMessageKind = 'hola' | 'club' | 'me_apunto' | 'no_puedo' | 'hora' | 'genial' | 'nos_vemos' | 'animo'

/** Los 8 mensajes, en el orden de los botones. Los textos pasan por t() al pintarlos. */
export const CHAT_MESSAGES: ReadonlyArray<{ kind: ChatMessageKind; text: string }> = [
  { kind: 'club', text: '¿Alguien se apunta al Club de DinámICA?' },
  { kind: 'hola', text: '¡Hola!' },
  { kind: 'me_apunto', text: '¡Yo me apunto!' },
  { kind: 'hora', text: '¿A las {time}?' },
  { kind: 'genial', text: '¡Genial!' },
  { kind: 'nos_vemos', text: '¡Nos vemos allí!' },
  { kind: 'no_puedo', text: 'Hoy no puedo' },
  { kind: 'animo', text: '¡Ánimo con la racha ICA!' },
]

/** Como mucho 3 mensajes seguidos de la misma persona. */
export const CHAT_MAX_IN_A_ROW = 3

/** Horas para el mensaje «¿A las…?»: de 15 en 15 minutos. */
export const CHAT_TIME_OPTIONS: string[] = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4)
  const minutes = (index % 4) * 15
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
})

/** La próxima hora en punto o cuarto (para que el selector empiece en algo sensato). */
export function nextQuarter(now: Date): string {
  const total = now.getHours() * 60 + now.getMinutes()
  const next = (Math.ceil((total + 1) / 15) * 15) % (24 * 60)
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
}

/** Zona horaria de este dispositivo (p. ej. Europe/Madrid). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Minutos que una zona va por delante de UTC en una fecha concreta. */
function zoneOffsetMinutes(timeZone: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at)
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
    return Math.round((asUtc - at.getTime()) / 60000)
  } catch {
    return null
  }
}

// Ciudades en español de las zonas más habituales de los icademers.
const ZONE_CITY_ES: Record<string, string> = {
  'Europe/Madrid': 'Madrid',
  'Atlantic/Canary': 'Canarias',
  'Europe/Warsaw': 'Varsovia',
  'Europe/Vienna': 'Viena',
  'Europe/Berlin': 'Berlín',
  'Europe/Paris': 'París',
  'Europe/Rome': 'Roma',
  'Europe/London': 'Londres',
  'Europe/Lisbon': 'Lisboa',
  'America/Mexico_City': 'Ciudad de México',
  'America/Bogota': 'Bogotá',
  'America/Lima': 'Lima',
  'America/Santiago': 'Santiago de Chile',
  'America/Argentina/Buenos_Aires': 'Buenos Aires',
  'America/Caracas': 'Caracas',
  'America/Guayaquil': 'Ecuador',
  'America/Montevideo': 'Montevideo',
  'America/New_York': 'Nueva York',
  'America/Los_Angeles': 'Los Ángeles',
}

/** Nombre corto de una zona horaria para enseñarlo: «Europe/Madrid» → «Madrid». */
export function zoneCity(zone: string | null | undefined): string {
  if (!zone) return ''
  if (ZONE_CITY_ES[zone]) return ZONE_CITY_ES[zone]
  const last = zone.split('/').pop() || zone
  return last.replace(/_/g, ' ')
}

/** El día (AAAA-MM-DD) de un momento en una zona. */
function dayInZone(zone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

export type ConvertedTime = {
  /** La hora en la zona de quien lee. */
  time: string
  /** -1: es el día anterior para quien lee; 1: el día siguiente; 0: el mismo día. */
  dayShift: -1 | 0 | 1
}

/**
 * La hora de un mensaje «¿A las 18:45?» (escrita en la hora de quien la manda, el día que la
 * manda) pasada a la hora de quien lo lee. null si es la misma (misma zona o sin zona).
 * Ej.: 18:45 de Madrid leída en Ciudad de México → 10:45, mismo día.
 */
export function timeInViewerZone(
  timeValue: string,
  senderZone: string | null | undefined,
  viewerZone: string,
  sentAt: Date,
): ConvertedTime | null {
  if (!senderZone || senderZone === viewerZone) return null
  const sender = zoneOffsetMinutes(senderZone, sentAt)
  const viewer = zoneOffsetMinutes(viewerZone, sentAt)
  if (sender === null || viewer === null || sender === viewer) return null
  const [hours, minutes] = timeValue.split(':').map(Number)
  // El momento exacto: ese día (en la zona de quien lo escribe) a esa hora.
  const [year, month, day] = dayInZone(senderZone, sentAt).split('-').map(Number)
  const instant = Date.UTC(year, month - 1, day, hours, minutes) - sender * 60000
  const viewerLocal = new Date(instant + viewer * 60000)
  const time = `${String(viewerLocal.getUTCHours()).padStart(2, '0')}:${String(viewerLocal.getUTCMinutes()).padStart(2, '0')}`
  const senderDay = Date.UTC(year, month - 1, day)
  const viewerDay = Date.UTC(viewerLocal.getUTCFullYear(), viewerLocal.getUTCMonth(), viewerLocal.getUTCDate())
  const diff = Math.round((viewerDay - senderDay) / 86400000)
  return { time, dayShift: diff < 0 ? -1 : diff > 0 ? 1 : 0 }
}

/** ¿Llevo ya 3 mensajes seguidos (los últimos son míos)? */
export function mustWaitForOthers(messages: ReadonlyArray<{ isMe: boolean }>): boolean {
  if (messages.length < CHAT_MAX_IN_A_ROW) return false
  return messages.slice(-CHAT_MAX_IN_A_ROW).every((message) => message.isMe)
}
