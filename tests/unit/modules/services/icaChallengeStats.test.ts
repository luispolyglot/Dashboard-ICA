import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: null }))

import { computeIcaChallengeStats } from '../../../../src/modules/services/icaChallenges'

const row = (resultType: string, winnerUserId: string | null, day: number, status = 'completed') => ({
  status,
  resultType,
  winnerUserId,
  finalizedAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00Z`,
  createdAt: null,
})

describe('Racha de victorias en Desafíos ICA', () => {
  it('cuenta victorias seguidas; una derrota o un empate la cortan', () => {
    const stats = computeIcaChallengeStats(
      [
        row('challenger_win', 'me', 1),
        row('challenged_win', 'me', 2),
        row('challenger_win', 'me', 3),
        row('challenger_win', 'rival', 4),
        row('draw', null, 5),
        row('challenged_win', 'me', 6),
        row('challenger_win', 'me', 7),
        row('cancelled', null, 8, 'cancelled'),
      ].reverse(),
      'me',
    )
    expect(stats).toEqual({ played: 7, wins: 5, losses: 1, draws: 1, currentStreak: 2, bestStreak: 3 })
  })

  it('sin desafíos terminados, todo a cero', () => {
    expect(computeIcaChallengeStats([], 'me')).toEqual({ played: 0, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0 })
  })
})

import { countIcaChallengeAlerts } from '../../../../src/modules/services/icaChallenges'

describe('Aviso de Desafíos ICA (globito del mando)', () => {
  const now = Date.parse('2026-09-28T12:00:00Z')
  const future = '2026-09-28T20:00:00Z'
  const past = '2026-09-28T08:00:00Z'
  it('cuenta retos nuevos que aún se pueden aceptar y turnos pendientes', () => {
    const alerts = countIcaChallengeAlerts(
      [
        { status: 'created', challengedUserId: 'me', turnUserId: null, acceptUntil: future, turnExpiresAt: null },
        { status: 'created', challengedUserId: 'me', turnUserId: null, acceptUntil: past, turnExpiresAt: null },
        { status: 'created', challengedUserId: 'rival', turnUserId: null, acceptUntil: future, turnExpiresAt: null },
        { status: 'in_progress', challengedUserId: 'rival', turnUserId: 'me', acceptUntil: null, turnExpiresAt: future },
        { status: 'in_progress', challengedUserId: 'me', turnUserId: 'rival', acceptUntil: null, turnExpiresAt: future },
        { status: 'completed', challengedUserId: 'me', turnUserId: null, acceptUntil: null, turnExpiresAt: null },
      ],
      'me',
      now,
    )
    expect(alerts).toEqual({ invites: 1, myTurn: 1 })
    expect(countIcaChallengeAlerts([], null, now)).toEqual({ invites: 0, myTurn: 0 })
  })
})
