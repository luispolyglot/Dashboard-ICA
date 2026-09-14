import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'
import {
  DEFAULT_LEVEL_FAMILY,
  LANG_TO_FAMILY,
  LEVEL_KEYS,
  LEVEL_THRESHOLDS_BY_FAMILY,
  type LevelKey,
} from '../../../src/shared/ica-leveling.ts'

type ProcessAttemptPayload = {
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
  currentSuggestions?: string[]
}

type PrepareAttemptPayload = {
  action: 'prepare_attempt'
  wordMode: string
  targetLang?: string
  nativeLang?: string
  level?: string
  excludeQuestionId?: string | null
}

type RequestPayload = ProcessAttemptPayload | RefreshSuggestionsPayload | PrepareAttemptPayload

type AttemptRow = {
  id: string
  user_id: string
  transcript_text: string | null
  response_text: string | null
  response_char_count: number | null
  target_lang: string | null
  native_lang: string | null
  level: string | null
  ica_words: unknown
  analysis_payload: Record<string, unknown> | null
  retry_count: number
  suggestions_refresh_count: number
  status: string
}

type AudioRow = {
  id: string
  user_id: string
  preguntica_attempt_id: string
  storage_path: string
  mime_type: string | null
  status: string
  analysis_score?: number | null
  analysis_payload?: Record<string, unknown> | null
}

type AttemptCreateRow = {
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

type LexicardWordRow = {
  target: string | null
  importance: string | null
}

type PickQuestionRow = {
  question_id: string
  question_es: string
  question_target: string | null
  needs_translation: boolean
}

type AnthropicTextBlock = {
  type: 'text'
  text: string
}

type AnthropicResponse = {
  content?: AnthropicTextBlock[]
}

type OpenAiTranscriptionResponse = {
  text?: string
}

type SuggestionWord = {
  word: string
  translation: string
  reason: string
}

type FeedbackPayload = {
  score: number
  naturalness: string
  corrections: Array<{
    original: string
    suggestion: string
    reason: string
  }>
  coachReply: string
  suggestedIcaWords: SuggestionWord[]
}

type MetaTrackerRow = {
  start_level: string | null
  prior_ica_words: number | null
  activation_words_total: number | null
  confirmed_at: string | null
}

function parseWords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeComparableText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function normalizeLooseText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeWordMode(value: string | undefined): string {
  const mode = (value || 'mixed').trim().toLowerCase()
  if (!mode) return 'mixed'
  if (['mixed', 'vital', 'frequent', 'occasional', 'rare'].includes(mode)) return mode
  return 'mixed'
}

function normalizeStudyLevel(value: string | null | undefined): string {
  const normalized = (value || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!normalized) return 'A2'
  if (normalized === 'PREA1' || normalized === 'PRE-A1') return 'Pre-A1'
  if (normalized === 'LEVEL0' || normalized === 'A0' || normalized === '0') return 'Pre-A1'
  if (normalized === 'A1PLUS') return 'A1+'
  if (normalized === 'A2PLUS') return 'A2+'
  if (normalized === 'B1PLUS') return 'B1+'
  if (normalized === 'B2PLUS') return 'B2+'
  if (normalized === 'A1' || normalized === 'A1+' || normalized === 'A2' || normalized === 'A2+' || normalized === 'B1' || normalized === 'B1+' || normalized === 'B2' || normalized === 'B2+' || normalized === 'C1') {
    return normalized
  }
  if (normalized === 'C2') return 'C1'
  return 'A2'
}

function getLevelThresholds(language: string): Record<LevelKey, number> {
  const family = LANG_TO_FAMILY[language] || DEFAULT_LEVEL_FAMILY
  return LEVEL_THRESHOLDS_BY_FAMILY[family]
}

function getCurrentLevelKey(totalWords: number, thresholds: Record<LevelKey, number>): string {
  const stops = [0, ...LEVEL_KEYS.map((key) => thresholds[key])]
  const max = stops[stops.length - 1]
  const safeTotal = Math.max(0, totalWords)
  const clamped = Math.max(0, Math.min(safeTotal, max))

  if (safeTotal >= max) return 'C1'

  let idx = 0
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (clamped >= stops[i] && clamped < stops[i + 1]) {
      idx = i
      break
    }
    if (clamped >= stops[stops.length - 1]) idx = stops.length - 2
  }

  return idx === 0 ? 'Pre-A1' : LEVEL_KEYS[idx - 1]
}

