import { supabase } from '../../lib/supabase'

const PREGUNTICA_AUDIO_BUCKET = 'preguntica-audios'

type RpcWeekStatusRow = {
  week_id: string
  week_start: string
  week_end: string
  timezone: string
  required_activation_words: number
  activation_words_count: number
  is_unlocked: boolean
  unlocked_via: 'progress' | 'tokens' | 'manual' | null
  unlocked_at: string | null
  completed_at: string | null
  attempts_used: number
  token_unlocks_used: number
  can_start: boolean
}

type RpcAttemptRow = {
  id: string
  user_id: string
  preguntica_week_id: string
  question_id: string | null
  attempt_number: number
  attempt_kind: 'weekly' | 'token_unlock'
  word_mode: string
  level: string | null
  target_lang: string | null
  native_lang: string | null
  question_text: string | null
  ica_words: unknown
  response_text: string | null
  response_char_count: number | null
  transcript_text: string | null
  analysis_score: number | null
  analysis_payload: unknown
  status: string
  retry_count: number
  suggestions_refresh_count: number
  error_code: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

type ProcessAttemptAudioPayload = {
  action: 'process_attempt_audio'
  attemptId: string
  audioId?: string
  targetLang?: string
  nativeLang?: string
  level?: string
  icaWords?: string[]
}

type RefreshSuggestionsPayload = {
  action: 'refresh_suggestions'
  attemptId: string
  targetLang?: string
  nativeLang?: string
  level?: string
  icaWords?: string[]
}

type PrepareAttemptPayload = {
  action: 'prepare_attempt'
  wordMode: string
  targetLang?: string
  nativeLang?: string
  level?: string
  excludeQuestionId?: string | null
}

type PrepareAttemptResult = {
  ok: boolean
  error?: string
  attempt?: RpcAttemptRow
  questionText?: string | null
  questionTranslation?: string | null
  icaWords?: string[]
}

export type PregunticaWeekStatus = {
  weekId: string
  weekStart: string
  weekEnd: string
  timezone: string
  requiredActivationWords: number
  activationWordsCount: number
  isUnlocked: boolean
  unlockedVia: 'progress' | 'tokens' | 'manual' | null
  unlockedAt: string | null
  completedAt: string | null
  attemptsUsed: number
  tokenUnlocksUsed: number
  canStart: boolean
}

export type PregunticaWordSuggestion = {
  word: string
  translation: string | null
  reason: string
}

export type PregunticaFeedback = {
  score: number
  naturalness: string
  corrections: Array<{
    original: string
    suggestion: string
    reason: string
  }>
  coachReply: string
  suggestedIcaWords: PregunticaWordSuggestion[]
}

export type PregunticaAttempt = {
  id: string
  weekId: string
  questionId: string | null
  questionTranslation: string | null
  attemptNumber: number
  attemptKind: 'weekly' | 'token_unlock'
  wordMode: string
  questionText: string | null
  icaWords: string[]
  transcriptText: string | null
  responseCharCount: number | null
  status: string
  retryCount: number
  suggestionsRefreshCount: number
  errorMessage: string | null
}

export type PregunticaAttemptAudio = {
  id: string
  attemptId: string
  storagePath: string
  durationMs: number
  mimeType: string
}

export type PregunticaHistorySuggestionSet = {
  id: string
  refreshIndex: number
  words: PregunticaWordSuggestion[]
  model: string | null
  createdAt: string
}

export type PregunticaHistoryAudio = {
  id: string
  storagePath: string
  signedUrl: string | null
  durationMs: number | null
  mimeType: string | null
  sizeBytes: number | null
  status: string
  transcriptionText: string | null
  analysisScore: number | null
  feedback: PregunticaFeedback | null
  createdAt: string
}

export type PregunticaHistoryAttempt = {
  id: string
  questionId: string | null
  questionTranslation: string | null
  attemptNumber: number
  attemptKind: 'weekly' | 'token_unlock'
  wordMode: string
  questionText: string | null
  icaWords: string[]
  responseText: string | null
  responseCharCount: number | null
  transcriptText: string | null
  retryCount: number
  status: string
  errorMessage: string | null
  feedback: PregunticaFeedback | null
  audios: PregunticaHistoryAudio[]
  suggestionsHistory: PregunticaHistorySuggestionSet[]
  createdAt: string
}

export type PregunticaHistoryWeek = {
  id: string
  weekStart: string
  weekEnd: string
  timezone: string
  isUnlocked: boolean
  unlockedVia: 'progress' | 'tokens' | 'manual' | null
  activationWordsCount: number
  requiredActivationWords: number
  completedAt: string | null
  attempts: PregunticaHistoryAttempt[]
}

export type PregunticaTokenSummary = {
  balance: number
  lastMonthlyEarnTokens: number | null
  lastMonthlyEarnMonth: string | null
  lastMonthlyEarnPoints: number | null
}

type PregunticaHistoryWeekRow = {
  id: string
  week_start: string
  week_end: string
  timezone: string
  is_unlocked: boolean
  unlocked_via: 'progress' | 'tokens' | 'manual' | null
  activation_words_count: number
  required_activation_words: number
  completed_at: string | null
}

type PregunticaAttemptAudioRow = {
  id: string
  preguntica_attempt_id: string
  storage_path: string
  duration_ms: number | null
  mime_type: string | null
  size_bytes: number | null
  status: string
  transcription_text: string | null
  analysis_score: number | null
  analysis_payload: unknown
  created_at: string
}

type PregunticaSuggestionRow = {
  id: string
  preguntica_attempt_id: string
  refresh_index: number
  suggested_words: unknown
  model: string | null
  created_at: string
}

export type ProcessAttemptAudioResult = {
  ok: boolean
  error?: string
  attemptId?: string
  audioId?: string
  transcript?: string
  responseCharCount?: number
  min?: number
  max?: number
  analysis?: PregunticaFeedback
  retriesUsed?: number
  maxRetries?: number
}

export type RefreshSuggestionsResult = {
  ok: boolean
  error?: string
  attemptId?: string
  refreshIndex?: number
  maxRefreshes?: number
  suggestions?: PregunticaWordSuggestion[]
}

export type RedeemPregunticaResult = {
  unlockId: string
  weekId: string
  spentTokens: number
  balanceAfter: number
}

export type PickPregunticaQuestionResult = {
  questionId: string
  questionEs: string
  questionTarget: string | null
  needsTranslation: boolean
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }
  return supabase
}

