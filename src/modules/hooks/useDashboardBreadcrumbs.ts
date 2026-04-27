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

    const exactLabel = DASHBOARD_LABELS[path]
    const dynamicLabel = exactLabel
      ? null
      : Object.entries(DASHBOARD_LABELS)
          .sort((a, b) => b[0].length - a[0].length)
          .find(([basePath]) => path.startsWith(`${basePath}/`))?.[1]

    const label = exactLabel || dynamicLabel || path
    return [
      { href: '/', label: DASHBOARD_LABELS['/'], current: false },
      { href: path, label, current: true },
    ]
  }, [location.pathname])
}
