// GASTOS DE IA (Luis, 11 Oct): what Claude (Sonnet and Haiku), the Gemini voice and the PreguntICA
// transcriptions cost, read from admin_ai_costs() and admin_ai_cost_people() (super admins only;
// migration 20261011120000_ai_usage_costs.sql). Prices are estimates in US dollars.
import { supabase } from '@/lib/supabase'

export type CostGroup = 'sonnet' | 'haiku' | 'voice' | 'transcription' | 'other'

export const COST_GROUPS: CostGroup[] = ['sonnet', 'haiku', 'voice', 'transcription', 'other']

export type CostRow = {
  day: string
  provider: string
  model: string
  feature: string
  calls: number
  inputTokens: number
  outputTokens: number
  seconds: number
  costUsd: number
}

export type MonthCosts = {
  /** First day of the month (YYYY-MM-01). */
  month: string
  totalUsd: number
  todayUsd: number
  /** The previous month up to the same day of the month (to compare fairly). */
  previousSameDaysUsd: number
  previousTotalUsd: number
  /** Projection for the whole month (only for the current month). */
  projectedUsd: number | null
  people: number
  byGroup: Record<CostGroup, { costUsd: number; calls: number }>
  byFeature: Array<{ feature: string; group: CostGroup; costUsd: number; calls: number }>
  days: Array<{ day: string } & Record<CostGroup, number>>
}

const toNumber = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}

export function costGroup(provider: string, model: string): CostGroup {
  const name = model.toLowerCase()
  if (provider === 'google') return 'voice'
  if (provider === 'openai') return 'transcription'
  if (name.includes('sonnet')) return 'sonnet'
  if (name.includes('haiku')) return 'haiku'
  return 'other'
}

const pad = (value: number) => String(value).padStart(2, '0')
const isoDay = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`

/** First and last day (UTC) of a month, from its YYYY-MM-01. */
export function monthRange(month: string): { from: string; to: string; days: number } {
  const [year, monthNumber] = month.split('-').map(Number)
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from: `${year}-${pad(monthNumber)}-01`, to: `${year}-${pad(monthNumber)}-${pad(days)}`, days }
}

export function shiftMonth(month: string, by: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + by, 1))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`
}

export function currentMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-01`
}

const emptyGroups = <T,>(make: () => T) =>
  Object.fromEntries(COST_GROUPS.map((group) => [group, make()])) as Record<CostGroup, T>

/** Turns the rows of two months (the chosen one and the one before) into what the page shows. */
export function summarizeMonth(rows: CostRow[], month: string, people: number, now = new Date()): MonthCosts {
  const { from, to, days } = monthRange(month)
  const previous = monthRange(shiftMonth(month, -1))
  const today = isoDay(now)
  const isCurrent = today >= from && today <= to
  const dayOfMonth = isCurrent ? Number(today.slice(8, 10)) : days

  const byGroup = emptyGroups(() => ({ costUsd: 0, calls: 0 }))
  const features = new Map<string, { feature: string; group: CostGroup; costUsd: number; calls: number }>()
  const perDay = new Map<string, Record<CostGroup, number>>()
  let totalUsd = 0
  let todayUsd = 0
  let previousSameDaysUsd = 0
  let previousTotalUsd = 0

  for (const row of rows) {
    const day = row.day.slice(0, 10)
    const group = costGroup(row.provider, row.model)
    if (day >= previous.from && day <= previous.to) {
      previousTotalUsd += row.costUsd
      if (Number(day.slice(8, 10)) <= dayOfMonth) previousSameDaysUsd += row.costUsd
      continue
    }
    if (day < from || day > to) continue
    totalUsd += row.costUsd
    if (day === today) todayUsd += row.costUsd
    byGroup[group].costUsd += row.costUsd
    byGroup[group].calls += row.calls
    const key = `${group}:${row.feature}`
    const feature = features.get(key) || { feature: row.feature, group, costUsd: 0, calls: 0 }
    feature.costUsd += row.costUsd
    feature.calls += row.calls
    features.set(key, feature)
    const bucket = perDay.get(day) || emptyGroups(() => 0)
    bucket[group] += row.costUsd
    perDay.set(day, bucket)
  }

  const lastDay = isCurrent ? dayOfMonth : days
  const dayList: MonthCosts['days'] = []
  for (let day = 1; day <= lastDay; day += 1) {
    const key = `${from.slice(0, 8)}${pad(day)}`
    dayList.push({ day: key, ...(perDay.get(key) || emptyGroups(() => 0)) })
  }

  return {
    month: from,
    totalUsd,
    todayUsd,
    previousSameDaysUsd,
    previousTotalUsd,
    projectedUsd: isCurrent && dayOfMonth > 0 ? (totalUsd / dayOfMonth) * days : null,
    people,
    byGroup,
    byFeature: [...features.values()].sort((a, b) => b.costUsd - a.costUsd),
    days: dayList,
  }
}

/** null when there is nothing to read (not a super admin, or the server is not ready yet). */
export async function fetchMonthCosts(month: string): Promise<MonthCosts | null> {
  if (!supabase) return null
  const range = monthRange(month)
  const previousFrom = monthRange(shiftMonth(month, -1)).from
  const [costs, people] = await Promise.all([
    supabase.rpc('admin_ai_costs', { p_from: previousFrom, p_to: range.to }),
    supabase.rpc('admin_ai_cost_people', { p_from: range.from, p_to: range.to }),
  ])
  if (costs.error || !Array.isArray(costs.data)) return null
  const rows: CostRow[] = (costs.data as Array<Record<string, unknown>>).map((row) => ({
    day: String(row.day ?? ''),
    provider: String(row.provider ?? ''),
    model: String(row.model ?? ''),
    feature: String(row.feature ?? ''),
    calls: toNumber(row.calls),
    inputTokens: toNumber(row.input_tokens),
    outputTokens: toNumber(row.output_tokens),
    seconds: toNumber(row.seconds),
    costUsd: toNumber(row.cost_usd),
  }))
  return summarizeMonth(rows, month, people.error ? 0 : toNumber(people.data))
}
