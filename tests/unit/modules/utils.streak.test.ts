import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStreak, getStreakWithSaved } from '../../../src/modules/utils'

describe('streak utils', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts regular streak from today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'))

    expect(getStreak(['2026-06-07', '2026-06-08', '2026-06-09'])).toBe(3)
  })

  it('keeps ICA streak when yesterday was saved', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'))

    expect(
      getStreakWithSaved(
        ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
        ['2026-06-08'],
      ),
    ).toBe(7)
  })

  it('does not count saved day as completed day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'))

    expect(
      getStreakWithSaved(
        ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-09'],
        ['2026-06-08'],
      ),
    ).toBe(8)
  })

  it('breaks streak when gap was neither completed nor saved', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'))

    expect(
      getStreakWithSaved(['2026-06-05', '2026-06-06', '2026-06-09'], ['2026-06-07']),
    ).toBe(1)
  })
})
