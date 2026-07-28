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

  it('hides ICA Test column before official window day in current month', async () => {
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

    render(<LeaderboardView />)

    await waitFor(() => {
      expect(fetchMonthlyStreakLeaderboardMock).toHaveBeenCalled()
    })

    expect(screen.queryByText('ICA Test')).toBeNull()
  })

  it('shows ICA Test column on or after official window day in current month', async () => {
    getIcaTestWindowStartDayMock.mockReturnValue(1)
    fetchMonthlyStreakLeaderboardMock.mockResolvedValue([
      {
        rank: 1,
        user_id: 'user-1',
        username: 'ana',
        display_name: 'Ana',
        ica_streak_days: 6,
        avg_percent: 85,
        ica_test_points: 1.3,
        total_points: 9.8,
      },
    ])

    render(<LeaderboardView />)

    await waitFor(() => {
      expect(screen.getByText('ICA Test')).toBeTruthy()
      expect(screen.getByText('Puntuación total')).toBeTruthy()
      expect(screen.getByText('1.3')).toBeTruthy()
      expect(screen.getByText('9.8')).toBeTruthy()
    })
  })

  it('shows ICA Test column in historic snapshot only when snapshot has ICA points key', async () => {
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
            ica_test_points: 0,
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

    expect(screen.queryByText('ICA Test')).toBeNull()

    fireEvent.change(screen.getByLabelText('Selecciona mes'), {
      target: { value: '2026-05-01' },
    })

    await waitFor(() => {
      expect(fetchMonthlySnapshotLeaderboardMock).toHaveBeenCalledWith(
        '2026-05-01',
        33,
      )
      expect(screen.getByText('ICA Test')).toBeTruthy()
      expect(screen.getByText('0.0')).toBeTruthy()
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
      screen.getByText('🥇 El icademer que termine top1 ganará el día 28 del mes:'),
    ).toBeTruthy()
    expect(screen.getByText('Clase 1:1 con Luis [1h]')).toBeTruthy()
    expect(screen.getByText('1 mes gratis en ICADEMY')).toBeTruthy()
    expect(screen.getByText('Insignia oficial de ICAwards')).toBeTruthy()
  })
})
