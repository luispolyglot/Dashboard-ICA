import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userId: 'alumno-1',
  fetchMyCoachingDashboard: vi.fn(),
}))

vi.mock('../../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: mocks.userId },
    loading: false,
    hasSupabaseConfig: true,
    isPasswordRecovery: false,
  }),
}))
vi.mock('@/modules/context/DashboardContext', () => ({
  useDashboardContext: () => ({ loading: false }),
}))
vi.mock('@/modules/services/coaching', () => ({
  fetchMyCoachingDashboard: mocks.fetchMyCoachingDashboard,
  checkCoachingAdminAccess: vi.fn(),
}))
vi.mock('@/modules/services/adminAnalytics', () => ({
  checkAdminAccess: vi.fn(),
  checkSuperAdminAccess: vi.fn(),
}))

import { CoachingMemberRoute } from '../../../src/router/RouteGuards'

function renderCoaching() {
  return render(
    <MemoryRouter initialEntries={['/coaching']}>
      <Routes>
        <Route element={<CoachingMemberRoute />}>
          <Route path='/coaching' element={<p>Pantalla de coaching</p>} />
        </Route>
        <Route path='/' element={<p>Inicio</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => cleanup())

describe('Guardas de ruta · coaching', () => {
  it('la primera vez comprueba el acceso y la segunda entra al momento', async () => {
    mocks.userId = 'alumno-1'
    let resolveCheck: (rows: unknown[]) => void = () => {}
    mocks.fetchMyCoachingDashboard.mockImplementation(
      () => new Promise((resolve) => (resolveCheck = resolve)),
    )

    const first = renderCoaching()
    // Mientras comprueba: esqueleto dentro de la página, no pantalla completa.
    expect(screen.getByText('Verificando acceso a coaching...')).toBeTruthy()
    expect(screen.queryByText('Pantalla de coaching')).toBeNull()

    resolveCheck([{ id: 'membresia-1' }])
    expect(await screen.findByText('Pantalla de coaching')).toBeTruthy()
    first.unmount()

    // Segunda visita: se ve directamente (la comprobación se repite por detrás).
    mocks.fetchMyCoachingDashboard.mockResolvedValue([{ id: 'membresia-1' }])
    renderCoaching()
    expect(screen.getByText('Pantalla de coaching')).toBeTruthy()
    expect(screen.queryByText('Verificando acceso a coaching...')).toBeNull()
  })

  it('si al comprobar por detrás ya no tiene acceso, lo manda a inicio', async () => {
    mocks.userId = 'alumno-1'
    mocks.fetchMyCoachingDashboard.mockResolvedValue([])
    renderCoaching()
    expect(await screen.findByText('Inicio')).toBeTruthy()
  })

  it('sin coaching no entra', async () => {
    mocks.userId = 'alumno-2'
    mocks.fetchMyCoachingDashboard.mockResolvedValue([])
    renderCoaching()
    expect(await screen.findByText('Inicio')).toBeTruthy()
  })
})
