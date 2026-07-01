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

function mapQuestion(row: QuestionRow): PregunticaAdminQuestion {
  return {
    id: row.id,
    questionEs: row.question_es,
    translations: row.translations || {},
    isActive: Boolean(row.is_active),
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

  return (data || []).map((row) => mapQuestion(row as QuestionRow))
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
