import { supabase } from '@/lib/supabase'

type QuestionRow = {
  id: string
  question_es: string
  translations: Record<string, string> | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PregunticaAdminQuestion = {
  id: string
  questionEs: string
  translations: Record<string, string>
  isActive: boolean
  usageCount: number
  canDelete: boolean
  createdAt: string
  updatedAt: string
}

export type PregunticaBulkImportResult = {
  received: number
  insertedOrUpdated: number
  ignored: number
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase no está configurado')
  }
  return supabase
}

function mapQuestion(row: QuestionRow, usageCount: number): PregunticaAdminQuestion {
  return {
    id: row.id,
    questionEs: row.question_es,
    translations: row.translations || {},
    isActive: Boolean(row.is_active),
    usageCount,
    canDelete: usageCount <= 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchPregunticaQuestions(
  search = '',
): Promise<PregunticaAdminQuestion[]> {
  const client = requireSupabase()
  const normalized = search.trim()

  let query = client
    .from('preguntica_question_bank')
    .select('id, question_es, translations, is_active, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (normalized) {
    query = query.ilike('question_es', `%${normalized}%`)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = (data || []) as QuestionRow[]
  const questionIds = rows.map((row) => row.id)

  let usageByQuestionId = new Map<string, number>()
  if (questionIds.length > 0) {
    const { data: usageData, error: usageError } = await client.rpc(
      'get_preguntica_question_usage_counts',
      {
        p_question_ids: questionIds,
      },
    )

    if (usageError) throw usageError
    const usageRows = (usageData || []) as Array<{ question_id: string; usage_count: number }>

    usageByQuestionId = usageRows.reduce((acc: Map<string, number>, row) => {
      const questionId = typeof row.question_id === 'string' ? row.question_id : ''
      if (!questionId) return acc
      acc.set(questionId, Number(row.usage_count || 0))
      return acc
    }, new Map<string, number>())
  }

  return rows.map((row) => mapQuestion(row, usageByQuestionId.get(row.id) || 0))
}

export async function bulkImportPregunticaQuestions(
  rawText: string,
): Promise<PregunticaBulkImportResult> {
  const client = requireSupabase()

  const lines = rawText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)

  const uniqueLines = Array.from(new Set(lines.map((line) => line.normalize('NFKC'))))

  if (uniqueLines.length === 0) {
    return { received: 0, insertedOrUpdated: 0, ignored: 0 }
  }

  const payload = uniqueLines.map((question) => ({
    question_es: question,
    is_active: true,
  }))

  const { data, error } = await client
    .from('preguntica_question_bank')
    .upsert(payload, { onConflict: 'question_es_normalized' })
    .select('id')

  if (error) throw error

  return {
    received: lines.length,
    insertedOrUpdated: (data || []).length,
    ignored: Math.max(lines.length - uniqueLines.length, 0),
  }
}

export async function updatePregunticaQuestionState(
  questionId: string,
  isActive: boolean,
): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('preguntica_question_bank')
    .update({ is_active: isActive })
    .eq('id', questionId)

  if (error) throw error
}

export async function updatePregunticaQuestionText(
  questionId: string,
  questionEs: string,
): Promise<void> {
  const client = requireSupabase()
  const normalized = questionEs.trim()
  if (!normalized) throw new Error('La pregunta no puede estar vacía')

  const { error } = await client
    .from('preguntica_question_bank')
    .update({
      question_es: normalized,
      translations: {},
    })
    .eq('id', questionId)

  if (error) throw error
}

export async function deletePregunticaQuestionIfUnused(questionId: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.rpc('delete_preguntica_question_if_unused', {
    p_question_id: questionId,
  })

  if (error) {
    if (error.message.includes('QUESTION_ALREADY_USED')) {
      throw new Error('No se puede eliminar esta pregunta porque ya fue usada en intentos.')
    }
    throw error
  }
}
