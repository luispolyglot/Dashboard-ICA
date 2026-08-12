import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OFFLINE_SAFE_LAST_PATH_STORAGE_KEY, OFFLINE_SAFE_ROUTE_TRIGGER_EVENT } from '@/modules/offline/events'
import { DASHBOARD_ROUTES } from '@/modules/routes/paths'

const navigateMock = vi.fn()
const locationMock = {
  pathname: '/master-notes',
  search: '',
  hash: '',
}
const useDashboardContextMock = vi.fn()

vi.mock('react-router-dom', () => ({
  Outlet: () => null,
  useNavigate: () => navigateMock,
  useLocation: () => locationMock,
}))

vi.mock('@/modules/context/DashboardContext', () => ({
  useDashboardContext: () => useDashboardContextMock(),
}))

vi.mock('@/modules/hooks/useIcaTestsOverview', () => ({
  useIcaTestsOverview: () => ({ canHighlightCurrentMonth: false }),
}))

vi.mock('@/modules/components/Header', () => ({ Header: () => null }))
vi.mock('@/modules/components/IcaTestsAvailableModal', () => ({ IcaTestsAvailableModal: () => null }))
vi.mock('@/modules/components/LangEditModal', () => ({ LangEditModal: () => null }))
vi.mock('@/modules/components/MobileBottomNav', () => ({ MobileBottomNav: () => null }))
vi.mock('@/modules/views/LanguageSetup', () => ({ LanguageSetup: () => null }))
vi.mock('@/components/ui/fullscreen-loading', () => ({ FullscreenLoading: () => null }))

vi.mock('@/modules/services/coaching', () => ({
  fetchCoachingPendingReviewSummary: vi.fn(async () => ({ hasPendingReviews: false })),
}))

vi.mock('@/modules/services/calendarIcademy', () => ({
  fetchCalendarIcademyEntries: vi.fn(async () => []),
}))

vi.mock('@/modules/services/calendarIcademyPreferences', () => ({
  fetchCalendarIcademyPreferences: vi.fn(async () => []),
  markCalendarIcademyNotificationShown: vi.fn(async () => null),
}))

vi.mock('@/modules/services/calendarIcademySessionBlacklist', () => ({
  fetchCalendarIcademySessionBlacklist: vi.fn(async () => []),
}))

vi.mock('@/modules/services/calendarIcademyReminders', () => ({
  buildCalendarIcademyReminders: vi.fn(() => []),
}))

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
  },
}))

import { DashboardLayout } from '@/modules/layout/DashboardLayout'

describe('DashboardLayout offline-safe redirect', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    locationMock.pathname = '/master-notes'
    locationMock.search = ''
    locationMock.hash = ''

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    })

    window.sessionStorage.removeItem(OFFLINE_SAFE_LAST_PATH_STORAGE_KEY)

    useDashboardContextMock.mockReturnValue({
      config: { targetLang: 'Inglés', nativeLang: 'Español' },
      cards: [],
      loading: false,
      showLangModal: false,
      setShowLangModal: vi.fn(),
      dailyProgress: {},
      handleSetup: vi.fn(),
      handleConfigChange: vi.fn(),
    })
  })

  it('navigates to offline-safe when network-unreachable event is fired', async () => {
    locationMock.pathname = '/phrase-history'
    locationMock.search = '?tab=all'
    locationMock.hash = '#latest'

    render(<DashboardLayout />)

    act(() => {
      window.dispatchEvent(new CustomEvent(OFFLINE_SAFE_ROUTE_TRIGGER_EVENT))
    })

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(DASHBOARD_ROUTES.offlineSafe, {
        replace: true,
      })
    })

    expect(window.sessionStorage.getItem(OFFLINE_SAFE_LAST_PATH_STORAGE_KEY)).toBe(
      '/phrase-history?tab=all#latest',
    )
  })

  it('does not redirect when already on offline-safe route', async () => {
    locationMock.pathname = DASHBOARD_ROUTES.offlineSafe

    render(<DashboardLayout />)

    act(() => {
      window.dispatchEvent(new CustomEvent(OFFLINE_SAFE_ROUTE_TRIGGER_EVENT))
    })

    await waitFor(() => {
      expect(navigateMock).not.toHaveBeenCalled()
    })

    expect(window.sessionStorage.getItem(OFFLINE_SAFE_LAST_PATH_STORAGE_KEY)).toBeNull()
  })

  it('redirects immediately when app starts offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    locationMock.pathname = '/leaderboard'
    locationMock.search = '?month=current'

    render(<DashboardLayout />)

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(DASHBOARD_ROUTES.offlineSafe, {
        replace: true,
      })
    })

    expect(window.sessionStorage.getItem(OFFLINE_SAFE_LAST_PATH_STORAGE_KEY)).toBe(
      '/leaderboard?month=current',
    )
  })
})
