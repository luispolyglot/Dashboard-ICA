import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Your numbers between two moments for one language pair (RPC get_my_ica_summary). Estadísticas
 * uses it for «Global» and the Wrapped ICA for a whole year (Luis, 9 Oct).
 */
export type IcaSummary = {
  fromDay: string
  toDay: string
  wordsAdded: number
  firstWord: { target: string; native: string } | null
  phrasesCreated: number
  topPhraseWord: { word: string; times: number } | null
  masterNotesClosed: number
  reviewsTotal: number
  reviewsCorrect: number
  topReviewWord: { target: string; native: string; answers: number; correct: number } | null
  /** Hour of the day (0-23, your time) when you answer the most flashcards. */
  topHour: number | null
  listeningMinutes: number
  cycleDays: number
  flashDays: number
  activeDays: number
  bestMonth: { month: string; days: number } | null
  dailyGamesPlayed: number
  dailyGamesPerfect: number
  dailyGamesCorrect: number
  challengesPlayed: number
  challengesWon: number
  topRival: { name: string; games: number; wins: number } | null
  bestRank: number | null
  coinsEarned: number
}

type Raw = Record<string, unknown>

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function obj(value: unknown): Raw | null {
  return value && typeof value === 'object' ? (value as Raw) : null
}

export function parseIcaSummary(raw: unknown): IcaSummary {
  const data = obj(raw) || {}
  const first = obj(data.first_word)
  const phrase = obj(data.top_phrase_word)
  const review = obj(data.top_review_word)
  const month = obj(data.best_month)
  const rival = obj(data.top_rival)
  return {
    fromDay: String(data.from_day || ''),
    toDay: String(data.to_day || ''),
    wordsAdded: num(data.words_added),
    firstWord: first && first.target ? { target: String(first.target), native: String(first.native || '') } : null,
    phrasesCreated: num(data.phrases_created),
    topPhraseWord: phrase && phrase.word ? { word: String(phrase.word), times: num(phrase.times) } : null,
    masterNotesClosed: num(data.master_notes_closed),
    reviewsTotal: num(data.reviews_total),
    reviewsCorrect: num(data.reviews_correct),
    topReviewWord:
      review && review.target
        ? {
            target: String(review.target),
            native: String(review.native || ''),
            answers: num(review.answers),
            correct: num(review.correct),
          }
        : null,
    topHour: data.top_hour === null || data.top_hour === undefined ? null : num(data.top_hour),
    listeningMinutes: Math.floor(num(data.listening_seconds) / 60),
    cycleDays: num(data.cycle_days),
    flashDays: num(data.flash_days),
    activeDays: num(data.active_days),
    bestMonth: month && month.month ? { month: String(month.month), days: num(month.days) } : null,
    dailyGamesPlayed: num(data.daily_games_played),
    dailyGamesPerfect: num(data.daily_games_perfect),
    dailyGamesCorrect: num(data.daily_games_correct),
    challengesPlayed: num(data.challenges_played),
    challengesWon: num(data.challenges_won),
    topRival: rival && rival.name ? { name: String(rival.name), games: num(rival.games), wins: num(rival.wins) } : null,
    bestRank: data.best_rank === null || data.best_rank === undefined ? null : num(data.best_rank),
    coinsEarned: num(data.coins_earned),
  }
}

/** A day as YYYY-MM-DD (the server reads it in the time zone of the student's profile). */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export async function fetchMyIcaSummary(range: {
  from: Date
  to: Date
  targetLang: string
  nativeLang: string
}): Promise<IcaSummary> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.rpc('get_my_ica_summary', {
    // Days, not moments: «1 January» is the student's own 1 January (Nahuel, 9 Oct).
    p_from_day: dayKey(range.from),
    p_to_day: dayKey(range.to),
    p_target_lang: range.targetLang,
    p_native_lang: range.nativeLang,
  })
  if (error) throw error
  return parseIcaSummary(data)
}

/** Start and end (exclusive) of a year in your own time. */
export function yearRange(year: number): { from: Date; to: Date } {
  return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1) }
}

export type IcaSummaryState = { summary: IcaSummary | null; loading: boolean; error: boolean }

/** Loads the summary for a range; pass null to load nothing. */
export function useIcaSummary(
  range: { from: Date; to: Date; targetLang: string; nativeLang: string } | null,
  refreshKey = 0,
): IcaSummaryState {
  const [state, setState] = useState<IcaSummaryState>({ summary: null, loading: Boolean(range), error: false })
  const key = range
    ? `${range.from.getTime()}|${range.to.getTime()}|${range.targetLang}|${range.nativeLang}|${refreshKey}`
    : ''

  useEffect(() => {
    if (!range) {
      setState({ summary: null, loading: false, error: false })
      return
    }
    let alive = true
    setState((current) => ({ ...current, loading: true, error: false }))
    fetchMyIcaSummary(range)
      .then((summary) => {
        if (alive) setState({ summary, loading: false, error: false })
      })
      .catch(() => {
        if (alive) setState({ summary: null, loading: false, error: true })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}

/** How often you applied ICA in a year compared with every icademer (RPC get_my_ica_percentile). */
export type IcaPercentile = {
  users: number
  applied: number
  possible: number
  /** 0.1 = you are in the top 0.1 %. */
  topPercent: number
}

export async function fetchMyIcaPercentile(year: number): Promise<IcaPercentile | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('get_my_ica_percentile', { p_year: year })
    if (error || !data) return null
    const raw = data as Record<string, unknown>
    const users = num(raw.users)
    const applied = num(raw.applied)
    if (users < 2 || applied <= 0 || raw.top_percent === undefined) return null
    return { users, applied, possible: Math.max(applied, num(raw.possible)), topPercent: num(raw.top_percent) }
  } catch {
    return null
  }
}