async function mapEdgeFunctionError(error: unknown, fallback: string): Promise<Error> {
  const rawMessage = error instanceof Error && error.message ? error.message : fallback

  let functionError = ''
  const maybeError = error as { context?: { text?: () => Promise<string> } }
  if (maybeError?.context?.text) {
    try {
      const body = await maybeError.context.text()
      if (body) {
        try {
          const parsed = JSON.parse(body) as { error?: unknown }
          if (typeof parsed.error === 'string') {
            functionError = parsed.error
          } else {
            functionError = body
          }
        } catch {
          functionError = body
        }
      }
    } catch {
      functionError = ''
    }
  }

  const source = functionError || rawMessage

  if (source.includes('EMPTY_TRANSCRIPTION')) {
    return new Error('No se detectó voz en el audio. Intenta grabar de nuevo y hablar un poco más fuerte.')
  }

  if (source.includes('INVALID_RESPONSE_LENGTH')) {
    return new Error('Tu respuesta debe tener entre 100 y 1200 caracteres para poder analizarse.')
  }

  if (source.includes('ANALYSIS_LIMIT_REACHED')) {
    return new Error('Ya usaste los 3 análisis disponibles para esta PreguntICA.')
  }

  if (source.includes('NO_ICA_WORDS_AVAILABLE')) {
    return new Error('No tienes suficientes palabras ICA para iniciar PreguntICA. Agrega más al Baúl y vuelve a intentar.')
  }

  if (source.includes('QUESTION_TRANSLATION_REQUIRED')) {
    return new Error('No se pudo preparar la pregunta en tu idioma objetivo. Intenta de nuevo en unos segundos.')
  }

  if (functionError) {
    return new Error(functionError)
  }

  return new Error(rawMessage)
}

function parseWords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (!item || typeof item !== 'object') return ''
      const record = item as Record<string, unknown>
      if (typeof record.word === 'string') return record.word.trim()
      if (typeof record.target === 'string') return record.target.trim()
      return ''
    })
    .filter(Boolean)
}

