import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'
import { ensureSuperAdmin } from '../_shared/super-admin.ts'
import { getCalendarIcademyCatalogByClassKey } from '../_shared/calendar-icademy-catalog.ts'

type BulkClassEntry = {
  time?: string
  teacher_id?: string
  teacherId?: string
  classId?: string
  lang?: string
  group?: string
  note?: string
}

type BulkSchedule = Record<string, BulkClassEntry[]>

type CalendarInsertRow = {
  class_key: string
  class_name: string
  language_code: string
  session_date: string
  session_time: string
  teacher_id: string
  group_name: string | null
  note: string | null
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime())
}

function normalizeTime(raw: string): string | null {
  const clean = raw.trim().toLowerCase()

  const hMatch = clean.match(/^(\d{1,2})h$/)
  if (hMatch) {
    const hour = Number(hMatch[1])
    if (hour < 0 || hour > 23) return null
    return `${String(hour).padStart(2, '0')}:00:00`
  }

  const hmMatch = clean.match(/^(\d{1,2}):(\d{2})$/)
  if (hmMatch) {
    const hour = Number(hmMatch[1])
    const minute = Number(hmMatch[2])
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
  }

  const hmsMatch = clean.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (hmsMatch) {
    const hour = Number(hmsMatch[1])
    const minute = Number(hmsMatch[2])
    const second = Number(hmsMatch[3])
    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59
    ) {
      return null
    }
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
  }

  return null
}

function parseBulkSchedule(input: unknown): {
  rows: CalendarInsertRow[]
  dates: string[]
  teacherIds: string[]
  totalInputEntries: number
} {
  if (!isObject(input)) {
    throw new Error('El JSON debe ser un objeto con fechas como claves.')
  }

  const schedule = input as BulkSchedule
  const rows: CalendarInsertRow[] = []
  const dates = Object.keys(schedule)
  const teacherIds = new Set<string>()
  let totalInputEntries = 0

  if (dates.length === 0) {
    throw new Error('No hay fechas para procesar en el JSON.')
  }

  for (const dateKey of dates) {
    if (!isValidDateKey(dateKey)) {
      throw new Error(`Fecha invalida: ${dateKey}. Usa formato YYYY-MM-DD.`)
    }

    const dayEntries = schedule[dateKey]
    if (!Array.isArray(dayEntries)) {
      throw new Error(`La fecha ${dateKey} debe contener una lista de clases.`)
    }

    totalInputEntries += dayEntries.length

    for (let index = 0; index < dayEntries.length; index += 1) {
      const item = dayEntries[index]
      if (!isObject(item)) {
        throw new Error(`Entrada invalida en ${dateKey} posicion ${index + 1}.`)
      }

      const classId = String(item.classId || '').trim()
      const time = String(item.time || '').trim()
      const teacherId = String(item.teacher_id || item.teacherId || '').trim()
      const lang = String(item.lang || '').trim().toLowerCase()
      const group = typeof item.group === 'string' ? item.group.trim() : ''
      const note = typeof item.note === 'string' ? item.note.trim() : ''

      if (!classId) {
        throw new Error(`Falta classId en ${dateKey} posicion ${index + 1}.`)
      }

      const catalogEntry = getCalendarIcademyCatalogByClassKey(classId)
      if (!catalogEntry) {
        throw new Error(`classId no permitido por catalogo oficial: ${classId}.`)
      }

      if (lang && lang !== catalogEntry.languageCode) {
        throw new Error(
          `Idioma invalido para ${classId} en ${dateKey}. Esperado: ${catalogEntry.languageCode}.`,
        )
      }

      if (!teacherId) {
        throw new Error(
          `Falta teacher_id en ${dateKey} para classId ${classId}.`,
        )
      }

      if (!UUID_REGEX.test(teacherId)) {
        throw new Error(
          `teacher_id invalido en ${dateKey} para classId ${classId}.`,
        )
      }

      teacherIds.add(teacherId)

      const normalizedTime = normalizeTime(time)
      if (!normalizedTime) {
        throw new Error(
          `Hora invalida (${time}) en ${dateKey} para ${classId}. Usa 18h o 18:00.`,
        )
      }

      rows.push({
        class_key: catalogEntry.classKey,
        class_name: catalogEntry.className,
        language_code: catalogEntry.languageCode,
        session_date: dateKey,
        session_time: normalizedTime,
        teacher_id: teacherId,
        group_name: group || null,
        note: note || null,
      })
    }
  }

  return {
    rows,
    dates,
    teacherIds: Array.from(teacherIds),
    totalInputEntries,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const auth = await ensureSuperAdmin(req)
  if (!auth.ok) return auth.response

  let payload: { schedule?: unknown }
  try {
    payload = (await req.json()) as { schedule?: unknown }
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const scheduleInput = payload?.schedule
  if (!scheduleInput) {
    return jsonResponse(400, { error: 'Debes enviar un campo schedule con el JSON.' })
  }

  let parsed: {
    rows: CalendarInsertRow[]
    dates: string[]
    teacherIds: string[]
    totalInputEntries: number
  }

  try {
    parsed = parseBulkSchedule(scheduleInput)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON invalido.'
    return jsonResponse(400, { error: message })
  }

  const uniqueDates = Array.from(new Set(parsed.dates))
  const uniqueTeacherIds = Array.from(new Set(parsed.teacherIds))

  if (uniqueTeacherIds.length > 0) {
    const { data: teacherRows, error: teacherError } = await auth.adminClient
      .from('icademy_teachers')
      .select('user_id')
      .in('user_id', uniqueTeacherIds)

    if (teacherError) {
      return jsonResponse(500, {
        error: `No se pudo validar teacher_id: ${teacherError.message}`,
      })
    }

    const existingTeacherIds = new Set(
      (teacherRows || []).map((row) => String(row.user_id)),
    )
    const missingTeacherIds = uniqueTeacherIds.filter(
      (teacherId) => !existingTeacherIds.has(teacherId),
    )

    if (missingTeacherIds.length > 0) {
      return jsonResponse(400, {
        error: `teacher_id no existe en icademy_teachers: ${missingTeacherIds.join(', ')}`,
      })
    }
  }

  const { error: deleteError } = await auth.adminClient
    .from('calendar_icademy')
    .delete()
    .in('session_date', uniqueDates)

  if (deleteError) {
    return jsonResponse(500, {
      error: `No se pudieron limpiar fechas existentes: ${deleteError.message}`,
    })
  }

  if (parsed.rows.length > 0) {
    const { error: insertError } = await auth.adminClient
      .from('calendar_icademy')
      .insert(parsed.rows)

    if (insertError) {
      return jsonResponse(500, {
        error: `No se pudieron insertar clases: ${insertError.message}`,
      })
    }
  }

  return jsonResponse(200, {
    ok: true,
    replacedDates: uniqueDates.length,
    insertedRows: parsed.rows.length,
    totalInputEntries: parsed.totalInputEntries,
  })
})
