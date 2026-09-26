import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  generateActivationText,
  getChunkProblems,
  joinChunks,
  sanitizeChunks,
  splitExistingText,
  type AnthropicCall,
} from '../_shared/challenge-chunks.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const LEVEL_DESCRIPTIONS: Record<string, string> = {
  '0': 'Very basic words and chunks. Keep it concrete and short.',
  'Pre-A1': 'Very basic words and chunks. Keep it concrete and short.',
  A1: 'Simple present tense, high-frequency words, clear sentence structure.',
  'A1+': 'Simple present with slightly richer detail and basic connectors.',
  A2: 'Everyday situations with basic connectors. Keep grammar straightforward.',
  'A2+': 'Everyday situations with more variety and clearer sentence links.',
  B1: 'Practical vocabulary and mixed tenses. Natural but still learner-friendly.',
  'B1+': 'Comfortable practical communication with broader vocabulary and tense control.',
  B2: 'More nuanced wording and varied sentence structure.',
  'B2+': 'Nuanced wording with flexible structures and greater precision.',
  C1: 'Advanced fluency with rich vocabulary and idiomatic choices.',
}

function normalizeLevelKey(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '')
  if (normalized === 'PREA1' || normalized === 'PRE-A1' || normalized === '0' || normalized === 'A0' || normalized === 'LEVEL0') {
    return 'Pre-A1'
  }
  if (normalized === 'A1PLUS') return 'A1+'
  if (normalized === 'A2PLUS') return 'A2+'
  if (normalized === 'B1PLUS') return 'B1+'
  if (normalized === 'B2PLUS') return 'B2+'
  if (normalized === 'C2') return 'C1'
  return normalized || 'A2'
}

function getLevelDescription(level: string): string {
  const key = normalizeLevelKey(level)
  return LEVEL_DESCRIPTIONS[key] || LEVEL_DESCRIPTIONS.A2
}

type AnthropicTextBlock = {
  type: 'text'
  text: string
}

type AnthropicToolUseBlock = {
  type: 'tool_use'
  name: string
  input?: Record<string, unknown>
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock

type AnthropicResponse = {
  content?: AnthropicContentBlock[]
}

type AnthropicToolDefinition = {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

type CallAnthropicOptions = {
  maxTokens?: number
  temperature?: number
  tool?: AnthropicToolDefinition
}

type TranslationStatus = 'ok' | 'corrected' | 'ambiguous' | 'not_a_word'

type TranslationCandidate = {
  detectedLang: string
  inputCorrected: string
  hadCorrection: boolean
  translation: string | null
  translationFallback: string | null
  alternatives: string[]
  status: TranslationStatus
}

type SpellcheckKind = 'diacritic' | 'typo' | 'spacing' | 'none'

type SpellcheckCandidate = {
  detectedLang: string
  hasCorrection: boolean
  corrected: string
  kind: SpellcheckKind
}

type TranslatePayload = {
  action: 'translate'
  text: string
  fromLang: string
  toLang: string
}

type ActivationPhrasePayload = {
  action: 'activation_phrase'
  words: Array<string | { target?: string; native?: string }>
  targetLang: string
  nativeLang: string
  level: string
  previousPhrase?: string
}

type SpellcheckPayload = {
  action: 'spellcheck'
  text: string
  lang: string
}

type WordExamplePayload = {
  action: 'word_example'
  targetWord: string
  nativeMeaning: string
  targetLang: string
  nativeLang: string
  level: string
}

type PhraseTokenInsightPayload = {
  action: 'phrase_token_insight'
  token: string
  phrase: string
  targetLang: string
  nativeLang: string
}

type ManualPhraseSuggestionPayload = {
  action: 'manual_phrase_suggestion'
  targetPhrase: string
  nativePhrase: string
  requiredWords: string[]
  targetLang: string
  nativeLang: string
}

// NOTA DESAFIANTE: prepara los trozos de una frase ya guardada y los guarda el servidor.
// El texto se lee de la base de datos (no se confía en el navegador).
// chunks (opcional): trozos que ya trajo la IA al crear la frase; se validan antes de guardarlos.
type SplitPhrasePayload = {
  action: 'split_phrase'
  phraseId: string
  chunks?: unknown
}

type CoachingFocusExercisePayload = {
  action: 'coaching_focus_exercise'
  targetLang: string
  nativeLang: string
  level: string
  focusTitle: string
  studentContext?: string
  focusSlot?: string
  phase?: string
}

type ManualPhraseReviewResult = {
  status: 'suggested' | 'perfect' | 'invalid'
  suggestion: string | null
  nativeSuggestion: string | null
  comment: string
  targetFeedback: string[]
  nativeFeedback: string[]
  issues: string[]
}

type RequestPayload =
  | TranslatePayload
  | ActivationPhrasePayload
  | SpellcheckPayload
  | WordExamplePayload
  | PhraseTokenInsightPayload
  | ManualPhraseSuggestionPayload
  | SplitPhrasePayload
  | CoachingFocusExercisePayload

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}

function readTextBlocks(data: AnthropicResponse): string | null {
  const text = data.content
    ?.map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
  return text || null
}

function readToolInput(data: AnthropicResponse, toolName: string): Record<string, unknown> | null {
  const block = data.content?.find((item): item is AnthropicToolUseBlock => {
    return item.type === 'tool_use' && item.name === toolName
  })

  if (!block || !block.input || typeof block.input !== 'object') return null
  return block.input
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

function sanitizeTranslation(value: string): string | null {
  if (!value) return null

  let cleaned = value.trim()
  if (!cleaned || cleaned === '—') return null

  if (/[\n\r]/.test(cleaned)) return null

  cleaned = cleaned.split(/\s*[\/|]\s*/)[0]?.trim() || ''
  cleaned = cleaned.replace(/\([^)]*\)/g, '').trim()
  cleaned = cleaned.replace(/^['"`]+|['"`]+$/g, '').trim()

  if (!cleaned || cleaned === '—') return null
  if (cleaned.length > 80) return null

  return cleaned
}

function sanitizeSpellingSuggestion(value: string): string | null {
  const cleaned = value.trim()
  if (!cleaned) return null
  if (/\n|\r/.test(cleaned)) return null
  if (cleaned.length > 120) return null
  return cleaned
}

function sanitizeManualPhraseSuggestion(value: string): string | null {
  const cleaned = value.trim()
  if (!cleaned || cleaned === '—') return null
  if (cleaned.length > 280) return null
  return cleaned
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function includesRequiredWord(phrase: string, word: string): boolean {
  const trimmedWord = word.trim()
  if (!trimmedWord) return false

  const regex = new RegExp(
    `(^|[\\s.,;:!?()\"'“”‘’¿¡\\-])${escapeRegex(trimmedWord)}(?=$|[\\s.,;:!?()\"'“”‘’¿¡\\-])`,
    'u',
  )
  return regex.test(phrase)
}

function sanitizeShortComment(value: string): string {
  const cleaned = value.trim()
  if (!cleaned) return 'Buen trabajo. Tu frase se entiende y esta bien encaminada.'
  return cleaned.slice(0, 260)
}

function sanitizeFeedbackList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems)
}

function normalizeLooseText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeForSimilarity(value: string): string[] {
  return normalizeLooseText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0

  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0

  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1
  })

  const union = new Set([...setA, ...setB]).size
  if (!union) return 0
  return intersection / union
}