async function fetchQuestionTranslationsById(
  client: ReturnType<typeof requireSupabase>,
  questionIds: string[],
): Promise<Record<string, string>> {
  if (questionIds.length === 0) return {}

  const uniqueIds = Array.from(new Set(questionIds.filter(Boolean)))
  if (uniqueIds.length === 0) return {}

  const { data, error } = await client
    .from('preguntica_question_bank')
    .select('id, question_es')
    .in('id', uniqueIds)

  if (error) throw error

  return (data || []).reduce<Record<string, string>>((acc, item) => {
    const row = item as { id: string; question_es: string }
    if (!row.id || !row.question_es) return acc
    acc[row.id] = row.question_es
    return acc
  }, {})
}

function mapStatus(row: RpcWeekStatusRow): PregunticaWeekStatus {
  return {
    weekId: row.week_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    timezone: row.timezone,
    requiredActivationWords: Number(row.required_activation_words || 20),
    activationWordsCount: Number(row.activation_words_count || 0),
    isUnlocked: Boolean(row.is_unlocked),
    unlockedVia: row.unlocked_via,
    unlockedAt: row.unlocked_at,
    completedAt: row.completed_at,
    attemptsUsed: Number(row.attempts_used || 0),
    tokenUnlocksUsed: Number(row.token_unlocks_used || 0),
    canStart: Boolean(row.can_start),
  }
}

function mapAttempt(row: RpcAttemptRow): PregunticaAttempt {
  return {
    id: row.id,
    weekId: row.preguntica_week_id,
    questionId: row.question_id,
    questionTranslation: null,
    attemptNumber: Number(row.attempt_number || 1),
    attemptKind: row.attempt_kind,
    wordMode: row.word_mode || 'mixed',
    questionText: row.question_text,
    icaWords: parseWords(row.ica_words),
    transcriptText: row.transcript_text,
    responseCharCount: row.response_char_count,
    status: row.status,
    retryCount: Number(row.retry_count || 0),
    suggestionsRefreshCount: Number(row.suggestions_refresh_count || 0),
    errorMessage: row.error_message,
  }
}

export async function fetchPregunticaWeekStatus(): Promise<PregunticaWeekStatus | null> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_my_preguntica_week_status')

  if (error) throw error

  const row = Array.isArray(data) ? (data[0] as RpcWeekStatusRow | undefined) : (data as RpcWeekStatusRow | null)
  if (!row) return null
  return mapStatus(row)
}

export async function createPregunticaAttempt(wordMode: string): Promise<PregunticaAttempt> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('create_preguntica_attempt', {
    p_word_mode: wordMode,
  })

  if (error) throw error

  const row = Array.isArray(data) ? (data[0] as RpcAttemptRow | undefined) : (data as RpcAttemptRow | null)
  if (!row) throw new Error('No se pudo crear el intento de PreguntICA')
  return mapAttempt(row)
}

export async function createPregunticaAttemptWithPromptData(input: {
  wordMode: string
  questionText: string
  questionId?: string | null
  icaWords: string[]
  targetLang: string
  nativeLang: string
  level: string
}): Promise<PregunticaAttempt> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('create_preguntica_attempt_with_prompt_data', {
    p_word_mode: input.wordMode,
    p_question_text: input.questionText,
    p_question_id: input.questionId || null,
    p_ica_words: input.icaWords,
    p_target_lang: input.targetLang,
    p_native_lang: input.nativeLang,
    p_level: input.level,
  })

  if (error) throw error

  const row = Array.isArray(data) ? (data[0] as RpcAttemptRow | undefined) : (data as RpcAttemptRow | null)
  if (!row) throw new Error('No se pudo crear el intento de PreguntICA')
  return mapAttempt(row)
}

export async function completePregunticaAttempt(attemptId: string): Promise<PregunticaAttempt> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('complete_preguntica_attempt', {
    p_attempt_id: attemptId,
  })

  if (error) throw error

  const row = Array.isArray(data) ? (data[0] as RpcAttemptRow | undefined) : (data as RpcAttemptRow | null)
  if (!row) throw new Error('No se pudo completar el intento')
  return mapAttempt(row)
}

