// GASTOS DE IA (Luis, 11 Oct): every call to a paid AI adds its tokens and an estimated price to
// public.ai_usage_daily (migration 20261011120000_ai_usage_costs.sql), one row per day, student,
// model and feature, so the admin page «Gastos» can show how the costs change.
// The price is an estimate from the public price list; the real invoice can differ a little.
// Never throws: if saving fails, the student's request goes on as if nothing happened.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { anthropicCostUsd, count, transcriptionCostUsd, type AnthropicUsage } from './ai-prices.ts'

export type { AnthropicUsage }

export type UsageTag = {
  /** The student who caused the call, when there is one. */
  userId?: string | null
  /** What the call was for (translate, preguntica_analysis…). */
  feature: string
}

let serviceClient: ReturnType<typeof createClient> | null | undefined

function getServiceClient() {
  if (serviceClient !== undefined) return serviceClient
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  serviceClient = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  return serviceClient
}

async function track(row: {
  tag: UsageTag
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
  seconds: number
  costUsd: number
}): Promise<void> {
  try {
    const client = getServiceClient()
    if (!client) return
    const { error } = await client.rpc('ai_usage_track', {
      p_user_id: row.tag.userId || null,
      p_provider: row.provider,
      p_model: row.model,
      p_feature: row.tag.feature,
      p_input_tokens: row.inputTokens,
      p_output_tokens: row.outputTokens,
      p_cache_write_tokens: row.cacheWriteTokens,
      p_cache_read_tokens: row.cacheReadTokens,
      p_seconds: row.seconds,
      p_cost_usd: row.costUsd,
    })
    if (error) console.warn('ai-usage: not saved', error.message)
  } catch (error) {
    console.warn('ai-usage: not saved', error instanceof Error ? error.message : error)
  }
}

/** Saves the tokens of one Claude answer (the `usage` object of the response). */
export function trackAnthropicUsage(tag: UsageTag | null | undefined, model: string, usage: AnthropicUsage | null | undefined): Promise<void> {
  if (!tag || !usage) return Promise.resolve()
  return track({
    tag,
    provider: 'anthropic',
    model,
    inputTokens: count(usage.input_tokens),
    outputTokens: count(usage.output_tokens),
    cacheWriteTokens: count(usage.cache_creation_input_tokens),
    cacheReadTokens: count(usage.cache_read_input_tokens),
    seconds: 0,
    costUsd: anthropicCostUsd(model, usage),
  })
}

/** Saves one transcription (OpenAI), priced by the seconds of audio. */
export function trackTranscriptionUsage(tag: UsageTag | null | undefined, model: string, seconds: number): Promise<void> {
  if (!tag) return Promise.resolve()
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  return track({
    tag,
    provider: 'openai',
    model,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    seconds: safeSeconds,
    costUsd: transcriptionCostUsd(model, safeSeconds),
  })
}
