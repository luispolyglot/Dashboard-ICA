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

type JobRow = {
  id: number
  lexicard_id: string
  target_word: string
  native_meaning: string
  target_lang: string
  native_lang: string
  cefr_level: string
  attempts: number
  max_attempts: number
}

type WordExampleResult = {
  phrase: string
  translation: string
}

type WorkerRequest = {
  batchSize?: number
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
    // fallback
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

function parseWordExample(raw: string | null): WordExampleResult | null {
  const parsed = parseLastJsonObject(raw)
  if (!parsed) return null

  const phrase = typeof parsed.phrase === 'string' ? parsed.phrase.trim() : ''
  const translation =
    typeof parsed.translation === 'string' ? parsed.translation.trim() : ''

  if (!phrase || !translation) return null
  return { phrase, translation }
}

async function requireUser(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return {
      ok: false,
      response: jsonResponse(401, { error: 'Missing authorization header' }),
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: jsonResponse(500, {
        error: 'Supabase function environment is not configured',
      }),
    }
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

async function callAnthropicForWordExample(job: JobRow): Promise<WordExampleResult | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6'
  const baseUrl =
    Deno.env.get('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com'

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY secret')
  }

  const levelDescription = LEVEL_DESCRIPTIONS[job.cefr_level] || LEVEL_DESCRIPTIONS.A2
  const prompt = [
    `Create one short natural example sentence in ${job.target_lang} using this exact word: ${job.target_word}.`,
    `The word must keep this intended meaning in ${job.native_lang}: ${job.native_meaning}.`,
    'Rules:',
    `- CEFR ${job.cefr_level}. Description: ${levelDescription}`,
    '- 8-14 words',
    '- Keep wording practical and learner-friendly',
    `- Provide translation in ${job.native_lang}`,
    'Reply ONLY:',
    '{"phrase":"<sentence>","translation":"<translation>"}',
  ].join('\n')

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 180,
      temperature: 0.1,
      system:
        'You generate high-quality learner examples. Reply ONLY in JSON. No markdown, no backticks.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic error ${response.status}`)
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>
  }

  const text = data.content
    ?.map((block) => (block.type === 'text' ? block.text || '' : ''))
    .join('')
    .trim() || null

  return parseWordExample(text)
}

function buildBackoffMinutes(attempts: number): number {
  const boundedAttempts = Math.max(1, attempts)
  return Math.min(60, 2 ** (boundedAttempts - 1))
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(500, {
      error: 'Supabase function environment is not configured',
    })
  }

  const authHeader = req.headers.get('Authorization') || ''
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  let payload: WorkerRequest = {}
  try {
    payload = (await req.json()) as WorkerRequest
  } catch {
    payload = {}
  }

  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  const batchSize = Math.max(1, Math.min(payload.batchSize || 2, 10))

  await client.rpc('requeue_stale_lexicard_example_jobs', {
    p_stale_before: '5 minutes',
  })

  const { data: jobs, error: claimError } = await client.rpc(
    'claim_lexicard_example_jobs',
    {
      p_limit: batchSize,
    },
  )

  if (claimError) {
    return jsonResponse(500, { error: claimError.message })
  }

  const claimedJobs = (jobs || []) as JobRow[]
  if (!claimedJobs.length) {
    return jsonResponse(200, {
      processed: 0,
      completed: 0,
      retried: 0,
      failed: 0,
    })
  }

  let completed = 0
  let retried = 0
  let failed = 0

  for (const job of claimedJobs) {
    try {
      const result = await callAnthropicForWordExample(job)
      if (!result) {
        throw new Error('Empty or invalid word example result')
      }

      const { error: lexicardError } = await client
        .from('lexicards')
        .update({
          example_phrase: result.phrase,
          example_translation: result.translation,
        })
        .eq('id', job.lexicard_id)
        .eq('user_id', user.id)
        .select('id')
        .single()

      if (lexicardError) {
        throw lexicardError
      }

      const { error: doneError } = await client
        .from('lexicard_example_jobs')
        .update({
          status: 'done',
          locked_at: null,
          last_error: null,
        })
        .eq('id', job.id)
        .select('id')
        .single()

      if (doneError) {
        throw doneError
      }

      completed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const shouldFail = job.attempts >= job.max_attempts
      const backoffMinutes = buildBackoffMinutes(job.attempts)
      const nextRunAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()

      const { error: queueError } = await client
        .from('lexicard_example_jobs')
        .update({
          status: shouldFail ? 'failed' : 'retry',
          next_run_at: shouldFail ? new Date().toISOString() : nextRunAt,
          locked_at: null,
          last_error: message.slice(0, 1000),
        })
        .eq('id', job.id)

      if (queueError) {
        return jsonResponse(500, { error: queueError.message })
      }

      if (shouldFail) {
        failed += 1
      } else {
        retried += 1
      }
    }
  }

  return jsonResponse(200, {
    processed: claimedJobs.length,
    completed,
    retried,
    failed,
  })
})