export async function pickPregunticaQuestion(
  targetLang: string,
  excludeQuestionId?: string | null,
): Promise<PickPregunticaQuestionResult> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('pick_preguntica_question', {
    p_target_lang: targetLang,
    p_exclude_question_id: excludeQuestionId || null,
  })

  if (error) throw error

  const row = Array.isArray(data)
    ? (data[0] as
      | {
          question_id: string
          question_es: string
          question_target: string | null
          needs_translation: boolean
        }
      | undefined)
    : (data as
      | {
          question_id: string
          question_es: string
          question_target: string | null
          needs_translation: boolean
        }
      | null)

  if (!row?.question_id || !row.question_es) {
    throw new Error('No hay preguntas disponibles en el banco de PreguntICA')
  }

  return {
    questionId: row.question_id,
    questionEs: row.question_es,
    questionTarget: row.question_target,
    needsTranslation: Boolean(row.needs_translation),
  }
}

export async function savePregunticaQuestionTranslation(input: {
  questionId: string
  targetLang: string
  translatedText: string
}): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.rpc('save_preguntica_question_translation', {
    p_question_id: input.questionId,
    p_target_lang: input.targetLang,
    p_translation: input.translatedText,
  })

  if (error) throw error
}

export async function savePregunticaAttemptPromptData(input: {
  attemptId: string
  questionText: string
  questionId?: string | null
  icaWords: string[]
  targetLang: string
  nativeLang: string
  level: string
}): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('preguntica_attempts')
    .update({
      question_id: input.questionId ?? null,
      question_text: input.questionText,
      ica_words: input.icaWords,
      target_lang: input.targetLang,
      native_lang: input.nativeLang,
      level: input.level,
    })
    .eq('id', input.attemptId)

  if (error) throw error
}

export async function fetchLatestPregunticaAttempt(
  weekId: string,
): Promise<PregunticaAttempt | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('preguntica_attempts')
    .select(
      'id, user_id, preguntica_week_id, question_id, attempt_number, attempt_kind, word_mode, level, target_lang, native_lang, question_text, ica_words, response_text, response_char_count, transcript_text, analysis_score, analysis_payload, status, retry_count, suggestions_refresh_count, error_code, error_message, created_at, updated_at',
    )
    .eq('preguntica_week_id', weekId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const mapped = mapAttempt(data as RpcAttemptRow)
  if (!mapped.questionId) return mapped

  const translationsById = await fetchQuestionTranslationsById(client, [mapped.questionId])
  return {
    ...mapped,
    questionTranslation: translationsById[mapped.questionId] || null,
  }
}

export async function uploadPregunticaAttemptAudio(input: {
  attemptId: string
  audioBlob: Blob
  mimeType: string
  durationMs: number
}): Promise<PregunticaAttemptAudio> {
  const client = requireSupabase()
  const {
    data: { session },
  } = await client.auth.getSession()

  const userId = session?.user?.id
  if (!userId) {
    throw new Error('Debes iniciar sesión para subir audio')
  }

  const audioId = crypto.randomUUID()
  const ext = input.mimeType.includes('ogg')
    ? 'ogg'
    : input.mimeType.includes('wav')
      ? 'wav'
      : input.mimeType.includes('mp4')
        ? 'm4a'
        : input.mimeType.includes('mpeg')
          ? 'mp3'
          : 'webm'

  const storagePath = `${userId}/${input.attemptId}/${audioId}.${ext}`

  const { error: uploadError } = await client.storage
    .from(PREGUNTICA_AUDIO_BUCKET)
    .upload(storagePath, input.audioBlob, {
      upsert: false,
      contentType: input.mimeType,
    })

  if (uploadError) throw uploadError

  const { error: insertError } = await client
    .from('preguntica_attempt_audios')
    .insert({
      id: audioId,
      user_id: userId,
      preguntica_attempt_id: input.attemptId,
      storage_path: storagePath,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      mime_type: input.mimeType,
      size_bytes: input.audioBlob.size,
      status: 'uploaded',
    })

  if (insertError) {
    await client.storage.from(PREGUNTICA_AUDIO_BUCKET).remove([storagePath])
    throw insertError
  }

  return {
    id: audioId,
    attemptId: input.attemptId,
    storagePath,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    mimeType: input.mimeType,
  }
}