function isTooSimilarToPreviousPhrase(nextPhrase: string, previousPhrase: string): boolean {
  const nextNormalized = normalizeLooseText(nextPhrase)
  const previousNormalized = normalizeLooseText(previousPhrase)
  if (!nextNormalized || !previousNormalized) return false

  if (nextNormalized === previousNormalized) return true

  const nextTokens = tokenizeForSimilarity(nextPhrase)
  const previousTokens = tokenizeForSimilarity(previousPhrase)
  const similarity = jaccardSimilarity(nextTokens, previousTokens)

  return similarity >= 0.8
}

function hasAllRequiredWords(phrase: string, requiredWords: string[]): boolean {
  const normalizedPhrase = normalizeLooseText(phrase)
  return requiredWords.every((word) => {
    const normalizedWord = normalizeLooseText(word)
    return includesRequiredWord(normalizedPhrase, normalizedWord)
  })
}

function parseManualPhraseSuggestion(raw: string | null): ManualPhraseReviewResult | null {
  const parsed = parseLastJsonObject(raw)
  if (!parsed) return null

  const rawStatus = typeof parsed.status === 'string' ? parsed.status.trim().toLowerCase() : ''
  const status: ManualPhraseReviewResult['status'] =
    rawStatus === 'suggested' || rawStatus === 'perfect' || rawStatus === 'invalid'
      ? rawStatus
      : 'perfect'

  const suggestionRaw = typeof parsed.suggestion === 'string' ? parsed.suggestion : ''
  const suggestion = sanitizeManualPhraseSuggestion(suggestionRaw)
  const nativeSuggestionRaw =
    typeof parsed.nativeSuggestion === 'string' ? parsed.nativeSuggestion : ''
  const nativeSuggestion = sanitizeManualPhraseSuggestion(nativeSuggestionRaw)
  const commentRaw = typeof parsed.comment === 'string' ? parsed.comment : ''
  const targetFeedback = sanitizeFeedbackList(parsed.targetFeedback, 3)
  const nativeFeedback = sanitizeFeedbackList(parsed.nativeFeedback, 3)
  const issues = sanitizeFeedbackList(parsed.issues, 4)

  return {
    status,
    suggestion,
    nativeSuggestion,
    comment: sanitizeShortComment(commentRaw),
    targetFeedback,
    nativeFeedback,
    issues,
  }
}

async function requireUser(
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return { ok: false, response: jsonResponse(401, { error: 'Missing authorization header' }) }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, response: jsonResponse(500, { error: 'Supabase function environment is not configured' }) }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { ok: false, response: jsonResponse(401, { error: 'Unauthorized' }) }
  }

  return { ok: true, userId: user.id }
}

const CHALLENGE_FEATURE_FLAG_KEY = 'nota-desafiante'

type ChallengePhraseRow = {
  id: string
  generated_phrase: string | null
  translation: string | null
  target_lang: string | null
  native_lang: string | null
  challenge_chunks: unknown
  challenge_ready: boolean | null
  challenge_problem: string | null
}

