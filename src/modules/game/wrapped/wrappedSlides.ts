import type { IcaPercentile, IcaSummary } from '../../services/icaSummary'

/**
 * WRAPPED ICA (Luis, 9 Oct): your year in the app, story by story, like Spotify Wrapped.
 * This file only decides WHICH stories you get and with what numbers (no React here), so it is
 * easy to test. A story with nothing to say (e.g. no challenges played) is skipped.
 */

/** I, C, A: the three phases of the method. G: gamer (Luis, 9 Oct), when playing is what you did most. */
export type IcaArchetype = 'I' | 'C' | 'A' | 'G'

export type WrappedSlide =
  | { kind: 'intro' }
  | { kind: 'days'; cycleDays: number; bestStreak: number; activeDays: number }
  | { kind: 'words'; words: number; firstWord: { target: string; native: string } | null }
  | { kind: 'wordOfYear'; target: string; native: string; answers: number; correct: number }
  | { kind: 'creation'; phrases: number; topWord: { word: string; times: number } | null }
  | { kind: 'flashcards'; correct: number; total: number }
  | { kind: 'listening'; minutes: number; notes: number }
  | {
      kind: 'games'
      dailyGames: number
      perfect: number
      won: number
      played: number
      rival: { name: string; games: number; wins: number } | null
    }
  | { kind: 'rhythm'; hour: number | null; bestMonth: { month: string; days: number } | null }
  | { kind: 'profile'; archetype: IcaArchetype }
  | { kind: 'top'; applied: number; possible: number; topPercent: number; users: number }
  | { kind: 'final' }

/**
 * What was most yours this year. Each one is measured against what a steady student does in a
 * day: about 8 words, 1 phrase, 10 minutes of listening, or one game (daily challenge or
 * Desafío ICA).
 */
export function archetypeOf(summary: IcaSummary): IcaArchetype {
  const scores: Record<IcaArchetype, number> = {
    I: summary.wordsAdded / 8,
    C: summary.phrasesCreated,
    A: summary.listeningMinutes / 10 + summary.masterNotesClosed * 3,
    G: summary.dailyGamesPlayed + summary.challengesPlayed,
  }
  const order: IcaArchetype[] = ['C', 'I', 'A', 'G']
  return order.reduce((best, phase) => (scores[phase] > scores[best] ? phase : best), order[0])
}

/** «Eso son N canciones»: a pop song lasts about 3 and a half minutes. */
export function songsFor(minutes: number): number {
  return Math.round(minutes / 3.5)
}

export type HourMood = 'early' | 'morning' | 'afternoon' | 'night' | 'owl'

export function hourMood(hour: number): HourMood {
  if (hour >= 5 && hour < 9) return 'early'
  if (hour >= 9 && hour < 14) return 'morning'
  if (hour >= 14 && hour < 20) return 'afternoon'
  if (hour >= 20 || hour < 1) return 'night'
  return 'owl'
}

/** True when there is enough this year to make a Wrapped worth showing. */
export function hasWrappedActivity(summary: IcaSummary): boolean {
  return summary.activeDays > 0 || summary.wordsAdded > 0 || summary.reviewsTotal > 0
}

export function buildWrappedSlides(
  summary: IcaSummary,
  bestStreak: number,
  percentile: IcaPercentile | null = null,
): WrappedSlide[] {
  const slides: WrappedSlide[] = [{ kind: 'intro' }]

  if (summary.cycleDays > 0 || summary.activeDays > 0) {
    slides.push({
      kind: 'days',
      cycleDays: summary.cycleDays,
      bestStreak,
      activeDays: summary.activeDays,
    })
  }
  if (summary.wordsAdded > 0) {
    slides.push({ kind: 'words', words: summary.wordsAdded, firstWord: summary.firstWord })
  }
  // The word of the year needs a few answers to mean something.
  if (summary.topReviewWord && summary.topReviewWord.answers >= 3) {
    slides.push({ kind: 'wordOfYear', ...summary.topReviewWord })
  }
  if (summary.phrasesCreated > 0) {
    slides.push({
      kind: 'creation',
      phrases: summary.phrasesCreated,
      topWord: summary.topPhraseWord && summary.topPhraseWord.times >= 2 ? summary.topPhraseWord : null,
    })
  }
  if (summary.reviewsTotal > 0) {
    slides.push({ kind: 'flashcards', correct: summary.reviewsCorrect, total: summary.reviewsTotal })
  }
  if (summary.listeningMinutes > 0 || summary.masterNotesClosed > 0) {
    slides.push({ kind: 'listening', minutes: summary.listeningMinutes, notes: summary.masterNotesClosed })
  }
  if (summary.dailyGamesPlayed > 0 || summary.challengesPlayed > 0) {
    slides.push({
      kind: 'games',
      dailyGames: summary.dailyGamesPlayed,
      perfect: summary.dailyGamesPerfect,
      won: summary.challengesWon,
      played: summary.challengesPlayed,
      rival: summary.topRival && summary.topRival.games >= 2 ? summary.topRival : null,
    })
  }
  if (summary.topHour !== null || summary.bestMonth) {
    slides.push({ kind: 'rhythm', hour: summary.topHour, bestMonth: summary.bestMonth })
  }
  if (hasWrappedActivity(summary)) {
    slides.push({ kind: 'profile', archetype: archetypeOf(summary) })
  }
  // Like Spotify's «top 0.5 % of listeners»: how often you applied ICA compared with everyone.
  if (percentile && percentile.applied > 0 && percentile.users >= 2) {
    slides.push({ kind: 'top', ...percentile, topPercent: topTier(percentile.topPercent) ?? 0 })
  }
  slides.push({ kind: 'final' })
  return slides
}

/** Best ICA streak inside the year, from the days you completed the cycle (and the saved ones). */
export function daysInYear(days: string[], year: number): string[] {
  const prefix = `${year}-`
  return days.filter((day) => day.startsWith(prefix))
}

/** The Wrapped of a year comes out on 15 December (Luis, 9 Oct) and stays in Estadísticas › Global. */
export function wrappedReleaseDate(year: number): Date {
  return new Date(year, 11, 15)
}

/** The newest Wrapped already out: this year's from 15 December, otherwise last year's. */
export function latestWrappedYear(now: Date): number {
  return now >= wrappedReleaseDate(now.getFullYear()) ? now.getFullYear() : now.getFullYear() - 1
}

/** Every Wrapped you can open, newest first: from the year you signed up (2026 at the earliest). */
export function availableWrappedYears(now: Date, signedUp: Date | null): number[] {
  const first = Math.max(2026, signedUp && !Number.isNaN(signedUp.getTime()) ? signedUp.getFullYear() : 2026)
  const years: number[] = []
  for (let year = latestWrappedYear(now); year >= first; year -= 1) years.push(year)
  return years
}

/** From 15 December to 15 January the newest Wrapped opens by itself (once). */
export function isWrappedAutoOpenTime(now: Date): boolean {
  return (now.getMonth() === 11 && now.getDate() >= 15) || (now.getMonth() === 0 && now.getDate() <= 15)
}

/**
 * Round steps like Spotify Wrapped («top 0,5 %», «top 1 %», «top 2 %»…), never «top 2,4 %».
 * The real value is rounded UP to the next step, so it is always true. Over 50 % there is no
 * «top»: it would not feel like a prize.
 */
const TOP_STEPS = [0.1, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50]

export function topTier(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null
  return TOP_STEPS.find((step) => value <= step) ?? null
}

/** «0,1», «0,5», «2», «25» in the app's language. */
export function topPercentLabel(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
}
