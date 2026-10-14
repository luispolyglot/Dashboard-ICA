import { useCallback, useEffect, useState } from 'react'
import type { MedalCategory, MedalTier } from './medals'
import { TIER_ORDER } from './medals'
import { supabase } from '../../lib/supabase'
import { peekQuick, storeQuick } from '../services/quickCache'
import { toast } from 'sonner'
import { t } from '@/i18n'

// INSIGNIA DESTACADA: cada alumno elige UNA insignia conseguida para que salga junto
// a su nombre (perfil y ranking).
// El servidor guarda la selección y valida que el alumno haya conseguido la insignia.

export type FeaturedBadge = { category: MedalCategory; tier: MedalTier }

const CHANGED_EVENT = 'ica:featured-badge-changed'
const CACHE_PREFIX = 'featured-badge:'
const CATEGORIES: MedalCategory[] = ['rachaICA', 'rachaFlash', 'ranking', 'eficacia', 'vocab', 'desafios', 'coaching']

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

export function useFeaturedBadge(userId: string | null | undefined) {
  const [badge, setBadge] = useState<FeaturedBadge | null>(() =>
    userId ? peekQuick<FeaturedBadge | null>(`${CACHE_PREFIX}${userId}`) ?? null : null,
  )
  // True once we know for sure (from the cache or the server) whether there is one, so a screen
  // can ask «¿destacas una?» without flashing it to someone who already has one.
  const [loaded, setLoaded] = useState(() =>
    userId ? peekQuick<FeaturedBadge | null>(`${CACHE_PREFIX}${userId}`) !== undefined : false,
  )

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setBadge(null)
      return null
    }
    const { data, error } = await supabase
      .from('ica_featured_badges')
      .select('badge')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    const next = parseFeaturedBadge(data?.badge)
    setBadge(next)
    setLoaded(true)
    storeQuick(`${CACHE_PREFIX}${userId}`, next)
    return next
  }, [userId])

  useEffect(() => {
    const cached = userId ? peekQuick<FeaturedBadge | null>(`${CACHE_PREFIX}${userId}`) : undefined
    setBadge(cached ?? null)
    setLoaded(cached !== undefined)
    void refresh().catch(() => undefined)
    const onChange = () => { void refresh().catch(() => undefined) }
    window.addEventListener(CHANGED_EVENT, onChange)
    return () => window.removeEventListener(CHANGED_EVENT, onChange)
  }, [refresh, userId])

  const choose = useCallback(
    async (next: FeaturedBadge | null): Promise<boolean> => {
      if (!supabase || !userId) return false
      const { error } = await supabase.rpc('set_my_featured_badge', {
        p_badge: next ? serializeFeaturedBadge(next) : null,
      })
      if (error) {
        toast.error(error.message.includes('FEATURED_BADGE_NOT_EARNED')
          ? t('Aún no has conseguido esa insignia.')
          : t('No se pudo guardar la insignia destacada.'))
        return false
      }
      setBadge(next)
      storeQuick(`${CACHE_PREFIX}${userId}`, next)
      window.dispatchEvent(new Event(CHANGED_EVENT))
      return true
    },
    [userId],
  )

  return { badge, loaded, choose, refresh }
}
