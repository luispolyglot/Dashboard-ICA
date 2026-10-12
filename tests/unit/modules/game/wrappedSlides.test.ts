import { describe, expect, it } from 'vitest'
import { parseIcaSummary } from '@/modules/services/icaSummary'
import {
  archetypeOf,
  availableWrappedYears,
  buildWrappedSlides,
  isWrappedAutoOpenTime,
  latestWrappedYear,
  topPercentLabel,
  topTier,
  daysInYear,
  hasWrappedActivity,
  hourMood,
  songsFor,
} from '@/modules/game/wrapped/wrappedSlides'

const FULL = parseIcaSummary({
  words_added: 1284,
  first_word: { target: 'dzień dobry', native: 'buenos días' },
  phrases_created: 241,
  top_phrase_word: { word: 'zawsze', times: 14 },
  master_notes_closed: 23,
  reviews_total: 6120,
  reviews_correct: 5034,
  top_review_word: { target: 'przepraszam', native: 'perdón', answers: 47, correct: 39 },
  top_hour: 22,
  listening_seconds: 113100,
  cycle_days: 212,
  active_days: 251,
  best_month: { month: '2026-03-01', days: 29 },
  daily_games_played: 164,
  daily_games_perfect: 37,
  challenges_played: 58,
  challenges_won: 34,
  top_rival: { name: 'Davinia', games: 12, wins: 7 },
  best_rank: 3,
})

describe('Wrapped ICA', () => {
  it('reads the summary of the server', () => {
    expect(FULL.listeningMinutes).toBe(1885)
    expect(FULL.topReviewWord?.target).toBe('przepraszam')
    expect(FULL.bestRank).toBe(3)
    expect(parseIcaSummary(null).wordsAdded).toBe(0)
  })

  it('tells the whole year in order, ending with the summary', () => {
    const kinds = buildWrappedSlides(FULL, 40).map((slide) => slide.kind)
    expect(kinds).toEqual([
      'intro',
      'days',
      'words',
      'wordOfYear',
      'creation',
      'flashcards',
      'listening',
      'games',
      'rhythm',
      'profile',
      'final',
    ])
  })

  it('skips the stories with nothing to say', () => {
    const quiet = parseIcaSummary({ words_added: 12, active_days: 3, top_review_word: { target: 'kot', answers: 2 } })
    expect(buildWrappedSlides(quiet, 0).map((slide) => slide.kind)).toEqual(['intro', 'days', 'words', 'profile', 'final'])
    expect(hasWrappedActivity(parseIcaSummary({}))).toBe(false)
  })

  it('picks the phase of the method that was most yours', () => {
    expect(archetypeOf(FULL)).toBe('A')
    expect(archetypeOf(parseIcaSummary({ words_added: 400, phrases_created: 10 }))).toBe('I')
    expect(archetypeOf(parseIcaSummary({ words_added: 80, phrases_created: 60 }))).toBe('C')
    expect(archetypeOf(parseIcaSummary({ words_added: 80, daily_games_played: 90, challenges_played: 40 }))).toBe('G')
  })

  it('adds the «top %» story before the last one', () => {
    const kinds = buildWrappedSlides(FULL, 40, { users: 120, applied: 200, possible: 220, topPercent: 0.8 }).map((slide) => slide.kind)
    expect(kinds.slice(-3)).toEqual(['profile', 'top', 'final'])
    expect(buildWrappedSlides(FULL, 40, { users: 1, applied: 200, possible: 220, topPercent: 100 }).some((slide) => slide.kind === 'top')).toBe(false)
    expect(topTier(0.04)).toBe(0.1)
    expect(topTier(0.3)).toBe(0.5)
    expect(topTier(2.4)).toBe(3)
    expect(topTier(33.3)).toBe(40)
    expect(topTier(66.7)).toBeNull()
    expect(topPercentLabel(0.5, 'es-ES')).toBe('0,5')
    expect(topPercentLabel(3, 'es-ES')).toBe('3')
  })

  it('comes out on 15 December and stays available', () => {
    expect(latestWrappedYear(new Date(2026, 11, 14))).toBe(2025)
    expect(latestWrappedYear(new Date(2026, 11, 15))).toBe(2026)
    expect(availableWrappedYears(new Date(2026, 9, 9), new Date(2026, 0, 10))).toEqual([])
    expect(availableWrappedYears(new Date(2028, 2, 1), new Date(2026, 0, 10))).toEqual([2027, 2026])
    expect(isWrappedAutoOpenTime(new Date(2026, 11, 15))).toBe(true)
    expect(isWrappedAutoOpenTime(new Date(2026, 11, 1))).toBe(false)
    expect(isWrappedAutoOpenTime(new Date(2027, 0, 10))).toBe(true)
  })

  it('turns the hour into a mood and minutes into songs', () => {
    expect(hourMood(7)).toBe('early')
    expect(hourMood(11)).toBe('morning')
    expect(hourMood(17)).toBe('afternoon')
    expect(hourMood(22)).toBe('night')
    expect(hourMood(3)).toBe('owl')
    expect(songsFor(35)).toBe(10)
  })

  it('keeps only the days of the year asked', () => {
    expect(daysInYear(['2025-12-31', '2026-01-01', '2026-07-04'], 2026)).toEqual(['2026-01-01', '2026-07-04'])
  })
})
