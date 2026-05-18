import { useEffect, useState } from 'react'

type VersionPayload = {
  buildId?: string
}

export function useVersionCheck(intervalMs = 60_000): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV) return

    let mounted = true

    const checkVersion = async (): Promise<void> => {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
        })
        if (!response.ok) return
        const payload = (await response.json()) as VersionPayload
        if (!mounted) return
        if (payload.buildId && payload.buildId !== __APP_BUILD_ID__) {
          setUpdateAvailable(true)
        }
      } catch {
        // no-op
      }
    }

    void checkVersion()
    const timerId = window.setInterval(() => {
      void checkVersion()
    }, intervalMs)

    return () => {
      mounted = false
      window.clearInterval(timerId)
    }
  }, [intervalMs])

  return updateAvailable
}