export async function processPregunticaAttemptAudio(
  payload: Omit<ProcessAttemptAudioPayload, 'action'>,
): Promise<ProcessAttemptAudioResult> {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke<ProcessAttemptAudioResult>(
    'preguntica-center',
    {
      body: {
        action: 'process_attempt_audio',
        ...payload,
      } satisfies ProcessAttemptAudioPayload,
    },
  )

  if (error) throw await mapEdgeFunctionError(error, 'No se pudo analizar la respuesta')
  if (!data) throw new Error('Respuesta vacía de preguntica-center')
  return data
}

export async function refreshPregunticaSuggestions(
  payload: Omit<RefreshSuggestionsPayload, 'action'>,
): Promise<RefreshSuggestionsResult> {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke<RefreshSuggestionsResult>(
    'preguntica-center',
    {
      body: {
        action: 'refresh_suggestions',
        ...payload,
      } satisfies RefreshSuggestionsPayload,
    },
  )

  if (error) throw error
  if (!data) throw new Error('Respuesta vacía de preguntica-center')
  return data
}

export async function preparePregunticaAttempt(
  payload: Omit<PrepareAttemptPayload, 'action'>,
): Promise<PregunticaAttempt> {
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke<PrepareAttemptResult>('preguntica-center', {
    body: {
      action: 'prepare_attempt',
      ...payload,
    } satisfies PrepareAttemptPayload,
  })

  if (error) throw await mapEdgeFunctionError(error, 'No se pudo iniciar la PreguntICA')
  if (!data) throw new Error('Respuesta vacía de preguntica-center')
  if (!data.ok || !data.attempt) {
    throw new Error(data.error || 'No se pudo iniciar la PreguntICA')
  }

  const mapped = mapAttempt(data.attempt)
  const preparedWords = Array.isArray(data.icaWords)
    ? data.icaWords
      .filter((word): word is string => typeof word === 'string')
      .map((word) => word.trim())
      .filter(Boolean)
    : []

  const preparedQuestion = typeof data.questionText === 'string' && data.questionText.trim()
    ? data.questionText.trim()
    : mapped.questionText

  const preparedTranslation = typeof data.questionTranslation === 'string' && data.questionTranslation.trim()
    ? data.questionTranslation.trim()
    : null

  return {
    ...mapped,
    questionText: preparedQuestion,
    questionTranslation: preparedTranslation,
    icaWords: preparedWords.length > 0 ? preparedWords : mapped.icaWords,
  }
}

function parseFeedback(raw: unknown): PregunticaFeedback | null {
  if (!raw || typeof raw !== 'object') return null

  const row = raw as Record<string, unknown>
  const naturalness = typeof row.naturalness === 'string' ? row.naturalness : ''
  const coachReply = typeof row.coachReply === 'string' ? row.coachReply : ''

  if (!naturalness || !coachReply) return null

  const scoreRaw = Number(row.score)
  const score = Number.isFinite(scoreRaw) ? scoreRaw : 0

  const corrections = Array.isArray(row.corrections)
    ? row.corrections
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        original: typeof item.original === 'string' ? item.original : '',
        suggestion: typeof item.suggestion === 'string' ? item.suggestion : '',
        reason: typeof item.reason === 'string' ? item.reason : '',
      }))
      .filter((item) => item.original && item.suggestion && item.reason)
    : []

  const suggestedIcaWords = Array.isArray(row.suggestedIcaWords)
    ? row.suggestedIcaWords
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        word: typeof item.word === 'string' ? item.word : '',
        translation: typeof item.translation === 'string' ? item.translation : null,
        reason: typeof item.reason === 'string' ? item.reason : '',
      }))
      .filter((item) => item.word && item.reason)
    : []

  return {
    score,
    naturalness,
    corrections,
    coachReply,
    suggestedIcaWords,
  }
}

function parseSuggestionWords(raw: unknown): PregunticaWordSuggestion[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      word: typeof item.word === 'string' ? item.word : '',
      translation: typeof item.translation === 'string' ? item.translation : null,
      reason: typeof item.reason === 'string' ? item.reason : '',
    }))
    .filter((item) => item.word && item.reason)
}

export async function createSignedPregunticaAudioUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const client = requireSupabase()
  const { data, error } = await client.storage
    .from(PREGUNTICA_AUDIO_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error || !data?.signedUrl) {
    throw error || new Error('No se pudo generar la URL de audio')
  }

  return data.signedUrl
}

