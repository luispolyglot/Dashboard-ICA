import { useCallback, useEffect, useState } from 'react'
import type { MedalCategory, MedalTier } from './medals'
import { TIER_ORDER } from './medals'

// INSIGNIA DESTACADA: cada alumno elige UNA insignia conseguida para que salga junto
// a su nombre (perfil y ranking).
// Vista previa: se guarda en este dispositivo. Para que la vean los demás, el servidor
// tiene que guardarla (p. ej. columna profiles.featured_badge) y devolverla en el ranking.

export type FeaturedBadge = { category: MedalCategory; tier: MedalTier }

const KEY_PREFIX = 'ica-featured-badge-v1:'
const CHANGED_EVENT = 'ica:featured-badge-changed'
const CATEGORIES: MedalCategory[] = ['rachaICA', 'rachaFlash', 'ranking', 'eficacia', 'vocab', 'desafios']

/** Convierte "rachaICA:oro" (formato del servidor) en insignia. */
export function parseFeaturedBadge(value: unknown): FeaturedBadge | null {
  if (typeof value !== 'string') return null
  const [category, tier] = value.split(':')
  if (!CATEGORIES.includes(category as MedalCategory)) return null
  if (!TIER_ORDER.includes(tier as MedalTier)) return null
  return { category: category as MedalCategory, tier: tier as MedalTier }
}

export function serializeFeaturedBadge(badge: FeaturedBadge): string {
  return `${badge.category}:${badge.tier}`
}

function read(userId: string | null | undefined): FeaturedBadge | null {
  try {
    return parseFeaturedBadge(window.localStorage.getItem(`${KEY_PREFIX}${userId || 'anon'}`))
  } catch {
    return null
  }
}

export function useFeaturedBadge(userId: string | null | undefined) {
  const [badge, setBadge] = useState<FeaturedBadge | null>(() => read(userId))

  useEffect(() => {
    setBadge(read(userId))
    const onChange = () => setBadge(read(userId))
    window.addEventListener(CHANGED_EVENT, onChange)
    return () => window.removeEventListener(CHANGED_EVENT, onChange)
  }, [userId])

  const choose = useCallback(
    (next: FeaturedBadge | null) => {
      try {
        const key = `${KEY_PREFIX}${userId || 'anon'}`
        if (next) window.localStorage.setItem(key, serializeFeaturedBadge(next))
        else window.localStorage.removeItem(key)
      } catch {
        // Sin almacenamiento: dura hasta recargar.
      }
      setBadge(next)
      window.dispatchEvent(new Event(CHANGED_EVENT))
    },
    [userId],
  )

  return { badge, choose }
}