async function resolveStudyLevelForPair(
  adminClient: any,
  userId: string,
  targetLang: string,
  nativeLang: string,
  fallbackLevel: string,
): Promise<string> {
  const normalizedFallback = normalizeStudyLevel(fallbackLevel)
  if (!targetLang || !nativeLang) return normalizedFallback

  try {
    const { data, error } = await adminClient
      .from('user_meta_tracker')
      .select('start_level, prior_ica_words, activation_words_total, confirmed_at')
      .eq('user_id', userId)
      .eq('target_lang', targetLang)
      .eq('native_lang', nativeLang)
      .maybeSingle<MetaTrackerRow>()

    if (error || !data || !data.confirmed_at) {
      return normalizedFallback
    }

    const thresholds = getLevelThresholds(targetLang)
    const startLevelRaw = typeof data.start_level === 'string' ? data.start_level.trim() : '0'
    const startLevel = LEVEL_KEYS.includes(startLevelRaw as LevelKey)
      ? (startLevelRaw as LevelKey)
      : null
    const baseWords = startLevel ? (thresholds[startLevel] || 0) : 0
    const priorWords = Number.isFinite(Number(data.prior_ica_words)) ? Number(data.prior_ica_words) : 0
    const activationWords = Number.isFinite(Number(data.activation_words_total))
      ? Number(data.activation_words_total)
      : 0
    const totalWords = baseWords + priorWords + activationWords
    return normalizeStudyLevel(getCurrentLevelKey(totalWords, thresholds))
  } catch {
    return normalizedFallback
  }
}

function wordsAllowedByLevel(level: string | undefined): number {
  const normalized = normalizeStudyLevel(level)
  if (['Pre-A1', 'A1', 'A1+', 'A2', 'A2+'].includes(normalized)) return 1
  if (['B1', 'B1+', 'B2'].includes(normalized)) return 2
  if (['B2+', 'C1'].includes(normalized)) return 3
  return 1
}

function minCharsByLevel(level: string | undefined): number {
  const normalized = normalizeStudyLevel(level)
  if (normalized === 'Pre-A1') return 30
  if (normalized === 'A1') return 40
  if (normalized === 'A1+') return 48
  if (normalized === 'A2') return 55
  if (normalized === 'A2+') return 62
  if (normalized === 'B1') return 70
  if (normalized === 'B1+') return 78
  if (normalized === 'B2') return 85
  if (normalized === 'B2+') return 92
  return 100
}

function randomize<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function isSpanishLanguage(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized === 'español' || normalized === 'espanol' || normalized === 'spanish' || normalized === 'es'
}

function sanitizeTranslation(value: string): string | null {
  let cleaned = value.trim()
  if (!cleaned || cleaned === '—') return null
  if (/\n|\r/.test(cleaned)) return null

  cleaned = cleaned.split(/\s*[\/|]\s*/)[0]?.trim() || ''
  cleaned = cleaned.replace(/\([^)]*\)/g, '').trim()
  cleaned = cleaned.replace(/^['"`]+|['"`]+$/g, '').trim()

  if (!cleaned || cleaned === '—') return null
  if (cleaned.length > 120) return null
  return cleaned
}

function parseTranslationCandidate(raw: string | null): string | null {
  if (!raw) return null

  const parsed = parseLastJsonObject(raw)
  if (parsed) {
    const translationRaw = typeof parsed.translation === 'string' ? parsed.translation : ''
    return sanitizeTranslation(translationRaw)
  }

  return sanitizeTranslation(raw)
}

function filterSuggestedWords(
  suggestions: SuggestionWord[],
  transcript: string,
  blockedWords: string[],
): SuggestionWord[] {
  if (!suggestions.length) return []

  const transcriptNormalized = normalizeLooseText(transcript)
  const blocked = new Set(
    blockedWords
      .map((word) => normalizeLooseText(word))
      .filter(Boolean),
  )
  const reinforcementPattern =
    /(used correctly|already used|ya la usaste|ya lo usaste|usaste correctamente|refuerz|keep using)/i

  const filtered = suggestions.filter((item) => {
    if (reinforcementPattern.test(item.reason)) return false

    const normalizedWord = normalizeLooseText(item.word)
    if (!normalizedWord) return false
    if (blocked.has(normalizedWord)) return false
    if (transcriptNormalized.includes(normalizedWord)) return false
    return true
  })

  const seen = new Set<string>()
  return filtered.filter((item) => {
    const key = normalizeLooseText(item.word)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function parseSuggestionWordsFromRows(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const record = item as Record<string, unknown>
      return typeof record.word === 'string' ? record.word.trim() : ''
    })
    .filter(Boolean)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function extractJsonObjects(raw: string): string[] {
  const results: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }

    if (char === '}') {
      if (depth === 0) continue
      depth -= 1
      if (depth === 0 && start !== -1) {
        results.push(raw.slice(start, i + 1))
        start = -1
      }
    }
  }

  return results
}

function parseLastJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null

  const cleaned = raw.replace(/```json|```/gi, '').trim()
  if (!cleaned) return null

  try {
    const direct = JSON.parse(cleaned)
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return direct as Record<string, unknown>
    }
  } catch {
    // fallback to extracted objects
  }

  const objects = extractJsonObjects(cleaned)
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(objects[i])
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // continue
    }
  }

  return null
}

