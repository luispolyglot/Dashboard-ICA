// Price list of the paid AIs, to estimate what each call costs (Gastos de IA, Luis 11 Oct).
// No imports on purpose: the unit tests read it directly.

export type AnthropicUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

type AnthropicPrice = {
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
  /** Prompts over this many input tokens pay `long` instead (Haiku 5.5). */
  longFrom?: number
  long?: Omit<AnthropicPrice, 'longFrom' | 'long'>
}

// US dollars per million tokens (platform.claude.com/docs/en/about-claude/pricing, 11 Oct 2026).
// Matched by the start of the model name, longest first.
const ANTHROPIC_PRICES: Array<[string, AnthropicPrice]> = [
  ['claude-sonnet-5-5', { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 }],
  [
    'claude-haiku-5-5',
    {
      input: 0.1,
      cacheWrite: 0.125,
      cacheRead: 0.01,
      output: 0.5,
      longFrom: 100_000,
      long: { input: 0.5, cacheWrite: 0.625, cacheRead: 0.05, output: 2.5 },
    },
  ],
  ['claude-sonnet-4-6', { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 }],
  // Sonnet 4 and 4.5 cost the same as 4.6.
  ['claude-sonnet-4', { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 }],
  ['claude-haiku-4-5', { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 }],
]

// US dollars per minute of audio (OpenAI price list).
const TRANSCRIPTION_PRICES_PER_MINUTE: Array<[string, number]> = [
  ['gpt-4o-mini-transcribe', 0.003],
  ['gpt-4o-transcribe', 0.006],
  ['whisper-1', 0.006],
]

/** A token count as a whole number (0 when missing). */
export function count(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

function anthropicPrice(model: string): AnthropicPrice | null {
  const name = model.toLowerCase()
  const match = ANTHROPIC_PRICES.find(([prefix]) => name.startsWith(prefix))
  return match ? match[1] : null
}

/** Estimated price in US dollars of one Claude answer. 0 for a model that is not in the list. */
export function anthropicCostUsd(model: string, usage: AnthropicUsage | null | undefined): number {
  const price = anthropicPrice(model)
  if (!price || !usage) return 0
  const input = count(usage.input_tokens)
  const cacheWrite = count(usage.cache_creation_input_tokens)
  const cacheRead = count(usage.cache_read_input_tokens)
  const output = count(usage.output_tokens)
  const promptTokens = input + cacheWrite + cacheRead
  const rate = price.longFrom && price.long && promptTokens > price.longFrom ? price.long : price
  return (input * rate.input + cacheWrite * rate.cacheWrite + cacheRead * rate.cacheRead + output * rate.output) / 1_000_000
}

/** Estimated price in US dollars of transcribing `seconds` of audio. */
export function transcriptionCostUsd(model: string, seconds: number): number {
  const name = model.toLowerCase()
  const match = TRANSCRIPTION_PRICES_PER_MINUTE.find(([prefix]) => name.startsWith(prefix))
  if (!match || !Number.isFinite(seconds) || seconds <= 0) return 0
  return (seconds / 60) * match[1]
}
