import { describe, expect, it } from 'vitest'
import { costGroup, monthRange, shiftMonth, summarizeMonth, type CostRow } from '@/modules/services/aiCosts'

const row = (day: string, provider: string, model: string, feature: string, costUsd: number, calls = 1): CostRow => ({
  day, provider, model, feature, calls, inputTokens: 0, outputTokens: 0, seconds: 0, costUsd,
})

describe('aiCosts', () => {
  it('agrupa por modelo', () => {
    expect(costGroup('anthropic', 'claude-sonnet-5-5')).toBe('sonnet')
    expect(costGroup('anthropic', 'claude-haiku-4-5-20251001')).toBe('haiku')
    expect(costGroup('google', 'gemini-3.8-flash-lite-tts')).toBe('voice')
    expect(costGroup('openai', 'whisper-1')).toBe('transcription')
    expect(costGroup('anthropic', 'claude-opus-x')).toBe('other')
  })

  it('meses: primer y último día, y moverse de mes', () => {
    expect(monthRange('2026-02-01')).toEqual({ from: '2026-02-01', to: '2026-02-28', days: 28 })
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01')
  })

  it('resume el mes en curso y lo compara con los mismos días del anterior', () => {
    const rows = [
      row('2026-09-05', 'anthropic', 'claude-sonnet-5-5', 'translate', 1),
      row('2026-09-20', 'anthropic', 'claude-sonnet-5-5', 'translate', 5),
      row('2026-10-02', 'anthropic', 'claude-sonnet-5-5', 'translate', 2, 10),
      row('2026-10-10', 'anthropic', 'claude-haiku-5-5', 'flashcard_example', 0.5, 40),
      row('2026-10-10', 'google', 'gemini-tts', 'voice', 0.5, 7),
    ]
    const summary = summarizeMonth(rows, '2026-10-01', 4, new Date('2026-10-10T12:00:00Z'))
    expect(summary.totalUsd).toBeCloseTo(3)
    expect(summary.todayUsd).toBeCloseTo(1)
    expect(summary.previousSameDaysUsd).toBeCloseTo(1)
    expect(summary.previousTotalUsd).toBeCloseTo(6)
    expect(summary.projectedUsd).toBeCloseTo(9.3)
    expect(summary.byGroup.sonnet).toEqual({ costUsd: 2, calls: 10 })
    expect(summary.byGroup.voice.calls).toBe(7)
    expect(summary.byFeature[0].feature).toBe('translate')
    expect(summary.days).toHaveLength(10)
    expect(summary.days[9].haiku).toBeCloseTo(0.5)
  })

  it('un mes pasado no tiene previsión y enseña todos sus días', () => {
    const summary = summarizeMonth([], '2026-09-01', 0, new Date('2026-10-10T12:00:00Z'))
    expect(summary.projectedUsd).toBeNull()
    expect(summary.days).toHaveLength(30)
  })
})
