import { useEffect } from 'react'
import { playBadgeSound, type BadgeSoundTier } from './sfx'

/**
 * Hace sonar una insignia mientras se está viendo: suena al aparecer (o al cambiar de
 * rango) y se para al cerrarla. Con `tier` en null no suena nada.
 */
export function useBadgeSound(tier: BadgeSoundTier | null, options: { locked?: boolean } = {}): void {
  const locked = Boolean(options.locked)
  useEffect(() => {
    if (!tier) return
    const stop = playBadgeSound(tier, { locked })
    return () => stop()
  }, [tier, locked])
}