export async function fetchPregunticaHistory(
  limit = 24,
): Promise<PregunticaHistoryWeek[]> {
  const client = requireSupabase()

  const { data: weeksData, error: weeksError } = await client
    .from('preguntica_weeks')
    .select(
      'id, week_start, week_end, timezone, is_unlocked, unlocked_via, activation_words_count, required_activation_words, completed_at',
    )
    .order('week_start', { ascending: false })
    .limit(Math.max(1, limit))

  if (weeksError) throw weeksError

  const weeks = (weeksData || []) as PregunticaHistoryWeekRow[]
  if (weeks.length === 0) return []

  const weekIds = weeks.map((week) => week.id)

  const { data: attemptsData, error: attemptsError } = await client
    .from('preguntica_attempts')
    .select(
      'id, user_id, preguntica_week_id, question_id, attempt_number, attempt_kind, word_mode, level, target_lang, native_lang, question_text, ica_words, response_text, response_char_count, transcript_text, analysis_score, analysis_payload, status, retry_count, suggestions_refresh_count, error_code, error_message, created_at, updated_at',
    )
    .in('preguntica_week_id', weekIds)
    .order('created_at', { ascending: false })

  if (attemptsError) throw attemptsError

  const attempts = (attemptsData || []) as RpcAttemptRow[]
  const attemptIds = attempts.map((attemptItem) => attemptItem.id)
  const questionIds = attempts
    .map((attemptItem) => attemptItem.question_id)
    .filter((value): value is string => Boolean(value))
  const questionTranslationsById = await fetchQuestionTranslationsById(client, questionIds)

  let audioByAttempt: Record<string, PregunticaHistoryAudio[]> = {}
  let suggestionsByAttempt: Record<string, PregunticaHistorySuggestionSet[]> = {}

  if (attemptIds.length > 0) {
    const [audiosResult, suggestionsResult] = await Promise.all([
      client
        .from('preguntica_attempt_audios')
        .select(
          'id, preguntica_attempt_id, storage_path, duration_ms, mime_type, size_bytes, status, transcription_text, analysis_score, analysis_payload, created_at',
        )
        .in('preguntica_attempt_id', attemptIds)
        .order('created_at', { ascending: false }),
      client
        .from('preguntica_feedback_suggestions')
        .select(
          'id, preguntica_attempt_id, refresh_index, suggested_words, model, created_at',
        )
        .in('preguntica_attempt_id', attemptIds)
        .order('created_at', { ascending: false }),
    ])

    if (audiosResult.error) throw audiosResult.error
    if (suggestionsResult.error) throw suggestionsResult.error

    const audios = (audiosResult.data || []) as PregunticaAttemptAudioRow[]
    const suggestions = (suggestionsResult.data || []) as PregunticaSuggestionRow[]

    const signedPairs = await Promise.all(
      audios.map(async (audio) => {
        try {
          const signedUrl = await createSignedPregunticaAudioUrl(audio.storage_path)
          return [audio.id, signedUrl] as const
        } catch {
          return [audio.id, null] as const
        }
      }),
    )

    const signedById = new Map<string, string | null>(signedPairs)

    audioByAttempt = audios.reduce<Record<string, PregunticaHistoryAudio[]>>(
      (acc, audio) => {
        if (audio.status !== 'ready') return acc

        const key = audio.preguntica_attempt_id
        if (!acc[key]) acc[key] = []

        acc[key].push({
          id: audio.id,
          storagePath: audio.storage_path,
          signedUrl: signedById.get(audio.id) || null,
          durationMs: audio.duration_ms,
          mimeType: audio.mime_type,
          sizeBytes: audio.size_bytes,
          status: audio.status,
          transcriptionText: audio.transcription_text,
          analysisScore: typeof audio.analysis_score === 'number' ? audio.analysis_score : null,
          feedback: parseFeedback(audio.analysis_payload),
          createdAt: audio.created_at,
        })

        return acc
      },
      {},
    )

    suggestionsByAttempt = suggestions.reduce<Record<string, PregunticaHistorySuggestionSet[]>>(
      (acc, suggestion) => {
        const key = suggestion.preguntica_attempt_id
        if (!acc[key]) acc[key] = []

        acc[key].push({
          id: suggestion.id,
          refreshIndex: Number(suggestion.refresh_index || 0),
          words: parseSuggestionWords(suggestion.suggested_words),
          model: suggestion.model,
          createdAt: suggestion.created_at,
        })

        return acc
      },
      {},
    )
  }

  const attemptsByWeek = attempts.reduce<Record<string, PregunticaHistoryAttempt[]>>(
    (acc, attemptItem) => {
      const weekId = attemptItem.preguntica_week_id
      if (!acc[weekId]) acc[weekId] = []

      acc[weekId].push({
        id: attemptItem.id,
        questionId: attemptItem.question_id,
        questionTranslation: attemptItem.question_id
          ? questionTranslationsById[attemptItem.question_id] || null
          : null,
        attemptNumber: Number(attemptItem.attempt_number || 1),
        attemptKind: attemptItem.attempt_kind,
        wordMode: attemptItem.word_mode || 'mixed',
        questionText: attemptItem.question_text,
        icaWords: parseWords(attemptItem.ica_words),
        responseText: attemptItem.response_text,
        responseCharCount: attemptItem.response_char_count,
        transcriptText: attemptItem.transcript_text,
        retryCount: Number(attemptItem.retry_count || 0),
        status: attemptItem.status,
        errorMessage: attemptItem.error_message,
        feedback: parseFeedback(attemptItem.analysis_payload),
        audios: audioByAttempt[attemptItem.id] || [],
        suggestionsHistory: suggestionsByAttempt[attemptItem.id] || [],
        createdAt: attemptItem.created_at,
      })

      return acc
    },
    {},
  )

  return weeks.map((week) => ({
    id: week.id,
    weekStart: week.week_start,
    weekEnd: week.week_end,
    timezone: week.timezone,
    isUnlocked: Boolean(week.is_unlocked),
    unlockedVia: week.unlocked_via,
    activationWordsCount: Number(week.activation_words_count || 0),
    requiredActivationWords: Number(week.required_activation_words || 20),
    completedAt: week.completed_at,
    attempts: attemptsByWeek[week.id] || [],
  }))
}

