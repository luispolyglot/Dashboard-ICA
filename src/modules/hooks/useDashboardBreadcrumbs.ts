import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { DASHBOARD_LABELS } from '../routes/paths'

type BreadcrumbItem = {
  href: string
  label: string
  current: boolean
}

export function useDashboardBreadcrumbs(): BreadcrumbItem[] {
  const location = useLocation()

  return useMemo(() => {
    const path = location.pathname

    if (path === '/') {
      return [{ href: '/', label: '✦ Dashboard ICA', current: true }]
    }

    const label = DASHBOARD_LABELS[path] || path
    return [
      { href: '/', label: DASHBOARD_LABELS['/'], current: false },
      { href: path, label, current: true },
    ]
  }, [location.pathname])
}