function readTextBlocks(data: AnthropicResponse): string | null {
  const text = data.content
    ?.map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
  return text || null
}

async function createClients(req: Request): Promise<
  | {
      ok: true
      userId: string
      authClient: any
      adminClient: any
    }
  | {
      ok: false
      response: Response
    }
> {
  const authHeader = req.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!authHeader || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return {
      ok: false,
      response: jsonResponse(500, { error: 'Supabase function environment is not configured' }),
    }
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      response: jsonResponse(401, { error: 'Unauthorized' }),
    }
  }

  const adminClient = createClient<any>(supabaseUrl, serviceRoleKey)
  return { ok: true, userId: user.id, authClient, adminClient }
}

async function callWhisper(audioBlob: Blob, mimeType: string | null): Promise<OpenAiTranscriptionResponse> {
  const apiKey = Deno.env.get('OPENAI_WHISPER_API_KEY')
  const model = Deno.env.get('OPENAI_WHISPER_MODEL') || 'whisper-1'
  const baseUrl = Deno.env.get('OPENAI_BASE_URL') || 'https://api.openai.com'

  if (!apiKey) {
    throw new Error('Missing OPENAI_WHISPER_API_KEY secret')
  }

  const form = new FormData()
  form.append('model', model)
  form.append('response_format', 'json')

  const normalizedMime = (mimeType || '').toLowerCase()
  const ext = normalizedMime.includes('flac')
    ? 'flac'
    : normalizedMime.includes('wav')
      ? 'wav'
      : normalizedMime.includes('mp4') || normalizedMime.includes('m4a')
        ? 'm4a'
        : normalizedMime.includes('mpeg') || normalizedMime.includes('mpga') || normalizedMime.includes('mp3')
          ? 'mp3'
          : normalizedMime.includes('oga')
            ? 'oga'
            : normalizedMime.includes('ogg')
              ? 'ogg'
              : 'webm'

  const file = new File([audioBlob], `preguntica.${ext}`, {
    type: normalizedMime || 'audio/webm',
  })
  form.append('file', file)

  const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Whisper error ${response.status}: ${body}`)
  }

  return (await response.json()) as OpenAiTranscriptionResponse
}

async function callAnthropic(system: string, userPrompt: string): Promise<string | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6'
  const baseUrl = Deno.env.get('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com'

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY secret')
  }

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Anthropic error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as AnthropicResponse
  return readTextBlocks(data)
}

function parseFeedback(raw: string | null): FeedbackPayload | null {
  const parsed = parseLastJsonObject(raw)
  if (!parsed) return null

  const scoreRaw = Number(parsed.score)
  const score = Number.isFinite(scoreRaw) ? clamp(Math.round(scoreRaw * 10) / 10, 0, 10) : 0
  const naturalness = typeof parsed.naturalness === 'string' ? parsed.naturalness.trim() : ''
  const coachReply = typeof parsed.coachReply === 'string' ? parsed.coachReply.trim() : ''

  const corrections = Array.isArray(parsed.corrections)
    ? parsed.corrections
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        original: typeof item.original === 'string' ? item.original.trim() : '',
        suggestion: typeof item.suggestion === 'string' ? item.suggestion.trim() : '',
        reason: typeof item.reason === 'string' ? item.reason.trim() : '',
      }))
      .filter((item) => item.original && item.suggestion && item.reason)
      .slice(0, 5)
    : []

  const suggestedIcaWords = Array.isArray(parsed.suggestedIcaWords)
    ? parsed.suggestedIcaWords
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        word: typeof item.word === 'string' ? item.word.trim() : '',
        translation: typeof item.translation === 'string' ? item.translation.trim() : '',
        reason: typeof item.reason === 'string' ? item.reason.trim() : '',
      }))
      .filter((item) => item.word && item.translation && item.reason)
      .slice(0, 8)
    : []

  if (!naturalness || !coachReply) return null

  return {
    score,
    naturalness,
    corrections,
    coachReply,
    suggestedIcaWords,
  }
}

function parseSuggestions(raw: string | null): SuggestionWord[] {
  const parsed = parseLastJsonObject(raw)
  if (!parsed || !Array.isArray(parsed.suggestedIcaWords)) return []

  return parsed.suggestedIcaWords
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      word: typeof item.word === 'string' ? item.word.trim() : '',
      translation: typeof item.translation === 'string' ? item.translation.trim() : '',
      reason: typeof item.reason === 'string' ? item.reason.trim() : '',
    }))
    .filter((item) => item.word && item.translation && item.reason)
    .slice(0, 8)
}

function buildFeedbackPrompt(input: {
  transcript: string
  icaWords: string[]
  targetLang: string
  nativeLang: string
  level: string
}): string {
  const wordsBlock = input.icaWords.length ? input.icaWords.join(', ') : 'none provided'

  return [
    `Target language: ${input.targetLang}`,
    `Learner native language: ${input.nativeLang}`,
    `CEFR level: ${input.level}`,
    `Words the learner should try to use: ${wordsBlock}`,
    '',
    'Analyze the learner response and give clear, concise coaching in native language.',
    '',
    'Rules for suggestedIcaWords (CRITICAL):',
    'A suggestion may be included only if the learner did not use it and it would be natural and useful in this exact context and CEFR level.',
    'NEVER include a word or phrase already present in the learner response.',
    'NEVER include a word or phrase the learner already used correctly.',
    'NEVER include a word or phrase that is already in "Words the learner should try to use".',
    'Reinforcement or praise are not valid reasons for suggestedIcaWords.',
    'If fewer than 8 items qualify, return fewer. Empty array is valid.',
    '',
    'Output STRICT JSON only with shape:',
    '{"score":0-10,"naturalness":"...","corrections":[{"original":"...","suggestion":"...","reason":"..."}],"coachReply":"...","suggestedIcaWords":[{"word":"...","translation":"...","reason":"..."}]}',
    'Rules:',
    '- score from 0 to 10',
    '- corrections max 5',
    '- suggestedIcaWords max 8',
    '- translation must be in learner native language',
    '- keep suggestions concrete and actionable',
    '- return ONLY one JSON object, no markdown, no extra text',
    '',
    'Learner response:',
    input.transcript,
  ].join('\n')
}

async function getAttempt(adminClient: any, userId: string, attemptId: string): Promise<AttemptRow> {
  const { data, error } = await adminClient
    .from('preguntica_attempts')
    .select(
      'id, user_id, transcript_text, response_text, response_char_count, target_lang, native_lang, level, ica_words, analysis_payload, retry_count, suggestions_refresh_count, status',
    )
    .eq('id', attemptId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('ATTEMPT_NOT_FOUND')
  return data as AttemptRow
}

async function getAudio(
  adminClient: any,
  userId: string,
  attemptId: string,
  audioId?: string,
): Promise<AudioRow> {
  const query = audioId
    ? adminClient
      .from('preguntica_attempt_audios')
      .select('id, user_id, preguntica_attempt_id, storage_path, mime_type, status')
      .eq('id', audioId)
      .eq('user_id', userId)
      .eq('preguntica_attempt_id', attemptId)
      .limit(1)
    : adminClient
      .from('preguntica_attempt_audios')
      .select('id, user_id, preguntica_attempt_id, storage_path, mime_type, status')
      .eq('user_id', userId)
      .eq('preguntica_attempt_id', attemptId)
      .order('created_at', { ascending: false })
      .limit(1)

  const { data, error } = await query.maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('ATTEMPT_AUDIO_NOT_FOUND')
  return data as AudioRow
}

async function cleanupFailedAudio(adminClient: any, audio: AudioRow): Promise<void> {
  await adminClient
    .storage
    .from('preguntica-audios')
    .remove([audio.storage_path])

  await adminClient
    .from('preguntica_attempt_audios')
    .delete()
    .eq('id', audio.id)
}

async function fetchLexicardWords(
  adminClient: any,
  userId: string,
  targetLang: string,
  nativeLang: string,
): Promise<LexicardWordRow[]> {
  const baseQuery = () => adminClient
    .from('lexicards')
    .select('target, importance')
    .eq('user_id', userId)

  const withLang = await baseQuery()
    .eq('target_lang', targetLang)
    .eq('native_lang', nativeLang)
    .limit(600)

  if (withLang.error) {
    throw new Error(withLang.error.message)
  }

  const withLangRows = (withLang.data || []) as LexicardWordRow[]
  if (withLangRows.length > 0) return withLangRows

  const fallback = await baseQuery().limit(600)
  if (fallback.error) {
    throw new Error(fallback.error.message)
  }

  return (fallback.data || []) as LexicardWordRow[]
}

function pickWordsForAttempt(
  rows: LexicardWordRow[],
  mode: string,
  level: string,
): string[] {
  const cleaned = rows
    .map((row) => ({
      target: typeof row.target === 'string' ? row.target.trim() : '',
      importance: typeof row.importance === 'string' ? row.importance.trim().toLowerCase() : '',
    }))
    .filter((row) => row.target.length > 0)

  if (cleaned.length === 0) {
    throw new Error('NO_ICA_WORDS_AVAILABLE')
  }

  const uniqueTargets = new Map<string, { target: string; importance: string }>()
  for (const row of cleaned) {
    const key = normalizeComparableText(row.target)
    if (!key || uniqueTargets.has(key)) continue
    uniqueTargets.set(key, row)
  }

  const all = Array.from(uniqueTargets.values())
  const preferred = mode === 'mixed' ? all : all.filter((row) => row.importance === mode)
  const shortPreferred = preferred.filter((row) => wordCount(row.target) <= 3)
  const shortAll = all.filter((row) => wordCount(row.target) <= 3)

  const pool = shortPreferred.length > 0
    ? shortPreferred
    : shortAll.length > 0
      ? shortAll
      : preferred.length > 0
        ? preferred
        : all

  if (pool.length === 0) {
    throw new Error('NO_ICA_WORDS_AVAILABLE')
  }

  const count = Math.max(1, Math.min(wordsAllowedByLevel(level), pool.length))
  return randomize(pool)
    .slice(0, count)
    .map((item) => item.target)
}

async function pickQuestionForAttempt(
  authClient: any,
  targetLang: string,
  excludeQuestionId?: string | null,
): Promise<PickQuestionRow> {
  const { data, error } = await authClient.rpc('pick_preguntica_question', {
    p_target_lang: targetLang,
    p_exclude_question_id: excludeQuestionId || null,
  })

  if (error) throw new Error(error.message)

  const row = Array.isArray(data)
    ? (data[0] as PickQuestionRow | undefined)
    : (data as PickQuestionRow | null)

  if (!row?.question_id || !row.question_es) {
    throw new Error('QUESTION_BANK_EMPTY')
  }

  return row
}

async function translateQuestion(questionEs: string, targetLang: string): Promise<string | null> {
  const raw = await callAnthropic(
    [
      'Eres un motor de traduccion para una app educativa.',
      `Traduce del espanol a ${targetLang}.`,
      '',
      'Reglas:',
      `- Devuelve SOLO la traduccion final, escrita SOLO en ${targetLang}.`,
      '- Nunca incluyas el texto original.',
      '- No anadas explicaciones, alternativas, barras ni parentesis.',
      '- Si hay varios sentidos validos, elige el mas frecuente en uso general.',
      '- Si detectas errores ortograficos, corrige primero y traduce despues.',
    ].join('\n'),
    questionEs,
  )

  return parseTranslationCandidate(raw)
}

async function prepareAttempt(
  authClient: any,
  adminClient: any,
  userId: string,
  payload: PrepareAttemptPayload,
): Promise<Response> {
  const wordMode = normalizeWordMode(payload.wordMode)
  const targetLang = (payload.targetLang || 'English').trim() || 'English'
  const nativeLang = (payload.nativeLang || 'Español').trim() || 'Español'
  const level = await resolveStudyLevelForPair(
    adminClient,
    userId,
    targetLang,
    nativeLang,
    payload.level || 'A2',
  )

  const lexicardRows = await fetchLexicardWords(adminClient, userId, targetLang, nativeLang)
  const pickedWords = pickWordsForAttempt(lexicardRows, wordMode, level)

  const selectedQuestion = await pickQuestionForAttempt(authClient, targetLang, payload.excludeQuestionId)
  const cachedTarget = (selectedQuestion.question_target || '').trim()
  const questionEs = selectedQuestion.question_es.trim()

  let questionText = cachedTarget || questionEs
  const shouldTranslate = !isSpanishLanguage(targetLang)
    && (selectedQuestion.needs_translation || !cachedTarget || normalizeComparableText(cachedTarget) === normalizeComparableText(questionEs))

  if (shouldTranslate) {
    const translated = await translateQuestion(questionEs, targetLang)
    if (!translated) {
      throw new Error('QUESTION_TRANSLATION_REQUIRED')
    }

    questionText = translated.trim()

    const { error: saveError } = await authClient.rpc('save_preguntica_question_translation', {
      p_question_id: selectedQuestion.question_id,
      p_target_lang: targetLang,
      p_translation: questionText,
    })

    if (saveError) {
      throw new Error(saveError.message)
    }
  }

  const { data: createdData, error: createdError } = await authClient.rpc(
    'create_preguntica_attempt_with_prompt_data',
    {
      p_word_mode: wordMode,
      p_question_text: questionText,
      p_question_id: selectedQuestion.question_id,
      p_ica_words: pickedWords,
      p_target_lang: targetLang,
      p_native_lang: nativeLang,
      p_level: level,
    },
  )

  if (createdError) {
    throw new Error(createdError.message)
  }

  const attemptRow = Array.isArray(createdData)
    ? (createdData[0] as AttemptCreateRow | undefined)
    : (createdData as AttemptCreateRow | null)

  if (!attemptRow?.id) {
    throw new Error('ATTEMPT_CREATION_FAILED')
  }

  return jsonResponse(200, {
    ok: true,
    attempt: attemptRow,
    questionText,
    questionTranslation: questionEs,
    icaWords: pickedWords,
  })
}

async function processAttemptAudio(
  adminClient: any,
  userId: string,
  payload: ProcessAttemptPayload,
): Promise<Response> {
  const attempt = await getAttempt(adminClient, userId, payload.attemptId)
  const retriesUsed = Number(attempt.retry_count || 0)

  if (retriesUsed >= 3) {
    return jsonResponse(200, {
      ok: false,
      error: 'ANALYSIS_LIMIT_REACHED',
      retriesUsed,
      maxRetries: 3,
    })
  }

  const audio = await getAudio(adminClient, userId, payload.attemptId, payload.audioId)

  await adminClient
    .from('preguntica_attempt_audios')
    .update({ status: 'processing' })
    .eq('id', audio.id)

  await adminClient
    .from('preguntica_attempts')
    .update({ status: 'analyzing' })
    .eq('id', attempt.id)

  const { data: audioBlob, error: downloadError } = await adminClient
    .storage
    .from('preguntica-audios')
    .download(audio.storage_path)

  if (downloadError || !audioBlob) {
    throw new Error(downloadError?.message || 'Could not download attempt audio')
  }

  const whisper = await callWhisper(audioBlob, audio.mime_type)
  const transcript = (whisper.text || '').trim()
  const charCount = transcript.length
  const targetLang = (payload.targetLang || attempt.target_lang || 'English').trim()
  const nativeLang = (payload.nativeLang || attempt.native_lang || 'Español').trim()
  const level = await resolveStudyLevelForPair(
    adminClient,
    userId,
    targetLang,
    nativeLang,
    payload.level || attempt.level || 'A2',
  )
  const minRequired = minCharsByLevel(level)
  const maxAllowed = 1200
  const isLengthValid = charCount >= minRequired && charCount <= maxAllowed

  await adminClient
    .from('preguntica_attempt_audios')
    .update({
      status: 'transcribed',
      transcription_text: transcript || null,
      transcription_payload: whisper as unknown as Record<string, unknown>,
    })
    .eq('id', audio.id)

  await adminClient
    .from('preguntica_attempts')
    .update({
      transcript_text: transcript || null,
      response_text: transcript || null,
      response_char_count: transcript ? charCount : null,
      level,
      transcript_provider: 'openai',
      transcript_model: Deno.env.get('OPENAI_WHISPER_MODEL') || 'whisper-1',
      status: isLengthValid ? 'analyzing' : 'failed',
      error_code: isLengthValid ? null : 'INVALID_RESPONSE_LENGTH',
      error_message: isLengthValid
        ? null
        : `La respuesta debe tener entre ${minRequired} y ${maxAllowed} caracteres para este nivel.`,
    })
    .eq('id', attempt.id)

  if (!transcript) {
    await cleanupFailedAudio(adminClient, audio)
    return jsonResponse(200, {
      ok: false,
      error: 'EMPTY_TRANSCRIPTION',
    })
  }

  if (!isLengthValid) {
    await cleanupFailedAudio(adminClient, audio)
    return jsonResponse(200, {
      ok: false,
      error: 'INVALID_RESPONSE_LENGTH',
      transcript,
      responseCharCount: charCount,
      min: minRequired,
      max: maxAllowed,
    })
  }

  const icaWords = payload.icaWords && payload.icaWords.length
    ? payload.icaWords
    : parseWords(attempt.ica_words)

  const rawAnalysis = await callAnthropic(
    'You are an expert speaking coach. Be precise and honest. Reply only with valid JSON.',
    buildFeedbackPrompt({
      transcript,
      icaWords,
      targetLang,
      nativeLang,
      level,
    }),
  )

  const parsed = parseFeedback(rawAnalysis)
  if (!parsed) {
    throw new Error('INVALID_ANALYSIS_PAYLOAD')
  }

  parsed.suggestedIcaWords = filterSuggestedWords(
    parsed.suggestedIcaWords,
    transcript,
    icaWords,
  )

  await adminClient
    .from('preguntica_attempts')
    .update({
      analysis_provider: 'anthropic',
      analysis_model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6',
      analysis_score: parsed.score,
      analysis_payload: parsed as unknown as Record<string, unknown>,
      retry_count: retriesUsed + 1,
      status: 'analyzed',
      error_code: null,
      error_message: null,
    })
    .eq('id', attempt.id)

  await adminClient
    .from('preguntica_feedback_suggestions')
    .upsert(
      {
        user_id: userId,
        preguntica_attempt_id: attempt.id,
        refresh_index: 0,
        suggested_words: parsed.suggestedIcaWords as unknown as Record<string, unknown>[],
        model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6',
      },
      { onConflict: 'preguntica_attempt_id,refresh_index' },
    )

  await adminClient
    .from('preguntica_attempt_audios')
    .update({
      status: 'ready',
      analysis_score: parsed.score,
      analysis_payload: parsed as unknown as Record<string, unknown>,
    })
    .eq('id', audio.id)

  return jsonResponse(200, {
    ok: true,
    attemptId: attempt.id,
    audioId: audio.id,
    transcript,
    responseCharCount: charCount,
    analysis: parsed,
    retriesUsed: retriesUsed + 1,
    maxRetries: 3,
  })
}

async function refreshSuggestions(
  adminClient: any,
  userId: string,
  payload: RefreshSuggestionsPayload,
): Promise<Response> {
  const attempt = await getAttempt(adminClient, userId, payload.attemptId)
  const currentRefresh = Number(attempt.suggestions_refresh_count || 0)

  if (currentRefresh >= 3) {
    return jsonResponse(200, {
      ok: false,
      error: 'SUGGESTION_REFRESH_LIMIT_REACHED',
      maxRefreshes: 3,
    })
  }

  const transcript = (attempt.transcript_text || attempt.response_text || '').trim()
  if (!transcript) {
    throw new Error('TRANSCRIPT_REQUIRED')
  }

  const targetLang = (payload.targetLang || attempt.target_lang || 'English').trim()
  const nativeLang = (payload.nativeLang || attempt.native_lang || 'Español').trim()
  const level = await resolveStudyLevelForPair(
    adminClient,
    userId,
    targetLang,
    nativeLang,
    payload.level || attempt.level || 'A2',
  )
  const icaWords = payload.icaWords && payload.icaWords.length
    ? payload.icaWords
    : parseWords(attempt.ica_words)

  const currentSuggestions = (payload.currentSuggestions || []).filter((word): word is string => typeof word === 'string')

  const { data: previousRows, error: previousError } = await adminClient
    .from('preguntica_feedback_suggestions')
    .select('suggested_words')
    .eq('preguntica_attempt_id', attempt.id)

  if (previousError) {
    throw new Error(previousError.message)
  }

  const previousSuggestedWords = (previousRows || []).flatMap((row) => {
    const record = row as { suggested_words: unknown }
    return parseSuggestionWordsFromRows(record.suggested_words)
  })

  const blockedWords = [...icaWords, ...currentSuggestions, ...previousSuggestedWords]

  const raw = await callAnthropic(
    'You generate alternative ICA word suggestions. Reply only with valid JSON.',
    [
      `Target language: ${targetLang}`,
      `Native language: ${nativeLang}`,
      `Learner level: ${level}`,
      `Current ICA words: ${icaWords.join(', ') || 'none'}`,
      `Already shown suggestions (do not repeat): ${currentSuggestions.join(', ') || 'none'}`,
      'Give 4 to 8 alternative ICA words the learner could use to improve the response.',
      'Only suggest words that were not used but would be natural and useful.',
      'Never suggest words already present in the learner response.',
      'Never suggest any word from Current ICA words (those are already in the learner bag).',
      'Never suggest any word from Already shown suggestions.',
      'If fewer than 4 qualify, return fewer. Empty array is valid.',
      'Return STRICT JSON only with shape:',
      '{"suggestedIcaWords":[{"word":"...","translation":"...","reason":"..."}]}',
      `translation must be in: ${nativeLang}`,
      'No markdown. No text before or after JSON.',
      '',
      'Learner response:',
      transcript,
    ].join('\n'),
  )

  const suggestions = filterSuggestedWords(parseSuggestions(raw), transcript, blockedWords)
  const nextRefresh = currentRefresh + 1

  await adminClient
    .from('preguntica_feedback_suggestions')
    .insert({
      user_id: userId,
      preguntica_attempt_id: attempt.id,
      refresh_index: nextRefresh,
      suggested_words: suggestions as unknown as Record<string, unknown>[],
      model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6',
    })

  await adminClient
    .from('preguntica_attempts')
    .update({
      suggestions_refresh_count: nextRefresh,
    })
    .eq('id', attempt.id)

  return jsonResponse(200, {
    ok: true,
    attemptId: attempt.id,
    refreshIndex: nextRefresh,
    suggestions,
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const clients = await createClients(req)
  if (!clients.ok) return clients.response

  let payload: RequestPayload
  try {
    payload = (await req.json()) as RequestPayload
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  try {
    if (payload.action === 'process_attempt_audio') {
      return await processAttemptAudio(clients.adminClient, clients.userId, payload)
    }

    if (payload.action === 'refresh_suggestions') {
      return await refreshSuggestions(clients.adminClient, clients.userId, payload)
    }

    if (payload.action === 'prepare_attempt') {
      return await prepareAttempt(clients.authClient, clients.adminClient, clients.userId, payload)
    }

    return jsonResponse(400, { error: 'Unsupported action' })
  } catch (error) {
    const message = toErrorMessage(error, 'Unknown error')

    if ((payload as ProcessAttemptPayload).action === 'process_attempt_audio') {
      const attemptId = (payload as ProcessAttemptPayload).attemptId
      const audioId = (payload as ProcessAttemptPayload).audioId
      if (attemptId) {
        if (audioId) {
          try {
            const failedAudio = await getAudio(clients.adminClient, clients.userId, attemptId, audioId)
            await cleanupFailedAudio(clients.adminClient, failedAudio)
          } catch {
            // ignore cleanup errors
          }
        }

        await clients.adminClient
          .from('preguntica_attempts')
          .update({ status: 'failed', error_code: 'PROCESS_FAILED', error_message: message })
          .eq('id', attemptId)
          .eq('user_id', clients.userId)
      }
    }

    return jsonResponse(500, { error: message })
  }
})
