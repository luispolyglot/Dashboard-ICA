import { describe, expect, it } from 'vitest'
import { summarizeServerUsage } from '../../../../src/modules/services/voiceUsage'

describe('summarizeServerUsage', () => {
  it('adds today, this month, everything and the last 14 days from the server rows', () => {
    const now = new Date('2026-10-06T12:00:00Z')
    const usage = summarizeServerUsage(
      [
        { day: '2026-10-06', generated: 3, reused: 10, seconds: '9.5', cost_usd: '0.0021' },
        { day: '2026-10-01', generated: 2, reused: 1, seconds: 6, cost_usd: 0.001 },
        { day: '2026-09-30', generated: 5, reused: 0, seconds: 15, cost_usd: '0.0035' },
      ],
      now,
    )
    expect(usage.source).toBe('server')
    expect(usage.today).toEqual({ generated: 3, reused: 10, seconds: 9.5, costUsd: 0.0021 })
    expect(usage.month.generated).toBe(5)
    expect(usage.month.costUsd).toBeCloseTo(0.0031)
    expect(usage.all.generated).toBe(10)
    expect(usage.days).toHaveLength(14)
    expect(usage.days[13]).toEqual({ day: '2026-10-06', generated: 3, reused: 10, seconds: 9.5, costUsd: 0.0021 })
    expect(usage.days[0].day).toBe('2026-09-23')
  })
})
