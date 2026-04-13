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

type AnthropicResponse = {
  content?: AnthropicTextBlock[]
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

type RequestPayload =
  | TranslatePayload
  | ActivationPhrasePayload
  | SpellcheckPayload
  | WordExamplePayload

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
  options?: { maxTokens?: number; temperature?: number },
): Promise<string | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514'
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
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic error ${response.status}`)
  }

  const data = (await response.json()) as AnthropicResponse
  return readTextBlocks(data)
}

function parseTranslationCandidate(raw: string | null): TranslationCandidate {
  if (!raw) return { translation: null, confidence: 0 }

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned) as {
      translation?: unknown
      confidence?: unknown
    }

    const translation = typeof parsed.translation === 'string' ? parsed.translation.trim() : ''
    const confidence = typeof parsed.confidence === 'number'
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0

    if (!translation || translation === '—') {
      return { translation: null, confidence }
    }

    return { translation, confidence }
  } catch {
    const fallback = raw.trim()
    if (!fallback || fallback === '—') {
      return { translation: null, confidence: 0 }
    }
    return { translation: fallback, confidence: 0.5 }
  }
}

function parseActivationPhrase(raw: string | null): { phrase: string; translation: string; words_used?: string[] } | null {
  if (!raw) return null

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned) as { phrase?: unknown; translation?: unknown; words_used?: unknown }
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
  } catch {
    return null
  }
}

function parseSpellcheckSuggestion(raw: string | null): string | null {
  if (!raw) return null

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned) as { suggestion?: unknown }
    const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion.trim() : ''
    if (!suggestion || suggestion === '—') return null
    return suggestion
  } catch {
    const fallback = raw.trim()
    if (!fallback || fallback === '—') return null
    return fallback
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
      const translatedRaw = await callAnthropic(
        [
          'You are a cautious bilingual dictionary assistant.',
          `Translate from ${payload.fromLang} to ${payload.toLang}.`,
          'If the input is misspelled, unknown, or too ambiguous, do not guess.',
          'Reply ONLY valid JSON with this exact shape:',
          '{"translation":"... or —","confidence":0.0}',
          'confidence must be a number between 0 and 1.',
        ].join(' '),
        payload.text,
        { maxTokens: 120, temperature: 0 },
      )

      const parsed = parseTranslationCandidate(translatedRaw)
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

      const levelDescription = LEVEL_DESCRIPTIONS[payload.level] || LEVEL_DESCRIPTIONS.A2
      const intendedMeanings = normalizedWords
        .filter((word) => word.native)
        .map((word) => `${word.target} = ${word.native}`)

      const prompt = [
        `Generate one sentence in ${payload.targetLang} including ALL words: ${words.join(', ')}.`,
        'Rules:',
        `- CEFR ${payload.level} level. Description: ${levelDescription}`,
        '- 20-28 words long',
        '- Natural, native-sounding',
        '- Respect the intended meanings from the learner; do not switch to another sense if a word is polysemous.',
        intendedMeanings.length
          ? `- Intended meanings (${payload.targetLang} -> ${payload.nativeLang}): ${intendedMeanings.join('; ')}`
          : '',
        `- Translate to ${payload.nativeLang}`,
        'Reply ONLY:',
        '{"phrase":"<sentence>","translation":"<translation>","words_used":["w1","w2"]}',
      ]
        .filter(Boolean)
        .join('\n')

      const raw = await callAnthropic(
        'You generate natural sentences for language learners. Reply ONLY in JSON. No markdown, no backticks.',
        prompt,
      )

      return jsonResponse(200, {
        result: parseActivationPhrase(raw),
      })
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
        result: parseActivationPhrase(raw),
      })
    }

    if (payload.action === 'spellcheck') {
      const text = payload.text.trim()
      if (!text) {
        return jsonResponse(200, { suggestion: null })
      }

      const raw = await callAnthropic(
        [
          'You are a strict single-word spelling checker.',
          `Language: ${payload.lang}.`,
          'If the word is correct, return suggestion as —.',
          'If there is a likely typo, return the corrected word only.',
          'Do not translate.',
          'Reply ONLY valid JSON: {"suggestion":"... or —"}',
        ].join(' '),
        text,
        { maxTokens: 60, temperature: 0 },
      )

      return jsonResponse(200, {
        suggestion: parseSpellcheckSuggestion(raw),
      })
    }

    return jsonResponse(400, { error: 'Unsupported action' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse(500, { error: message })
  }
})
