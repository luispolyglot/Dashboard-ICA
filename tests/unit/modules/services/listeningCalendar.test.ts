import { describe, expect, it } from 'vitest'
import { getListeningDayStamp } from '@/modules/services/listeningCalendar'

describe('getListeningDayStamp', () => {
  it('uses the profile timezone date rather than the UTC date', () => {
    const listenedAt = new Date('2026-10-07T01:45:02.601Z')

    expect(getListeningDayStamp(listenedAt, 'America/New_York')).toBe('2026-10-06')
    expect(getListeningDayStamp(listenedAt, 'UTC')).toBe('2026-10-07')
  })
})