export async function fetchPregunticaTokenSummary(): Promise<PregunticaTokenSummary> {
  const client = requireSupabase()

  const [{ data: balanceData, error: balanceError }, { data: monthlyData, error: monthlyError }] = await Promise.all([
    client.rpc('get_my_preguntica_token_balance'),
    client
      .from('preguntica_token_ledger')
      .select('tokens_delta, reference_month, metadata')
      .eq('entry_type', 'monthly_earn')
      .order('reference_month', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (balanceError) throw balanceError
  if (monthlyError) throw monthlyError

  const monthly = monthlyData as
    | { tokens_delta: number; reference_month: string | null; metadata: Record<string, unknown> | null }
    | null

  const lastPointsRaw = monthly?.metadata?.points
  const lastPoints = typeof lastPointsRaw === 'number'
    ? lastPointsRaw
    : typeof lastPointsRaw === 'string'
      ? Number(lastPointsRaw)
      : null

  return {
    balance: Number(balanceData || 0),
    lastMonthlyEarnTokens: monthly ? Number(monthly.tokens_delta || 0) : null,
    lastMonthlyEarnMonth: monthly?.reference_month || null,
    lastMonthlyEarnPoints: Number.isFinite(lastPoints as number) ? (lastPoints as number) : null,
  }
}

export async function redeemPregunticaTokensForWeek(
  weekStart: string,
): Promise<RedeemPregunticaResult> {
  const client = requireSupabase()

  const { data, error } = await client.rpc('redeem_preguntica_tokens_for_week', {
    p_week_start: weekStart,
    p_tokens_to_spend: 1,
  })

  if (error) throw error

  const row = Array.isArray(data)
    ? (data[0] as
      | {
          unlock_id: string
          week_id: string
          spent_tokens: number
          balance_after: number
        }
      | undefined)
    : (data as
      | {
          unlock_id: string
          week_id: string
          spent_tokens: number
          balance_after: number
        }
      | null)

  if (!row) {
    throw new Error('No se pudo registrar el canje de fichas')
  }

  return {
    unlockId: row.unlock_id,
    weekId: row.week_id,
    spentTokens: Number(row.spent_tokens || 0),
    balanceAfter: Number(row.balance_after || 0),
  }
}
