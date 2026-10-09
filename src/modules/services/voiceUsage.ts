// VOICE USAGE (Luis, 5-6 Oct): how much the premium voice (Gemini TTS) is costing.
// In the local copy (`pnpm dev`) it comes from scripts/vite-premium-voice.mjs. In development and
// production it comes from public.premium_tts_daily_usage, filled by the premium-tts Edge Function
// and read through admin_premium_tts_usage() (admins only).
import { supabase } from '@/lib/supabase'

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
  source: 'local' | 'server'
  today: VoiceUsageTotals
  month: VoiceUsageTotals
  all: VoiceUsageTotals
  days: Array<VoiceUsageTotals & { day: string }>
  prices: { inputPerMillionUsd: number; outputPerMillionUsd: number; from2027Multiplier: number }
}

const SERVER_MODEL = 'gemini-3.8-flash-lite-tts'
/** Paid tier prices of that model per million tokens (same table as the Edge Function). */
const SERVER_PRICES = { inputPerMillionUsd: 0.5, outputPerMillionUsd: 6, from2027Multiplier: 2 }

type ServerUsageRow = {
  day: string
  generated: number | string | null
  reused: number | string | null
  seconds: number | string | null
  cost_usd: number | string | null
}

const toNumber = (value: number | string | null | undefined): number => {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}

const emptyTotals = (): VoiceUsageTotals => ({ generated: 0, reused: 0, seconds: 0, costUsd: 0 })

/** UTC day, like the server rows. */
const utcDay = (date: Date) => date.toISOString().slice(0, 10)

/** Turns the per-day rows of the server into the same shape the local plugin returns. */
export function summarizeServerUsage(rows: ServerUsageRow[], now = new Date()): VoiceUsage {
  const today = utcDay(now)
  const month = today.slice(0, 7)
  const totals = { today: emptyTotals(), month: emptyTotals(), all: emptyTotals() }
  const byDay = new Map<string, VoiceUsageTotals>()
  for (const row of rows) {
    const day = String(row.day).slice(0, 10)
    const values: VoiceUsageTotals = {
      generated: toNumber(row.generated),
      reused: toNumber(row.reused),
      seconds: toNumber(row.seconds),
      costUsd: toNumber(row.cost_usd),
    }
    byDay.set(day, values)
    const buckets = [totals.all]
    if (day === today) buckets.push(totals.today)
    if (day.startsWith(month)) buckets.push(totals.month)
    for (const bucket of buckets) {
      bucket.generated += values.generated
      bucket.reused += values.reused
      bucket.seconds += values.seconds
      bucket.costUsd += values.costUsd
    }
  }
  const days: VoiceUsage['days'] = []
  for (let back = 13; back >= 0; back -= 1) {
    const date = new Date(now.getTime() - back * 86_400_000)
    const day = utcDay(date)
    days.push({ day, ...(byDay.get(day) || emptyTotals()) })
  }
  return { enabled: true, model: SERVER_MODEL, source: 'server', ...totals, days, prices: SERVER_PRICES }
}

/** null when there is nothing to read (not an admin, or the server is not ready yet). */
export async function fetchVoiceUsage(): Promise<VoiceUsage | null> {
  if (import.meta.env.DEV) {
    try {
      const response = await fetch('/__ica/tts/usage', { cache: 'no-store' })
      if (!response.ok) return null
      return (await response.json()) as VoiceUsage
    } catch {
      return null
    }
  }
  if (!supabase) return null
  const { data, error } = await supabase.rpc('admin_premium_tts_usage')
  if (error || !Array.isArray(data)) return null
  return summarizeServerUsage(data as ServerUsageRow[])
}
