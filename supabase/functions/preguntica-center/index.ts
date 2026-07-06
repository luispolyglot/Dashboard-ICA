import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'

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
}

type RequestPayload = ProcessAttemptPayload | RefreshSuggestionsPayload

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

function parseWords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
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
  return { ok: true, userId: user.id, adminClient }
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

  const file = new File([audioBlob], `preguntica.${mimeType?.includes('ogg') ? 'ogg' : 'webm'}`, {
    type: mimeType || 'audio/webm',
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
  if (!raw) return null

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>

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
  } catch {
    return null
  }
}

function parseSuggestions(raw: string | null): SuggestionWord[] {
  if (!raw) return []

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    if (!Array.isArray(parsed.suggestedIcaWords)) return []

    return parsed.suggestedIcaWords
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        word: typeof item.word === 'string' ? item.word.trim() : '',
        translation: typeof item.translation === 'string' ? item.translation.trim() : '',
        reason: typeof item.reason === 'string' ? item.reason.trim() : '',
      }))
      .filter((item) => item.word && item.translation && item.reason)
      .slice(0, 8)
  } catch {
    return []
  }
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
    'Analyze the learner response and give clear, concise coaching in native language.',
    'Output STRICT JSON only with shape:',
    '{"score":0-10,"naturalness":"...","corrections":[{"original":"...","suggestion":"...","reason":"..."}],"coachReply":"...","suggestedIcaWords":[{"word":"...","translation":"...","reason":"..."}]}',
    'Rules:',
    '- score from 0 to 10',
    '- corrections max 5',
    '- suggestedIcaWords max 8',
    '- translation must be in learner native language',
    '- keep suggestions concrete and actionable',
    '',
    'Learner response:',
    input.transcript,
  ].join('\n')
}

async function getAttempt(adminClient: any, userId: string, attemptId: string): Promise<AttemptRow> {
  const { data, error } = await adminClient
    .from('preguntica_attempts')
    .select(
      'id, user_id, transcript_text, response_text, response_char_count, target_lang, native_lang, level, ica_words, analysis_payload, suggestions_refresh_count, status',
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

async function processAttemptAudio(
  adminClient: any,
  userId: string,
  payload: ProcessAttemptPayload,
): Promise<Response> {
  const attempt = await getAttempt(adminClient, userId, payload.attemptId)
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
  const isLengthValid = charCount >= 100 && charCount <= 1200

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
      transcript_provider: 'openai',
      transcript_model: Deno.env.get('OPENAI_WHISPER_MODEL') || 'whisper-1',
      status: isLengthValid ? 'analyzing' : 'failed',
      error_code: isLengthValid ? null : 'INVALID_RESPONSE_LENGTH',
      error_message: isLengthValid
        ? null
        : 'La respuesta debe tener entre 100 y 1200 caracteres.',
    })
    .eq('id', attempt.id)

  if (!transcript) {
    throw new Error('EMPTY_TRANSCRIPTION')
  }

  if (!isLengthValid) {
    return jsonResponse(200, {
      ok: false,
      error: 'INVALID_RESPONSE_LENGTH',
      transcript,
      responseCharCount: charCount,
      min: 100,
      max: 1200,
    })
  }

  const targetLang = (payload.targetLang || attempt.target_lang || 'English').trim()
  const nativeLang = (payload.nativeLang || attempt.native_lang || 'Español').trim()
  const level = (payload.level || attempt.level || 'A2').trim()
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

  await adminClient
    .from('preguntica_attempts')
    .update({
      analysis_provider: 'anthropic',
      analysis_model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6',
      analysis_score: parsed.score,
      analysis_payload: parsed as unknown as Record<string, unknown>,
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
    .update({ status: 'ready' })
    .eq('id', audio.id)

  return jsonResponse(200, {
    ok: true,
    attemptId: attempt.id,
    audioId: audio.id,
    transcript,
    responseCharCount: charCount,
    analysis: parsed,
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
  const level = (payload.level || attempt.level || 'A2').trim()
  const icaWords = payload.icaWords && payload.icaWords.length
    ? payload.icaWords
    : parseWords(attempt.ica_words)

  const raw = await callAnthropic(
    'You generate alternative ICA word suggestions. Reply only with valid JSON.',
    [
      `Target language: ${targetLang}`,
      `Native language: ${nativeLang}`,
      `Learner level: ${level}`,
      `Current ICA words: ${icaWords.join(', ') || 'none'}`,
      'Give 4 to 8 alternative ICA words the learner could use to improve the response.',
      'Return STRICT JSON only with shape:',
      '{"suggestedIcaWords":[{"word":"...","translation":"...","reason":"..."}]}',
      `translation must be in: ${nativeLang}`,
      '',
      'Learner response:',
      transcript,
    ].join('\n'),
  )

  const suggestions = parseSuggestions(raw)
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

    return jsonResponse(400, { error: 'Unsupported action' })
  } catch (error) {
    const message = toErrorMessage(error, 'Unknown error')

    if ((payload as ProcessAttemptPayload).action === 'process_attempt_audio') {
      const attemptId = (payload as ProcessAttemptPayload).attemptId
      if (attemptId) {
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
