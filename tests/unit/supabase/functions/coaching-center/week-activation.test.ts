import { describe, expect, it } from 'vitest'
import {
  buildWeekActivationState,
  evaluateWeekActivationRequest,
  type CoachingSessionWeekActivationRow,
} from '../../../../../supabase/functions/coaching-center/week-activation'

function activation(overrides?: Partial<CoachingSessionWeekActivationRow>): CoachingSessionWeekActivationRow {
  return {
    session_id: 'session-1',
    week_number: 1,
    activated_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
    ...overrides,
  }
}

describe('week activation helpers', () => {
  it('treats already activated week as idempotent scenario', () => {
    const decision = evaluateWeekActivationRequest({
      weekNumber: 1,
      activations: [activation()],
      weeklyObjectives: {
        W01: { wordsTarget: 20 },
      },
      nowMs: Date.parse('2026-01-02T00:00:00.000Z'),
    })

    expect(decision.ok).toBe(false)
    expect(decision.reason).toBe('already_activated')
  })

  it('blocks next week when previous is not finished', () => {
    const decision = evaluateWeekActivationRequest({
      weekNumber: 2,
      activations: [activation()],
      weeklyObjectives: {
        W02: { wordsTarget: 25 },
      },
      nowMs: Date.parse('2026-01-03T00:00:00.000Z'),
    })

    expect(decision.ok).toBe(false)
    expect(decision.reason).toBe('previous_week_not_finished')
  })

  it('keeps next week blocked even after 7+ days when previous is not manually closed', () => {
    const decision = evaluateWeekActivationRequest({
      weekNumber: 2,
      activations: [
        activation({
          activated_at: '2026-01-01T00:00:00.000Z',
        }),
      ],
      weeklyObjectives: {
        W02: { wordsTarget: 25 },
      },
      nowMs: Date.parse('2026-01-10T00:00:00.000Z'),
    })

    expect(decision.ok).toBe(false)
    expect(decision.reason).toBe('previous_week_not_finished')
  })

  it('allows next week when previous is manually closed', () => {
    const decision = evaluateWeekActivationRequest({
      weekNumber: 2,
      activations: [
        activation({
          activated_at: '2026-01-01T00:00:00.000Z',
          ended_at: '2026-01-01T12:00:00.000Z',
        }),
      ],
      weeklyObjectives: {
        W02: { wordsTarget: 25 },
      },
      nowMs: Date.parse('2026-01-10T00:00:00.000Z'),
    })

    expect(decision.ok).toBe(true)
    expect(decision.reason).toBeNull()
  })

  it('returns next blocked reason based on objective configuration', () => {
    const state = buildWeekActivationState(
      [
        activation({
          week_number: 1,
          activated_at: '2026-01-01T00:00:00.000Z',
        }),
      ],
      {},
      Date.parse('2026-01-10T00:00:00.000Z'),
    )

    expect(state.lastActivatedWeek).toBe(1)
    expect(state.nextWeekEligible).toBeNull()
    expect(state.nextWeekBlockedReason).toBe('missing_objectives')
  })

  it('unlocks next week when current week is manually closed', () => {
    const state = buildWeekActivationState(
      [
        activation({
          week_number: 1,
          activated_at: '2026-01-01T00:00:00.000Z',
          ended_at: '2026-01-01T12:00:00.000Z',
        }),
      ],
      {
        W02: { wordsTarget: 30 },
      },
      Date.parse('2026-01-01T12:00:01.000Z'),
    )

    expect(state.currentActiveWeek).toBeNull()
    expect(state.nextWeekEligible).toBe(2)
    expect(state.nextWeekBlockedReason).toBeNull()
  })
})
