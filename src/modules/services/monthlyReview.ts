import { supabase } from '@/lib/supabase'
import { t } from '@/i18n'
import { signalIcaCoinsStateChanged } from '../game/fichas'
import type { ReviewPool, RoundScores } from '../game/monthlyReview/rules'

/**
 * REPASO DEL MES (Luis, 9 Oct). Everything that matters is decided by the server (window, minimum
 * of words, once per month, prize in ICA Coins); the browser only asks and shows.
 * See supabase/migrations/20261010120000_monthly_review.sql.
 */

export type MonthlyReviewResult = {
  correct: number
  total: number
  rememberedOfTen: number
  coins: number
  rounds: RoundScores
  finishedAt: string | null
}

export type MonthlyReviewStatus = {
  /** First day of the month, in the student's own time zone (YYYY-MM-01). */
  monthStart: string
  today: string
  openDay: number
  closeDay: number
  minWords: number
  windowOpen: boolean
  /** ICA words saved between day 1 and the open day of the month. */
  wordCount: number
  eligible: boolean
  result: MonthlyReviewResult | null
}

export type MonthlyReviewFinish = MonthlyReviewResult & {
  alreadyDone: boolean
  coinsCapped: boolean
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseRounds(value: unknown): RoundScores {
  const rounds = record(value)
  const one = (key: string) => {
    const row = record(rounds?.[key])
    return { correct: num(row?.correct), total: num(row?.total) }
  }
  return { reading: one('reading'), listening: one('listening'), writing: one('writing') }
}

function parseResult(value: unknown): MonthlyReviewResult | null {
  const row = record(value)
  if (!row) return null
  return {
    correct: num(row.correct),
    total: num(row.total),
    rememberedOfTen: num(row.rememberedOfTen),
    coins: num(row.coins),
    rounds: parseRounds(row.rounds),
    finishedAt: typeof row.finishedAt === 'string' ? row.finishedAt : null,
  }
}

function parseStatus(value: unknown): MonthlyReviewStatus {
  const row = record(value)
  if (!row || typeof row.monthStart !== 'string') throw new Error('MONTHLY_REVIEW_STATUS_INVALID')
  return {
    monthStart: row.monthStart,
    today: typeof row.today === 'string' ? row.today : row.monthStart,
    openDay: num(row.openDay, 21),
    closeDay: num(row.closeDay, 28),
    minWords: num(row.minWords, 20),
    windowOpen: Boolean(row.windowOpen),
    wordCount: num(row.wordCount),
    eligible: Boolean(row.eligible),
    result: parseResult(row.result),
  }
}

function parsePoolItems(value: unknown): ReviewPool['words'] {
  if (!Array.isArray(value)) return []
  const items: ReviewPool['words'] = []
  for (const entry of value) {
    const row = record(entry)
    if (!row || typeof row.id !== 'string' || typeof row.target !== 'string' || typeof row.native !== 'string') continue
    items.push({ id: row.id, target: row.target, native: row.native })
  }
  return items
}

export async function fetchMonthlyReviewStatus(targetLang: string, nativeLang: string): Promise<MonthlyReviewStatus> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  const { data, error } = await supabase.rpc('get_my_monthly_review_status', {
    p_target_lang: targetLang,
    p_native_lang: nativeLang,
  })
  if (error) throw error
  return parseStatus(data)
}

/** `practice`: repeat a Repaso already done this month (saves nothing, pays nothing). */
export async function fetchMonthlyReviewPool(targetLang: string, nativeLang: string, practice = false): Promise<ReviewPool> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  const { data, error } = await supabase.rpc('get_my_monthly_review_pool', {
    p_target_lang: targetLang,
    p_native_lang: nativeLang,
    p_practice: practice,
  })
  if (error) throw error
  const row = record(data)
  return { words: parsePoolItems(row?.words), phrases: parsePoolItems(row?.phrases) }
}

export async function finishMonthlyReview(input: {
  targetLang: string
  nativeLang: string
  correct: number
  total: number
  rounds: RoundScores
  missedWordIds: string[]
}): Promise<MonthlyReviewFinish> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  const { data, error } = await supabase.rpc('finish_monthly_review', {
    p_target_lang: input.targetLang,
    p_native_lang: input.nativeLang,
    p_correct: input.correct,
    p_total: input.total,
    p_rounds: input.rounds,
    p_missed_word_ids: input.missedWordIds.slice(0, 14),
  })
  if (error) throw error
  const row = record(data)
  const result = parseResult(row)
  if (!row || !result) throw new Error('MONTHLY_REVIEW_RESULT_INVALID')
  // The prize went through the ledger: the counter in the top bar reloads.
  signalIcaCoinsStateChanged()
  return { ...result, alreadyDone: Boolean(row.alreadyDone), coinsCapped: Boolean(row.coinsCapped) }
}

/** The student's past Repasos (newest first), for the list in Tests. */
export async function listMonthlyReviews(): Promise<Array<MonthlyReviewResult & { month: string; targetLang: string }>> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('ica_monthly_reviews')
    .select('review_month, target_lang, correct, total, remembered_of_ten, coins_awarded, round_scores, finished_at')
    .order('review_month', { ascending: false })
    .limit(24)
  if (error) throw error
  return (data ?? []).map((row) => ({
    month: String(row.review_month),
    targetLang: String(row.target_lang),
    correct: num(row.correct),
    total: num(row.total),
    rememberedOfTen: num(row.remembered_of_ten),
    coins: num(row.coins_awarded),
    rounds: parseRounds(row.round_scores),
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
  }))
}

/** A readable message for the codes the server raises. */
export function monthlyReviewErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : ''
  if (message.includes('REVIEW_WINDOW_CLOSED')) return t('El Repaso no está abierto ahora mismo.')
  if (message.includes('REVIEW_ALREADY_DONE')) return t('Ya hiciste el Repaso de este mes.')
  if (message.includes('REVIEW_NOT_ELIGIBLE')) return t('Aún no tienes suficientes palabras ICA de este mes para el Repaso.')
  return t('No pudimos cargar el Repaso. Inténtalo de nuevo en un momento.')
}
