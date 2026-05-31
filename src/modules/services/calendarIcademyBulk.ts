import { supabase } from '@/lib/supabase'

export class CalendarIcademyBulkRequestError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'CalendarIcademyBulkRequestError'
    this.status = status
  }
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as { context?: { status?: number } }
  if (typeof value.context?.status === 'number') return value.context.status
  return null
}

export type CalendarIcademyBulkResult = {
  ok: boolean
  replacedDates: number
  insertedRows: number
  totalInputEntries: number
}

export async function uploadCalendarIcademyBulkJson(input: {
  schedule: unknown
}): Promise<CalendarIcademyBulkResult> {
  if (!supabase) {
    throw new CalendarIcademyBulkRequestError('Supabase no esta configurado.')
  }

  const { data, error } = await supabase.functions.invoke<CalendarIcademyBulkResult>(
    'calendar-icademy-bulk-upsert',
    {
      body: input,
    },
  )

  if (error) {
    throw new CalendarIcademyBulkRequestError(
      'No se pudo ejecutar la carga masiva del calendario.',
      getErrorStatus(error),
    )
  }

  if (!data || typeof data.insertedRows !== 'number') {
    throw new CalendarIcademyBulkRequestError(
      'Respuesta invalida de carga masiva.',
    )
  }

  return data
}
