import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const LEVEL_DESCRIPTIONS: Record<string, string> = {
  '0': 'Very basic words and chunks. Keep it concrete and short.',
  A1: 'Simple present tense, high-frequency words, clear sentence structure.',
  A2: 'Everyday situations with basic connectors. Keep grammar straightforward.',
  B1: 'Practical vocabulary and mixed tenses. Natural but still learner-friendly.',
  B2: 'More nuanced wording and varied sentence structure.',
  C1: 'Advanced fluency with rich vocabulary and idiomatic choices.',
  C2: 'Near-native sophistication, precise and idiomatic expression.',
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

type TranslationCandidate = {
  translation: string | null
  confidence: number
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
  if (!cleaned || cleaned === '—') return null
  if (cleaned.length > 50) return null
  if (/\s/.test(cleaned)) return null
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

async function requireUser(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
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

  return { ok: true }
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

function parseTranslationCandidate(raw: string | null): TranslationCandidate {
  const parsed = parseLastJsonObject(raw)
  if (!parsed) return { translation: null, confidence: 0 }

  const translationRaw = typeof parsed.translation === 'string' ? parsed.translation : ''
  const translation = sanitizeTranslation(translationRaw)
  const confidence = typeof parsed.confidence === 'number'
    ? Math.min(1, Math.max(0, parsed.confidence))
    : 0

  return { translation, confidence }
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

function parseSpellcheckSuggestion(raw: string | null): string | null {
  const parsed = parseLastJsonObject(raw)
  if (!parsed) return null

  const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion : ''
  return sanitizeSpellingSuggestion(suggestion)
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
          'You are a bilingual dictionary assistant.',
          `Translate from ${payload.fromLang} to ${payload.toLang}.`,
          '',
          'Rules for "translation":',
          `- Return ONLY the translation, written ONLY in ${payload.toLang}.`,
          '- NEVER include the original input text.',
          '- NEVER include alternatives, slashes, parentheses, or explanations.',
          '- If multiple valid translations exist, return only the single most common one.',
          '- If misspelled, unknown, or too ambiguous, return "—" with confidence 0.',
          '',
          'Output format (CRITICAL):',
          '- Return exactly one JSON object on one line: {"translation":"...","confidence":0.0}',
          '- confidence must be a number between 0 and 1.',
          '- No markdown. No text before or after JSON.',
          '',
          `Example: Input "Wasser" -> {"translation":"agua","confidence":1}`,
          `Example: Input "xkrtz" -> {"translation":"—","confidence":0}`,
        ].join('\n'),
        payload.text,
        {
          maxTokens: 120,
          temperature: 0,
          tool: {
            name: 'report_translation',
            description: 'Return the translation result',
            input_schema: {
              type: 'object',
              properties: {
                translation: { type: 'string' },
                confidence: { type: 'number' },
              },
              required: ['translation', 'confidence'],
            },
          },
        },
      )

      const parsedFromTool = translated.toolInput
        ? parseTranslationCandidate(JSON.stringify(translated.toolInput))
        : null
      const parsed = parsedFromTool || parseTranslationCandidate(translated.text)
      const accepted = parsed.translation && parsed.confidence >= 0.72

      return jsonResponse(200, {
        translation: accepted ? parsed.translation : null,
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

      const sentenceLengthByWordCount: Record<number, string> = {
        5: '20-25 words long',
        6: '20-30 words long',
        7: '20-35 words long',
        8: '20-40 words long',
      }
      const sentenceLengthRule =
        sentenceLengthByWordCount[words.length] || '20-28 words long'

      const levelDescription = LEVEL_DESCRIPTIONS[payload.level] || LEVEL_DESCRIPTIONS.A2
      const intendedMeanings = normalizedWords
        .filter((word) => word.native)
        .map((word) => `${word.target} = ${word.native}`)
      const previousPhrase = typeof payload.previousPhrase === 'string'
        ? payload.previousPhrase.trim()
        : ''

      const buildActivationPrompt = (forbiddenPhrase?: string): string => {
        return [
          `Task: generate one original sentence in ${payload.targetLang} for a language learner using ALL required ICA words.`,
          `Required ICA words: ${words.join(', ')}`,
          'Rules (strict):',
          `- CEFR ${payload.level} level. Description: ${levelDescription}`,
          `- ${sentenceLengthRule}`,
          '- Use all required ICA words in the sentence.',
          '- Keep the intended meaning for each ICA word; do not switch sense.',
          '- You may add up to 10 extra words only when needed for coherence and naturalness.',
          '- Natural, native-sounding, practical wording.',
          forbiddenPhrase
            ? `- Forbidden previous sentence (do not reuse wording or structure): ${JSON.stringify(forbiddenPhrase)}`
            : '',
          forbiddenPhrase
            ? '- Produce a clearly different sentence from the forbidden one (different opening and clause structure).'
            : '',
          intendedMeanings.length
            ? `- Intended meanings (${payload.targetLang} -> ${payload.nativeLang}): ${intendedMeanings.join('; ')}`
            : '',
          `- Translate to ${payload.nativeLang}`,
          'Reply ONLY:',
          '{"phrase":"<sentence>","translation":"<translation>","words_used":["w1","w2"]}',
        ]
          .filter(Boolean)
          .join('\n')
      }

      let result: { phrase: string; translation: string; words_used?: string[] } | null = null
      let fallbackCandidate: { phrase: string; translation: string; words_used?: string[] } | null = null
      const maxAttempts = previousPhrase ? 2 : 1

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const forbiddenPhrase = attempt === 0 ? previousPhrase : previousPhrase || result?.phrase || ''
        const raw = await callAnthropic(
          'You generate natural sentences for language learners. Follow strict constraints and reply ONLY in JSON. No markdown, no backticks.',
          buildActivationPrompt(forbiddenPhrase || undefined),
          {
            maxTokens: 260,
            temperature: attempt === 0 ? 0.2 : 0,
          },
        )

        const parsed = parseActivationPhrase(raw.text)
        if (!parsed) continue

        if (!fallbackCandidate) {
          fallbackCandidate = parsed
        }

        if (!hasAllRequiredWords(parsed.phrase, words)) continue
        if (previousPhrase && isTooSimilarToPreviousPhrase(parsed.phrase, previousPhrase)) continue

        result = parsed
        break
      }

      return jsonResponse(200, { result: result || fallbackCandidate })
    }

    if (payload.action === 'word_example') {
      const targetWord = payload.targetWord.trim()
      const nativeMeaning = payload.nativeMeaning.trim()
      if (!targetWord || !nativeMeaning) {
        return jsonResponse(400, { error: 'targetWord and nativeMeaning are required' })
      }

      const levelDescription = LEVEL_DESCRIPTIONS[payload.level] || LEVEL_DESCRIPTIONS.A2
      const prompt = [
        `Create one short natural example sentence in ${payload.targetLang} using this exact word: ${targetWord}.`,
        `The word must keep this intended meaning in ${payload.nativeLang}: ${nativeMeaning}.`,
        'Rules:',
        `- CEFR ${payload.level}. Description: ${levelDescription}`,
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
          'You are a spelling checker for single words.',
          `Language of the word: ${payload.lang}.`,
          '',
          'Rules:',
          '- Check spelling only. Never translate. Never explain.',
          '- If the word is correct, return "—".',
          '- If there is a likely typo, return only the corrected word in the same language.',
          '- If unsure, treat as correct and return "—".',
          '',
          'Output format (CRITICAL):',
          '- Return exactly one JSON object on one line: {"suggestion":"..."}',
          '- No markdown. No text before or after JSON.',
          '- Never return more than one JSON object.',
        ].join('\n'),
        text,
        {
          maxTokens: 60,
          temperature: 0,
          tool: {
            name: 'report_spelling',
            description: 'Return spelling suggestion result',
            input_schema: {
              type: 'object',
              properties: {
                suggestion: { type: 'string' },
              },
              required: ['suggestion'],
            },
          },
        },
      )

      const suggestionFromTool = result.toolInput
        ? parseSpellcheckSuggestion(JSON.stringify(result.toolInput))
        : null

      return jsonResponse(200, {
        suggestion: suggestionFromTool ?? parseSpellcheckSuggestion(result.text),
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
        'You improve learner sentences. Preserve required tokens exactly. Reply ONLY JSON.',
        prompt,
        {
          maxTokens: 180,
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

    return jsonResponse(400, { error: 'Unsupported action' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse(500, { error: message })
  }
})
