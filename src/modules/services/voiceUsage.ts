// VOICE USAGE (Luis, 5 Oct): how much the premium voice (Gemini TTS) is costing.
// For now it comes from the local copy (`pnpm dev`, scripts/vite-premium-voice.mjs), which logs
// every audio it creates. When the voice is in production, its Edge Function should log the same
// fields in Supabase and this function should read them from there.

export type VoiceUsageTotals = {
  /** Audios created (each one is paid once). */
  generated: number
  /** Audios played again from the saved copy (free). */
  reused: number
  /** Seconds of voice created. */
  seconds: number
  /** Estimated price in US dollars (Google bills in dollars, charged in euros). */
  costUsd: number
}

export type VoiceUsage = {
  enabled: boolean
  model: string
  source: 'local'
  today: VoiceUsageTotals
  month: VoiceUsageTotals
  all: VoiceUsageTotals
  days: Array<VoiceUsageTotals & { day: string }>
  prices: { inputPerMillionUsd: number; outputPerMillionUsd: number; from2027Multiplier: number }
}

/** null when there is nothing to read (the production app, for now). */
export async function fetchVoiceUsage(): Promise<VoiceUsage | null> {
  if (!import.meta.env.DEV) return null
  try {
    const response = await fetch('/__ica/tts/usage', { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as VoiceUsage
  } catch {
    return null
  }
}