type ChallengeResult = {
  chunks: Array<{ target: string; native: string }> | null
  ready: boolean | null
  problem: string | null
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// NOTA DESAFIANTE: trozos de una frase del alumno. Idempotente: si ya se procesó,
// devuelve lo guardado sin volver a llamar a la IA.
async function handleSplitPhrase(payload: SplitPhrasePayload, userId: string): Promise<Response> {
  const phraseId = typeof payload.phraseId === 'string' ? payload.phraseId.trim() : ''
  if (!phraseId) return jsonResponse(400, { error: 'phraseId is required' })

  const admin = createAdminClient()
  if (!admin) return jsonResponse(500, { error: 'Supabase function environment is not configured' })

  const { data: flagRow } = await admin
    .from('feature_flags')
    .select('is_enabled')
    .eq('key', CHALLENGE_FEATURE_FLAG_KEY)
    .maybeSingle()
  if (!flagRow?.is_enabled) {
    return jsonResponse(403, { error: 'feature_disabled' })
  }

  const { data: row, error: rowError } = await admin
    .from('phrase_generations')
    .select(
      'id, generated_phrase, translation, target_lang, native_lang, challenge_chunks, challenge_ready, challenge_problem',
    )
    .eq('id', phraseId)
    .eq('user_id', userId)
    .maybeSingle<ChallengePhraseRow>()

  if (rowError) return jsonResponse(500, { error: rowError.message })
  if (!row) return jsonResponse(404, { error: 'phrase_not_found' })

  if (row.challenge_ready !== null) {
    const stored: ChallengeResult = {
      chunks: sanitizeChunks(row.challenge_chunks),
      ready: row.challenge_ready,
      problem: row.challenge_problem,
    }
    return jsonResponse(200, { result: stored })
  }

  const targetPhrase = (row.generated_phrase || '').trim()
  const nativePhrase = (row.translation || '').trim()
  if (!targetPhrase || !nativePhrase) {
    return jsonResponse(422, { error: 'phrase_without_text' })
  }

  let result: ChallengeResult | null = null

  // Trozos que trajo la IA al crear la frase: solo se aceptan si reproducen la frase guardada.
  const providedChunks = sanitizeChunks(payload.chunks)
  if (
    providedChunks &&
    !getChunkProblems(providedChunks, targetPhrase).length &&
    joinChunks(providedChunks, 'native').length > 0
  ) {
    result = { chunks: providedChunks, ready: true, problem: null }
  }

  if (!result) {
    const split = await splitExistingText(
      {
        targetPhrase,
        nativePhrase,
        targetLang: row.target_lang || '',
        nativeLang: row.native_lang || '',
      },
      callAnthropic as AnthropicCall,
    )
    result = {
      chunks: split.chunks,
      ready: Boolean(split.chunks) && split.targetIsCorrect !== false,
      problem:
        split.problem ||
        (split.chunks ? null : 'No se pudo dividir la frase en trozos válidos.'),
    }
  }

  const { error: updateError } = await admin
    .from('phrase_generations')
    .update({
      challenge_chunks: result.chunks,
      challenge_ready: result.ready,
      challenge_problem: result.problem,
    })
    .eq('id', row.id)
    .eq('user_id', userId)

  if (updateError) return jsonResponse(500, { error: updateError.message })

  return jsonResponse(200, { result })
}

async function callAnthropic(
  system: string,
  userPrompt: string,
  options?: CallAnthropicOptions,
): Promise<{ text: string | null; toolInput: Record<string, unknown> | null }> {
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
      max_tokens: options?.maxTokens ?? 1000,
      temperature: options?.temperature ?? 0.2,
      system,
      messages: [{ role: 'user', content: userPrompt }],
      tools: options?.tool ? [options.tool] : undefined,
      tool_choice: options?.tool ? { type: 'tool', name: options.tool.name } : undefined,
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic error ${response.status}`)
  }

  const data = (await response.json()) as AnthropicResponse
  return {
    text: readTextBlocks(data),
    toolInput: options?.tool ? readToolInput(data, options.tool.name) : null,
  }
}

function normalizeTranslationStatus(value: unknown): TranslationStatus {
  if (typeof value !== 'string') return 'not_a_word'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'ok') return 'ok'
  if (normalized === 'corrected') return 'corrected'
  if (normalized === 'ambiguous') return 'ambiguous'
  if (normalized === 'not_a_word') return 'not_a_word'
  return 'not_a_word'
}

function parseTranslationCandidate(
  toolInput: Record<string, unknown> | null,
  fallbackRaw: string | null,
): TranslationCandidate {
  const parsed: Record<string, unknown> = toolInput || parseLastJsonObject(fallbackRaw) || {}

  const detectedLang = typeof parsed.detected_lang === 'string'
    ? parsed.detected_lang.trim() || 'unknown'
    : 'unknown'
  const inputCorrected = typeof parsed.input_corrected === 'string'
    ? parsed.input_corrected.trim()
    : ''
  const hadCorrection = typeof parsed.had_correction === 'boolean'
    ? parsed.had_correction
    : false

  const translationRaw = typeof parsed.translation === 'string' ? parsed.translation : ''
  const translationFallback = translationRaw.trim() && !/[\n\r]/.test(translationRaw)
    ? translationRaw.trim().slice(0, 120)
    : null
  const translation = sanitizeTranslation(translationRaw)
  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives
      .filter((item): item is string => typeof item === 'string')
      .map((item) => sanitizeTranslation(item) || '')
      .filter(Boolean)
      .slice(0, 2)
    : []

  const status = normalizeTranslationStatus(parsed.status)

  return {
    detectedLang,
    inputCorrected,
    hadCorrection,
    translation,
    translationFallback,
    alternatives,
    status,
  }
}

function parseActivationPhrase(raw: string | null): { phrase: string; translation: string; words_used?: string[] } | null {
  const parsed = parseLastJsonObject(raw)
  if (!parsed) return null

  if (typeof parsed.phrase !== 'string' || typeof parsed.translation !== 'string') {
    return null
  }

  return {
    phrase: parsed.phrase,
    translation: parsed.translation,
    words_used: Array.isArray(parsed.words_used)
      ? parsed.words_used.filter((word): word is string => typeof word === 'string')
      : undefined,
  }
}

function normalizeSpellcheckKind(value: unknown): SpellcheckKind {
  if (typeof value !== 'string') return 'none'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'diacritic') return 'diacritic'
  if (normalized === 'typo') return 'typo'
  if (normalized === 'spacing') return 'spacing'
  if (normalized === 'none') return 'none'
  return 'none'
}

function parseSpellcheckCandidate(
  toolInput: Record<string, unknown> | null,
  fallbackRaw: string | null,
): SpellcheckCandidate {
  const parsed: Record<string, unknown> = toolInput || parseLastJsonObject(fallbackRaw) || {}
  const detectedLang = typeof parsed.detected_lang === 'string'
    ? parsed.detected_lang.trim() || 'unknown'
    : 'unknown'
  const hasCorrection = typeof parsed.has_correction === 'boolean'
    ? parsed.has_correction
    : false
  const correctedRaw = typeof parsed.corrected === 'string' ? parsed.corrected : ''
  const corrected = sanitizeSpellingSuggestion(correctedRaw) || ''
  const kind = normalizeSpellcheckKind(parsed.kind)

  return {
    detectedLang,
    hasCorrection,
    corrected,
    kind,
  }
}

function parsePhraseTokenInsight(raw: string | null): {
  translation: string
  meaning: string
  grammarTip: string
  examples: string[]
} | null {
  const parsed = parseLastJsonObject(raw)
  if (!parsed) return null

  const translation = typeof parsed.translation === 'string' ? parsed.translation.trim() : ''
  const meaning = typeof parsed.meaning === 'string' ? parsed.meaning.trim() : ''
  const grammarTip = typeof parsed.grammarTip === 'string' ? parsed.grammarTip.trim() : ''
  const examples = Array.isArray(parsed.examples)
    ? parsed.examples
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 2)
    : []

  if (!translation || !meaning || !grammarTip) return null

  return {
    translation,
    meaning,
    grammarTip,
    examples,
  }
}

function parseCoachingFocusExercise(raw: string | null): {
  exercise: Record<string, unknown> | null
  errorReason: string | null
} {
  const parsed = parseLastJsonObject(raw)
  if (!parsed) return { exercise: null, errorReason: 'invalid_json' }
  return parseCoachingFocusExerciseObject(parsed)
}

function parseCoachingFocusExerciseObject(parsed: Record<string, unknown>): {
  exercise: Record<string, unknown> | null
  errorReason: string | null
} {
  if (!isRecord(parsed.etiquetas)) return { exercise: null, errorReason: 'missing_etiquetas' }

  if (!Array.isArray(parsed.bloques)) {
    return { exercise: null, errorReason: 'invalid_bloques_count' }
  }

  const bloques = parsed.bloques.filter((item): item is Record<string, unknown> => isRecord(item))

  const normalizeBlockId = (value: unknown): 'reconocer' | 'construir' | 'conversacion' | null => {
    if (typeof value !== 'string') return null
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

    if (normalized === 'reconocer') return 'reconocer'
    if (normalized === 'construir') return 'construir'
    if (normalized === 'conversacion') return 'conversacion'
    return null
  }

  const orderedBlocks: Record<string, unknown>[] = []
  const requiredIds: Array<'reconocer' | 'construir' | 'conversacion'> = ['reconocer', 'construir', 'conversacion']
  let canResolveById = true

  for (const id of requiredIds) {
    const block = bloques.find((item) => normalizeBlockId(item.id) === id)
    if (!block) canResolveById = false
    if (block) orderedBlocks.push(block)
  }

  if (!canResolveById) {
    if (bloques.length < 3) {
      return { exercise: null, errorReason: 'invalid_bloques_count' }
    }
    orderedBlocks.length = 0
    for (let idx = 0; idx < requiredIds.length; idx += 1) {
      const original = bloques[idx]
      orderedBlocks.push({
        ...original,
        id: requiredIds[idx],
      })
    }
  }

  parsed.bloques = orderedBlocks

  const recoBlock = parsed.bloques[0]
  if (isRecord(recoBlock) && Array.isArray(recoBlock.items) && recoBlock.items.length > 0) {
    const firstItem = recoBlock.items[0]
    if (isRecord(firstItem) && Array.isArray(firstItem.options)) {
      const options = firstItem.options.filter(isRecord)
      for (const option of options) {
        const text = typeof option.t === 'string' ? option.t : ''
        if (!text.includes('[SIN_ERROR_REAL]')) continue
        const replacement = options.find((candidate) => {
          const candidateText = typeof candidate.t === 'string' ? candidate.t.trim() : ''
          return candidateText.length > 0 && !candidateText.includes('[SIN_ERROR_REAL]')
        })
        option.t = replacement && typeof replacement.t === 'string'
          ? replacement.t
          : 'Frase con error típico del foco'
      }
    }
  }

  return { exercise: parsed, errorReason: null }
}

function buildInvalidJsonSnippet(raw: string | null): string | null {
  if (!raw) return null

  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (!normalized) return null

  return normalized.slice(0, 800)
}

function buildSnippetFromUnknown(value: unknown): string | null {
  if (typeof value === 'string') return buildInvalidJsonSnippet(value)
  if (!value) return null
  try {
    return buildInvalidJsonSnippet(JSON.stringify(value))
  } catch {
    return null
  }
}

function asTrimmedString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() || fallback : fallback
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => typeof item === 'string')
      .map(([key, item]) => [key.trim(), String(item).trim()])
      .filter(([key, item]) => key.length > 0 && item.length > 0),
  )
}

function buildCoachingFocusHeaderTool(): AnthropicToolDefinition {
  return {
    name: 'report_coaching_focus_header',
    description: 'Devuelve metadatos del ejercicio: subtitulo, etiquetas y equivalencias',
    input_schema: {
      type: 'object',
      properties: {
        foco_subtitulo: { type: 'string' },
        etiquetas: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        equivalencias: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['foco_subtitulo', 'etiquetas', 'equivalencias'],
    },
  }
}

function buildCoachingFocusReconocerTool(): AnthropicToolDefinition {
  return {
    name: 'report_coaching_focus_reconocer',
    description: 'Devuelve el bloque reconocer del ejercicio',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        instruccion: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              lead: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    t: { type: 'string' },
                    ok: { type: 'boolean' },
                    why: { type: 'string' },
                  },
                  required: ['t', 'ok', 'why'],
                },
              },
            },
            required: ['lead', 'tags', 'options'],
          },
        },
      },
      required: ['titulo', 'instruccion', 'items'],
    },
  }
}

function buildCoachingFocusConstruirTool(): AnthropicToolDefinition {
  return {
    name: 'report_coaching_focus_construir',
    description: 'Devuelve el bloque construir del ejercicio',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        instruccion: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              situacion: { type: 'string' },
              ejemplo: { type: 'string' },
              verbos: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nombre: { type: 'string' },
                    formas: { type: 'array', items: { type: 'string' } },
                    mal: { type: 'array', items: { type: 'string' } },
                    tags: { type: 'array', items: { type: 'string' } },
                    nota: { type: 'string' },
                  },
                  required: ['nombre', 'formas', 'mal', 'tags', 'nota'],
                },
              },
            },
            required: ['situacion', 'ejemplo', 'verbos'],
          },
        },
      },
      required: ['titulo', 'instruccion', 'items'],
    },
  }
}

function buildCoachingFocusConversacionTool(): AnthropicToolDefinition {
  return {
    name: 'report_coaching_focus_conversacion',
    description: 'Devuelve el bloque conversacion del ejercicio',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        instruccion: { type: 'string' },
        lineas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              quien: { type: 'string' },
              texto: { type: 'string' },
            },
            required: ['quien', 'texto'],
          },
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              verbo: { type: 'string' },
              formas: { type: 'array', items: { type: 'string' } },
              show: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              why: { type: 'string' },
            },
            required: ['verbo', 'formas', 'show', 'tags', 'why'],
          },
        },
      },
      required: ['titulo', 'instruccion', 'lineas', 'items'],
    },
  }
}

function buildCoachingFocusExerciseContextPrompt(input: {
  targetLang: string
  focusTitle: string
  level: string
  studentContext: string
  focusSlot: string
  phase: string
  nativeLang: string
}): string {
  return [
    'Eres el generador de ejercicios del programa Coaching ICA, un programa de coaching linguistico 1:1.',
    'Generas contenido didactico para un foco gramatical de un alumno concreto.',
    '',
    'CONTEXTO DEL ENCARGO',
    `- Idioma objetivo: ${input.targetLang}`,
    `- Foco gramatical: ${input.focusTitle}`,
    `- Nivel del alumno: ${input.level}`,
    `- Contexto del alumno: ${input.studentContext || 'Sin contexto adicional'}`,
    `- Slot: ${input.focusSlot} · Fase: ${input.phase}`,
    '',
    'REGLAS GENERALES',
    '- Las frases del idioma objetivo deben sonar reales para el contexto del alumno.',
    '- El vocabulario no puede pasar del nivel indicado y se evalua gramatica, no palabras raras.',
    `- Explicaciones SIEMPRE en ${input.nativeLang}, en segunda persona, maximo dos frases.`,
    '- En explicaciones evita usar las palabras "correcto" o "incorrecto".',
  ].join('\n')
}

async function generateCoachingFocusExerciseByBlocks(input: {
  targetLang: string
  nativeLang: string
  focusTitle: string
  level: string
  studentContext: string
  focusSlot: string
  phase: string
}): Promise<{ exercise: Record<string, unknown> | null; errorReason: string | null; invalidJsonSnippet: string | null }> {
  const contextPrompt = buildCoachingFocusExerciseContextPrompt(input)

  const headerPrompt = [
    contextPrompt,
    '',
    'TAREA',
    '- Devuelve solo cabecera del ejercicio.',
    '- foco_subtitulo: una frase breve en espanol sobre que se evalua.',
    '- etiquetas: objeto clave->nombre (2 a 4 claves).',
    '- equivalencias: objeto cifra->palabra del idioma objetivo cuando aplique.',
  ].join('\n')

  const headerResult = await callAnthropic(
    'Generas cabeceras didacticas de ejercicios de gramatica. Responde usando la tool definida.',
    headerPrompt,
    {
      maxTokens: 700,
      temperature: 0.1,
      tool: buildCoachingFocusHeaderTool(),
    },
  )

  const headerRaw = headerResult.toolInput || parseLastJsonObject(headerResult.text)
  if (!headerRaw || !isRecord(headerRaw)) {
    return {
      exercise: null,
      errorReason: 'invalid_header',
      invalidJsonSnippet: buildInvalidJsonSnippet(headerResult.text),
    }
  }

  const etiquetas = toStringMap(headerRaw.etiquetas)
  const equivalencias = toStringMap(headerRaw.equivalencias)
  const focoSubtitulo = asTrimmedString(headerRaw.foco_subtitulo, `Practicas ${input.focusTitle}`)

  const tagKeys = Object.keys(etiquetas)
  const tagsPromptLine = tagKeys.length > 0
    ? `Usa estas etiquetas exactamente en tags (1 o 2 por unidad): ${tagKeys.join(', ')}.`
    : 'Si usas tags, manten entre 1 y 2 por unidad y usa claves cortas en minusculas.'

  const reconocerPrompt = [
    contextPrompt,
    '',
    'TAREA BLOQUE reconocer',
    '- Genera 4 preguntas de opcion multiple.',
    '- Cada pregunta con 3 opciones y exactamente 1 opcion con ok=true.',
    '- Distractores plausibles del foco y nivel.',
    '- why en espanol y maximo dos frases.',
    tagsPromptLine,
  ].join('\n')

  const construirPrompt = [
    contextPrompt,
    '',
    'TAREA BLOQUE construir',
    '- Genera 4 situaciones para escritura libre.',
    '- Evalua gramatica en verbos, no una frase exacta cerrada.',
    '- Cada verbo con nombre, formas, mal, tags y nota.',
    '- formas: nucleo verbal en minusculas, sin acentos, sin apostrofes y sin sujeto.',
    '- Entre todos los items, crea entre 5 y 7 unidades verbales.',
    '- Al menos un item con dos verbos en contraste.',
    tagsPromptLine,
  ].join('\n')

  const conversacionPrompt = [
    contextPrompt,
    '',
    'TAREA BLOQUE conversacion',
    '- Genera dialogo natural de 4 o 5 lineas con exactamente 5 huecos.',
    '- Huecos en texto como {0}...{4}, alineados con items.',
    '- El alumno ve solo el infinitivo en verbo.',
    '- formas contiene solo lo que va dentro del hueco.',
    '- why en espanol y maximo dos frases.',
    tagsPromptLine,
  ].join('\n')

  const [reconocerResult, construirResult, conversacionResult] = await Promise.all([
    callAnthropic(
      'Generas el bloque reconocer para un ejercicio gramatical. Responde usando la tool definida.',
      reconocerPrompt,
      {
        maxTokens: 1200,
        temperature: 0.1,
        tool: buildCoachingFocusReconocerTool(),
      },
    ),
    callAnthropic(
      'Generas el bloque construir para un ejercicio gramatical. Responde usando la tool definida.',
      construirPrompt,
      {
        maxTokens: 1500,
        temperature: 0.1,
        tool: buildCoachingFocusConstruirTool(),
      },
    ),
    callAnthropic(
      'Generas el bloque conversacion para un ejercicio gramatical. Responde usando la tool definida.',
      conversacionPrompt,
      {
        maxTokens: 1200,
        temperature: 0.1,
        tool: buildCoachingFocusConversacionTool(),
      },
    ),
  ])

  const recoRaw = reconocerResult.toolInput || parseLastJsonObject(reconocerResult.text)
  if (!recoRaw || !isRecord(recoRaw)) {
    return {
      exercise: null,
      errorReason: 'invalid_reconocer_block',
      invalidJsonSnippet: buildInvalidJsonSnippet(reconocerResult.text),
    }
  }

  let recoItems = Array.isArray(recoRaw.items)
    ? recoRaw.items.filter(isRecord)
    : []

  if (recoItems.length === 0) {
    const recoRetryResult = await callAnthropic(
      'Generas el bloque reconocer para un ejercicio gramatical. Responde usando la tool definida.',
      [
        reconocerPrompt,
        '',
        'REINTENTO OBLIGATORIO',
        '- Tu respuesta anterior vino sin items validos.',
        '- Devuelve EXACTAMENTE 4 items en "items".',
        '- Cada item debe incluir lead, tags y options.',
        '- Cada item debe tener 3 options y exactamente una con ok=true.',
      ].join('\n'),
      {
        maxTokens: 1200,
        temperature: 0,
        tool: buildCoachingFocusReconocerTool(),
      },
    )

    const recoRetryRaw = recoRetryResult.toolInput || parseLastJsonObject(recoRetryResult.text)
    if (recoRetryRaw && isRecord(recoRetryRaw)) {
      recoItems = Array.isArray(recoRetryRaw.items)
        ? recoRetryRaw.items.filter(isRecord)
        : []
      recoRaw.titulo = asTrimmedString(recoRetryRaw.titulo, asTrimmedString(recoRaw.titulo, 'Reconocer'))
      recoRaw.instruccion = asTrimmedString(recoRetryRaw.instruccion, asTrimmedString(recoRaw.instruccion))
    }
  }

  const construirRaw = construirResult.toolInput || parseLastJsonObject(construirResult.text)
  if (!construirRaw || !isRecord(construirRaw)) {
    return {
      exercise: null,
      errorReason: 'invalid_construir_block',
      invalidJsonSnippet: buildInvalidJsonSnippet(construirResult.text),
    }
  }

  const conversacionRaw = conversacionResult.toolInput || parseLastJsonObject(conversacionResult.text)
  if (!conversacionRaw || !isRecord(conversacionRaw)) {
    return {
      exercise: null,
      errorReason: 'invalid_conversacion_block',
      invalidJsonSnippet: buildInvalidJsonSnippet(conversacionResult.text),
    }
  }

  const buildItems = Array.isArray(construirRaw.items) ? construirRaw.items.filter(isRecord) : []
  const dialogItems = Array.isArray(conversacionRaw.items) ? conversacionRaw.items.filter(isRecord) : []
  const dialogLines = Array.isArray(conversacionRaw.lineas) ? conversacionRaw.lineas.filter(isRecord) : []

  if (recoItems.length === 0) {
    return {
      exercise: null,
      errorReason: 'invalid_reconocer_items',
      invalidJsonSnippet: buildSnippetFromUnknown(recoRaw),
    }
  }
  if (buildItems.length === 0) {
    return {
      exercise: null,
      errorReason: 'invalid_construir_items',
      invalidJsonSnippet: buildSnippetFromUnknown(construirRaw),
    }
  }
  if (dialogItems.length === 0 || dialogLines.length === 0) {
    return {
      exercise: null,
      errorReason: 'invalid_conversacion_items',
      invalidJsonSnippet: buildSnippetFromUnknown(conversacionRaw),
    }
  }

  const buildUnitsCount = buildItems.reduce((acc, item) => {
    if (!isRecord(item)) return acc
    const verbos = Array.isArray(item.verbos) ? item.verbos.filter(isRecord) : []
    return acc + verbos.length
  }, 0)
  const scoringUnits = recoItems.length + buildUnitsCount + dialogItems.length

  const exerciseCandidate: Record<string, unknown> = {
    idioma: input.targetLang,
    nivel: input.level,
    foco: input.focusTitle,
    foco_subtitulo: focoSubtitulo,
    foco_slot: input.focusSlot,
    fase: input.phase,
    umbral: Math.max(1, scoringUnits - 2),
    equivalencias,
    etiquetas,
    bloques: [
      {
        id: 'reconocer',
        titulo: asTrimmedString(recoRaw.titulo, 'Reconocer'),
        instruccion: asTrimmedString(recoRaw.instruccion),
        items: recoItems,
      },
      {
        id: 'construir',
        titulo: asTrimmedString(construirRaw.titulo, 'Construir'),
        instruccion: asTrimmedString(construirRaw.instruccion),
        items: buildItems,
      },
      {
        id: 'conversacion',
        titulo: asTrimmedString(conversacionRaw.titulo, 'En conversacion'),
        instruccion: asTrimmedString(conversacionRaw.instruccion),
        lineas: dialogLines,
        items: dialogItems,
      },
    ],
  }

  const parsed = parseCoachingFocusExerciseObject(exerciseCandidate)
  if (!parsed.exercise) {
    return { exercise: null, errorReason: parsed.errorReason, invalidJsonSnippet: null }
  }

  return { exercise: parsed.exercise, errorReason: null, invalidJsonSnippet: null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  let payload: RequestPayload
  try {
    payload = (await req.json()) as RequestPayload
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  try {
    if (payload.action === 'translate') {
      const translated = await callAnthropic(
        [
          'Eres el motor de traduccion de una app para estudiantes de idiomas.',
          'Recibes lo que un alumno acaba de escribir: una palabra o una frase corta.',
          'Los alumnos escriben con errores constantemente. Es normal y esperado.',
          '',
          `Direccion obligatoria: de ${payload.fromLang} hacia ${payload.toLang}.`,
          'El texto SIEMPRE se interpreta en el idioma de origen declarado (fromLang).',
          'No autodetectes idioma para invertir la direccion.',
          'Si una palabra existe en ambos idiomas, prioriza el significado de fromLang.',
          '',
          'PROCESO, en este orden:',
          '1. Interpreta el texto como fromLang.',
          '2. Corrige ortografia y diacriticos que falten (e a c n o u a e l z s...).',
          '   Si al quitar los diacriticos coincide con una forma valida del idioma,',
          '   asume que el alumno los olvido y restauralos.',
          '3. Traduce el texto YA CORREGIDO a toLang.',
          '',
          'REGLA ABSOLUTA:',
          'SIEMPRE devuelves una traduccion. Un error ortografico NUNCA la bloquea:',
          'corriges primero, traduces despues. Si hay varios sentidos posibles, eliges',
          'el mas frecuente y pones los demas en alternatives.',
          'Nunca devuelves vacio, ni un guion, ni te niegas por ambiguedad.',
          '',
          'REGLA DE DIRECCION:',
          '- Nunca inviertas idiomas.',
          '- Nunca respondas en fromLang.',
          '- translation debe quedar en toLang.',
          '',
          'FORMATO DE LA TRADUCCION:',
          '- Solo la traduccion, en el idioma destino.',
          '- Sin el texto original, sin barras, sin parentesis, sin explicaciones.',
          '- Manten el registro y el tiempo verbal del original.',
          '',
          'EJEMPLOS:',
          'Input: "on decidira demain" | fromLang=fr | toLang=es',
          '-> detected_lang: "fr" | input_corrected: "on décidera demain" | had_correction: true | translation: "decidiremos mañana" | alternatives: [] | status: "corrected"',
          'Input: "la cancion" | fromLang=es | toLang=fr',
          '-> detected_lang: "es" | input_corrected: "la canción" | had_correction: true | translation: "la chanson" | alternatives: [] | status: "corrected"',
          'Input: "pan" | fromLang=pl | toLang=es',
          '-> detected_lang: "pl" | input_corrected: "pan" | had_correction: false | translation: "señor" | alternatives: ["usted"] | status: "ambiguous"',
          'Input: "pan" | fromLang=es | toLang=pl',
          '-> detected_lang: "es" | input_corrected: "pan" | had_correction: false | translation: "chleb" | alternatives: [] | status: "ok"',
        ].join('\n'),
        payload.text,
        {
          maxTokens: 400,
          temperature: 0,
          tool: {
            name: 'report_translation',
            description: 'Devuelve idioma detectado, correccion y traduccion',
            input_schema: {
              type: 'object',
              properties: {
                detected_lang: { type: 'string' },
                input_corrected: { type: 'string' },
                had_correction: { type: 'boolean' },
                translation: { type: 'string' },
                alternatives: {
                  type: 'array',
                  items: { type: 'string' },
                },
                status: {
                  type: 'string',
                  enum: ['ok', 'corrected', 'ambiguous', 'not_a_word'],
                },
              },
              required: [
                'detected_lang',
                'input_corrected',
                'had_correction',
                'translation',
                'alternatives',
                'status',
              ],
            },
          },
        },
      )

      const parsed = parseTranslationCandidate(translated.toolInput, translated.text)
      const finalTranslation = parsed.status === 'not_a_word'
        ? null
        : (parsed.translation || parsed.translationFallback)

      return jsonResponse(200, {
        translation: finalTranslation,
        detectedLang: parsed.detectedLang,
        inputCorrected: parsed.inputCorrected,
        hadCorrection: parsed.hadCorrection,
        alternatives: parsed.alternatives,
        status: parsed.status,
      })
    }

    if (payload.action === 'activation_phrase') {
      const normalizedWords = payload.words
        .map((word) => {
          if (typeof word === 'string') {
            const cleaned = word.trim()
            if (!cleaned) return null
            return { target: cleaned, native: null as string | null }
          }

          const target = typeof word.target === 'string' ? word.target.trim() : ''
          const native = typeof word.native === 'string' ? word.native.trim() : ''
          if (!target) return null
          return { target, native: native || null }
        })
        .filter((word): word is { target: string; native: string | null } => Boolean(word))

      const words = normalizedWords.map((word) => word.target)
      if (!words.length) {
        return jsonResponse(400, { error: 'Words are required' })
      }

      // NOTA DESAFIANTE (fase 1): texto coherente y correcto, ya dividido en trozos.
      // La lógica (prompt, reglas de trozos, reintentos) está en ../_shared/challenge-chunks.ts
      const intendedMeanings = normalizedWords
        .filter((word) => word.native)
        .map((word) => `${word.target} = ${word.native}`)
      const previousPhrase = typeof payload.previousPhrase === 'string'
        ? payload.previousPhrase.trim()
        : ''

      const activationResult = await generateActivationText(
        {
          words,
          intendedMeanings,
          targetLang: payload.targetLang,
          nativeLang: payload.nativeLang,
          normalizedLevel: normalizeLevelKey(payload.level),
          levelDescription: getLevelDescription(payload.level),
          previousPhrase,
        },
        callAnthropic as AnthropicCall,
      )

      return jsonResponse(200, { result: activationResult })
    }

    if (payload.action === 'split_phrase') {
      return await handleSplitPhrase(payload, auth.userId)
    }

    if (payload.action === 'word_example') {
      const targetWord = payload.targetWord.trim()
      const nativeMeaning = payload.nativeMeaning.trim()
      if (!targetWord || !nativeMeaning) {
        return jsonResponse(400, { error: 'targetWord and nativeMeaning are required' })
      }

      const normalizedLevel = normalizeLevelKey(payload.level)
      const levelDescription = getLevelDescription(payload.level)
      const prompt = [
        `Create one short natural example sentence in ${payload.targetLang} using this exact word: ${targetWord}.`,
        `The word must keep this intended meaning in ${payload.nativeLang}: ${nativeMeaning}.`,
        'Rules:',
        `- CEFR ${normalizedLevel}. Description: ${levelDescription}`,
        '- 8-14 words',
        '- Keep wording practical and learner-friendly',
        `- Provide translation in ${payload.nativeLang}`,
        'Reply ONLY:',
        '{"phrase":"<sentence>","translation":"<translation>"}',
      ].join('\n')

      const raw = await callAnthropic(
        'You generate high-quality learner examples. Reply ONLY in JSON. No markdown, no backticks.',
        prompt,
        { maxTokens: 180, temperature: 0.1 },
      )

      return jsonResponse(200, {
        result: parseActivationPhrase(raw.text),
      })
    }

    if (payload.action === 'spellcheck') {
      const text = payload.text.trim()
      if (!text) {
        return jsonResponse(200, { suggestion: null })
      }

      const result = await callAnthropic(
        [
          'Eres un corrector ortografico para una app de aprendizaje de idiomas.',
          'Recibes lo que el alumno acaba de escribir: una palabra o una frase corta.',
          '',
          `Idioma declarado por la interfaz: ${payload.lang}.`,
          'Ese dato es una pista, no una certeza: el alumno puede haberse equivocado de campo.',
          'Si el texto esta claramente en otro idioma, corrigelo en el idioma real.',
          '',
          'QUE CORREGIR:',
          '- Diacriticos que faltan o sobran (e e a c n o u ss a e l z s o). Es el caso mas frecuente.',
          '- Letras cambiadas, dobles, omitidas o transpuestas.',
          '- Espaciado y apostrofos (l\'ami, dell\'acqua).',
          '',
          'REGLA CLAVE SOBRE DIACRITICOS:',
          'Si al quitar los diacriticos del texto obtienes algo que coincide con una forma valida',
          'del idioma, asume que el alumno olvido el diacritico y devuelve la forma acentuada.',
          'NO lo trates como correcto. Ante la duda en diacriticos, corrige.',
          '',
          'QUE NO HACER:',
          '- Nunca traduzcas.',
          '- No reformules, no cambies el tiempo verbal, no toques el estilo.',
          '- No corrijas nombres propios, marcas ni siglas.',
          '- No toques mayusculas salvo que sean obligatorias (sustantivos en aleman).',
          '',
          'Devuelve SIEMPRE el texto completo corregido, no solo la palabra que cambio.',
          '',
          'EJEMPLOS:',
          'on decidira demain -> fr | true | "on décidera demain" | diacritic',
          'dziekuje bardzo -> pl | true | "dziękuję bardzo" | diacritic',
          'la cancion -> es | true | "la canción" | diacritic',
          'Entshuldigung -> de | true | "Entschuldigung" | typo',
          'la maison -> fr | false | "la maison" | none',
        ].join('\n'),
        text,
        {
          maxTokens: 200,
          temperature: 0,
          tool: {
            name: 'report_spelling',
            description: 'Devuelve el resultado de la correccion ortografica',
            input_schema: {
              type: 'object',
              properties: {
                detected_lang: { type: 'string' },
                has_correction: { type: 'boolean' },
                corrected: { type: 'string' },
                kind: {
                  type: 'string',
                  enum: ['diacritic', 'typo', 'spacing', 'none'],
                },
              },
              required: ['detected_lang', 'has_correction', 'corrected', 'kind'],
            },
          },
        },
      )

      const parsed = parseSpellcheckCandidate(result.toolInput, result.text)
      const cleanedCorrected = sanitizeSpellingSuggestion(parsed.corrected)
      const suggestion = parsed.hasCorrection && cleanedCorrected ? cleanedCorrected : null

      return jsonResponse(200, {
        suggestion,
        detectedLang: parsed.detectedLang,
        kind: parsed.kind,
      })
    }

    if (payload.action === 'phrase_token_insight') {
      const token = payload.token.trim()
      const phrase = payload.phrase.trim()
      if (!token || !phrase) {
        return jsonResponse(400, { error: 'token and phrase are required' })
      }

      const prompt = [
        `Analyze this token inside a phrase for a ${payload.nativeLang}-speaking learner.`,
        `Target language: ${payload.targetLang}.`,
        `Token: ${token}`,
        `Phrase: ${phrase}`,
        'Return concise, practical guidance.',
        `Write all explanations in ${payload.nativeLang}.`,
        'Reply ONLY valid JSON with this exact shape:',
        '{"translation":"...","meaning":"...","grammarTip":"...","examples":["...","..."]}',
      ].join('\n')

      const raw = await callAnthropic(
        'You are a precise language tutor. Keep responses short and useful. Reply ONLY JSON.',
        prompt,
        { maxTokens: 260, temperature: 0.1 },
      )

      return jsonResponse(200, {
        result: parsePhraseTokenInsight(raw.text),
      })
    }

    if (payload.action === 'manual_phrase_suggestion') {
      const targetPhrase = payload.targetPhrase.trim()
      const nativePhrase = payload.nativePhrase.trim()
      const requiredWords = payload.requiredWords
        .map((word) => (typeof word === 'string' ? word.trim() : ''))
        .filter(Boolean)

      if (!targetPhrase || !nativePhrase) {
        return jsonResponse(400, { error: 'targetPhrase and nativePhrase are required' })
      }

      if (!requiredWords.length) {
        return jsonResponse(400, { error: 'requiredWords are required' })
      }

      const prompt = [
        'You are a strict grammar and fluency assistant for language learners.',
        `Target language: ${payload.targetLang}.`,
        `Native language of the learner: ${payload.nativeLang}.`,
        `Native phrase (context): ${nativePhrase}`,
        `Current target phrase: ${targetPhrase}`,
        `ICA words to preserve by meaning: ${requiredWords.join(', ')}`,
        'Task:',
        '- Suggest only one improved version of the target phrase.',
        '- Correct grammar and make it natural while preserving learner intent from the native phrase.',
        '- Use the ICA words by meaning. You MAY inflect/decline/conjugate them if grammar requires it.',
        '- You may reorder sentence structure to make it natural and correct.',
        '- If the phrase is already good, do NOT force a rewrite.',
        '- Optionally suggest a better native-language version if helpful.',
        '- If the phrase is grammatical but makes no sense in real life, it is NOT perfect: suggest a sensible version.',
        '- In the suggestion, write numbers in words, never in digits.',
        `- If you provide "suggestion", it MUST be written only in ${payload.targetLang}.`,
        `- If you provide "nativeSuggestion", it MUST be written only in ${payload.nativeLang}.`,
        'Output format (CRITICAL):',
        '- Return exactly one JSON object on one line with this shape:',
        '{"status":"suggested|perfect","suggestion":"... or null","nativeSuggestion":"... or null","comment":"short guidance","targetFeedback":["..."],"nativeFeedback":["..."],"issues":["..."]}',
        '- status="suggested" when you provide a better target phrase.',
        '- status="perfect" when no target rewrite is needed; set suggestion to null.',
        '- No markdown. No explanations. No extra keys.',
      ].join('\n')

      const result = await callAnthropic(
        'You review and improve learner sentences. Keep the meaning of the required ICA words and inflect them only when grammar requires it. Reply ONLY JSON.',
        prompt,
        {
          maxTokens: 600, // Antes 180: la respuesta completa no cabía
          temperature: 0,
          tool: {
            name: 'report_manual_phrase_suggestion',
            description: 'Return grammar review with optional target/native suggestion',
            input_schema: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                suggestion: { type: 'string' },
                nativeSuggestion: { type: 'string' },
                comment: { type: 'string' },
                targetFeedback: {
                  type: 'array',
                  items: { type: 'string' },
                },
                nativeFeedback: {
                  type: 'array',
                  items: { type: 'string' },
                },
                issues: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['status', 'comment', 'targetFeedback', 'nativeFeedback', 'issues'],
            },
          },
        },
      )

      const parsedFromTool = result.toolInput
        ? parseManualPhraseSuggestion(JSON.stringify(result.toolInput))
        : null
      const parsed = parsedFromTool ?? parseManualPhraseSuggestion(result.text)

      // Antes, si la revisión fallaba o llegaba cortada, se decía "perfecta" sin revisar nada.
      if (!parsed) {
        return jsonResponse(502, {
          error: 'review_failed',
          message: 'No se ha podido revisar la frase. Inténtalo de nuevo.',
        })
      }

      const suggestion = parsed?.suggestion || null
      const missingRequiredWords = suggestion
        ? requiredWords.filter((word) => !includesRequiredWord(suggestion, word))
        : []
      const matchedRequiredWords = requiredWords.filter(
        (word) => !missingRequiredWords.includes(word),
      )
      const suggestionRejectedReason = suggestion && missingRequiredWords.length > 0
        ? 'La sugerencia ajusta algunas palabras ICA por gramatica (flexion/conjugacion). Revisa el borrador IA para entender los cambios.'
        : null

      const nativeSuggestionCandidate = parsed?.nativeSuggestion || null
      const normalizedNativeInput = normalizeLooseText(nativePhrase)
      const normalizedNativeSuggestion = nativeSuggestionCandidate
        ? normalizeLooseText(nativeSuggestionCandidate)
        : ''
      const nativeSuggestion =
        nativeSuggestionCandidate &&
        normalizedNativeSuggestion &&
        normalizedNativeSuggestion !== normalizedNativeInput
          ? nativeSuggestionCandidate
          : null

      const canUseSuggestion = Boolean(suggestion)

      const review: ManualPhraseReviewResult = {
        status: canUseSuggestion
          ? 'suggested'
          : parsed?.status === 'invalid'
            ? 'invalid'
            : 'perfect',
        suggestion: canUseSuggestion ? suggestion : null,
        nativeSuggestion,
        comment:
          parsed?.comment ||
          'Tu frase esta bien encaminada. Puedes seguir practicando con confianza.',
        targetFeedback: parsed?.targetFeedback || [],
        nativeFeedback: parsed?.nativeFeedback || [],
        issues: parsed?.issues || [],
      }

      return jsonResponse(200, {
        review: {
          ...review,
          diagnostics: {
            requiredWords,
            matchedRequiredWords,
            missingRequiredWords,
            suggestionRejectedReason,
            suggestionCandidate: suggestion,
          },
        },
      })
    }

    if (payload.action === 'coaching_focus_exercise') {
      const targetLang = payload.targetLang.trim()
      const nativeLang = payload.nativeLang.trim()
      const focusTitle = payload.focusTitle.trim()
      const level = normalizeLevelKey(payload.level)
      const studentContext = typeof payload.studentContext === 'string'
        ? payload.studentContext.trim()
        : ''
      const focusSlot = typeof payload.focusSlot === 'string' && payload.focusSlot.trim()
        ? payload.focusSlot.trim()
        : 'Foco 1'
      const phase = typeof payload.phase === 'string' && payload.phase.trim()
        ? payload.phase.trim()
        : 'Entrenado'

      if (!targetLang || !nativeLang || !focusTitle) {
        return jsonResponse(400, {
          error: 'targetLang, nativeLang and focusTitle are required',
        })
      }

      const generated = await generateCoachingFocusExerciseByBlocks({
        targetLang,
        nativeLang,
        focusTitle,
        level,
        studentContext,
        focusSlot,
        phase,
      })

      if (!generated.exercise) {
        return jsonResponse(200, {
          exercise: null,
          error: `invalid_schema:${generated.errorReason || 'unknown'}`,
          invalidJsonSnippet: generated.invalidJsonSnippet,
        })
      }

      return jsonResponse(200, { exercise: generated.exercise })
    }

    return jsonResponse(400, { error: 'Unsupported action' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse(500, { error: message })
  }
})
