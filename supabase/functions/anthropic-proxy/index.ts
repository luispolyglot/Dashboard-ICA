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
  words: string[]
  targetLang: string
  nativeLang: string
  level: string
}

type RequestPayload = TranslatePayload | ActivationPhrasePayload

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
      const words = payload.words.filter((word) => typeof word === 'string' && word.trim().length > 0)
      if (!words.length) {
        return jsonResponse(400, { error: 'Words are required' })
      }

      const levelDescription = LEVEL_DESCRIPTIONS[payload.level] || LEVEL_DESCRIPTIONS.A2
      const prompt = `Generate a sentence in ${payload.targetLang} including ALL words: ${words.join(', ')}\nRules:\n- CEFR ${payload.level} level. Description: ${levelDescription}\n- 20-28 words long\n- Natural, native-sounding\n- Translate to ${payload.nativeLang}\nReply ONLY:\n{"phrase":"<sentence>","translation":"<translation>","words_used":["w1","w2"]}`

      const raw = await callAnthropic(
        'You generate natural sentences for language learners. Reply ONLY in JSON. No markdown, no backticks.',
        prompt,
      )

      return jsonResponse(200, {
        result: parseActivationPhrase(raw),
      })
    }

    return jsonResponse(400, { error: 'Unsupported action' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse(500, { error: message })
  }
})
