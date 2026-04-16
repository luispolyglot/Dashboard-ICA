import { createContext, useContext } from 'react'
import type { PropsWithChildren } from 'react'
import { useDashboardICA } from '../hooks/useDashboardICA'

type DashboardContextValue = ReturnType<typeof useDashboardICA>

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({ children }: PropsWithChildren) {
  const value = useDashboardICA()
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboardContext() {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error('useDashboardContext debe usarse dentro de DashboardProvider')
  }

  return context
}
