import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMonthlyStreakLeaderboardMock = vi.fn()
const fetchMonthlySnapshotLeaderboardMock = vi.fn()
const fetchTotalIcademersMock = vi.fn()
const useAuthMock = vi.fn()
const getIcaTestWindowStartDayMock = vi.fn()

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('@/modules/services/leaderboard', () => ({
  fetchMonthlyStreakLeaderboard: (...args: unknown[]) =>
    fetchMonthlyStreakLeaderboardMock(...args),
  fetchMonthlySnapshotLeaderboard: (...args: unknown[]) =>
    fetchMonthlySnapshotLeaderboardMock(...args),
  fetchTotalIcademers: (...args: unknown[]) => fetchTotalIcademersMock(...args),
  peekMonthlyStreakLeaderboard: () => undefined,
  peekMonthlySnapshotLeaderboard: () => undefined,
  peekTotalIcademers: () => undefined,
}))

vi.mock('@/modules/services/icaTests', () => ({
  getIcaTestWindowStartDay: () => getIcaTestWindowStartDayMock(),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select
      aria-label='Selecciona mes'
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}))

import { LeaderboardView } from '@/modules/views/LeaderboardView'

afterEach(() => {
  cleanup()
})

describe('LeaderboardView ICA test column', () => {
  beforeEach(() => {
    fetchMonthlyStreakLeaderboardMock.mockReset()
    fetchMonthlySnapshotLeaderboardMock.mockReset()
    fetchTotalIcademersMock.mockReset()
    useAuthMock.mockReset()
    getIcaTestWindowStartDayMock.mockReset()

    useAuthMock.mockReturnValue({ user: { id: 'user-1' } })
    getIcaTestWindowStartDayMock.mockReturnValue(25)
    fetchTotalIcademersMock.mockResolvedValue(120)
    fetchMonthlySnapshotLeaderboardMock.mockResolvedValue([])
  })

  // El ranking ya no es una tabla: el ICA Test se ve en el detalle de puntuación
  // (se abre desde tu puesto, arriba, o tocando a alguien del podio).
  it('does not count ICA Test before the official window day in current month', async () => {
    getIcaTestWindowStartDayMock.mockReturnValue(31)
    fetchMonthlyStreakLeaderboardMock.mockResolvedValue([
      {
        rank: 1,
        user_id: 'user-1',
        username: 'ana',
        display_name: 'Ana',
        ica_streak_days: 4,
        avg_percent: 80,
        ica_test_points: 1.1,
        total_points: 8,
      },
    ])

    render(<LeaderboardView />)

    await waitFor(() => {
      expect(screen.getByText('8,0 pts')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Ver tu puntuación/ }))

    await waitFor(() => {
      expect(screen.getByText('Tu puntuación')).toBeTruthy()
    })
    expect(screen.queryByText('1,1')).toBeNull()
  })

  it('counts ICA Test on or after the official window day in current month', async () => {
    getIcaTestWindowStartDayMock.mockReturnValue(1)
    fetchMonthlyStreakLeaderboardMock.mockResolvedValue([
      {
        rank: 1,
        user_id: 'user-1',
        username: 'ana',
        display_name: 'Ana',
        ica_streak_days: 6,
        avg_percent: 85,
        ica_test_points: 1.1,
        total_points: 9.8,
      },
    ])

    render(<LeaderboardView />)

    await waitFor(() => {
      expect(screen.getByText('9,8 pts')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Ver tu puntuación/ }))

    await waitFor(() => {
      expect(screen.getByText('1,1')).toBeTruthy()
    })
  })

  it('uses the ICA Test in historic snapshots only when the snapshot has ICA points', async () => {
    getIcaTestWindowStartDayMock.mockReturnValue(31)
    fetchMonthlyStreakLeaderboardMock.mockResolvedValue([
      {
        rank: 1,
        user_id: 'user-1',
        username: 'ana',
        display_name: 'Ana',
        ica_streak_days: 4,
        avg_percent: 80,
        total_points: 8,
      },
    ])
    fetchMonthlySnapshotLeaderboardMock.mockImplementation(async (month: string) => {
      if (month === '2026-05-01') {
        return [
          {
            rank: 1,
            user_id: 'user-2',
            username: 'luz',
            display_name: 'Luz',
            ica_streak_days: 4,
            avg_percent: 84,
            ica_test_points: 0.7,
            total_points: 8.4,
          },
        ]
      }
      return []
    })

    render(<LeaderboardView />)

    await waitFor(() => {
      expect(fetchMonthlyStreakLeaderboardMock).toHaveBeenCalled()
    })

    // El mes se cambia con las flechas ‹ ›: se va hasta el primero (mayo de 2026).
    const olderMonthButton = screen.getByRole('button', { name: 'Mes anterior' }) as HTMLButtonElement
    for (let guard = 0; guard < 24 && !olderMonthButton.disabled; guard += 1) {
      fireEvent.click(olderMonthButton)
    }

    await waitFor(() => {
      expect(fetchMonthlySnapshotLeaderboardMock).toHaveBeenCalledWith(
        '2026-05-01',
        250,
      )
      expect(screen.getByText('8,4 pts')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /^Luz: / }))

    await waitFor(() => {
      expect(screen.getByText('0,7')).toBeTruthy()
    })
  })

  it('opens prize dialog when clicking top medal', async () => {
    getIcaTestWindowStartDayMock.mockReturnValue(1)
    fetchMonthlyStreakLeaderboardMock.mockResolvedValue([
      {
        rank: 1,
        user_id: 'user-1',
        username: 'ana',
        display_name: 'Ana',
        ica_streak_days: 6,
        avg_percent: 85,
        total_points: 9.8,
      },
    ])

    render(<LeaderboardView />)

    await waitFor(() => {
      expect(fetchMonthlyStreakLeaderboardMock).toHaveBeenCalled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Ver premio del puesto 1' }))

    expect(
      screen.getByText('El icademer que termine top 1 el día 28 del mes ganará:'),
    ).toBeTruthy()
    expect(screen.getByText('Clase 1 a 1 de 1 hora con Luis')).toBeTruthy()
    expect(screen.getByText('1 mes gratis en ICADEMY')).toBeTruthy()
    expect(screen.getByText('Insignia oficial de ICAwards')).toBeTruthy()
  })
})
