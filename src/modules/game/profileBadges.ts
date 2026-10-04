import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { peekQuick, storeQuick } from '../services/quickCache'
import { t } from '@/i18n'
import type { FeaturedBadge } from './featuredBadge'
import { parseFeaturedBadge, serializeFeaturedBadge } from './featuredBadge'
import { ACHIEVEMENT_CATALOG } from './achievements'
import type { MedalCategory } from './medals'

// PROFILE BADGES (Luis, 4 Oct): each student picks up to 3 earned badges that other students see
// when they open their profile. With no choice, the profile shows the 3 best ones automatically.
// The server validates that every badge is earned (set_my_profile_badges).

export const PROFILE_BADGES_MAX = 3

const CHANGED_EVENT = 'ica:profile-badges-changed'
const CACHE_PREFIX = 'profile-badges:'

const sameBadge = (a: FeaturedBadge, b: FeaturedBadge) => a.category === b.category && a.tier === b.tier

function parseList(value: unknown): FeaturedBadge[] {
  if (!Array.isArray(value)) return []
  return value.map(parseFeaturedBadge).filter((badge): badge is FeaturedBadge => badge !== null).slice(0, PROFILE_BADGES_MAX)
}

/** Badges a student chose for their profile (empty = automatic). */
export async function fetchProfileBadges(userId: string): Promise<FeaturedBadge[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_profile_badges', { p_user_id: userId })
  if (error) throw error
  return parseList(data)
}

/**
 * The 3 badges shown when nobody chose: the highest level of each category, best first
 * (on a tie, catalog order).
 */
export function pickTopBadges(earned: Record<MedalCategory, number>, max = PROFILE_BADGES_MAX): FeaturedBadge[] {
  return ACHIEVEMENT_CATALOG.filter((def) => earned[def.key] > 0)
    .map((def, order) => ({ def, order, level: earned[def.key] }))
    .sort((a, b) => b.level - a.level || a.order - b.order)
    .slice(0, max)
    .map(({ def, level }) => ({ category: def.key, tier: def.levels[level - 1].tier }))
}

/** Your own profile badges, to add or remove them from the badge window. */
export function useMyProfileBadges(userId: string | null | undefined) {
  const [badges, setBadges] = useState<FeaturedBadge[]>(() =>
    userId ? peekQuick<FeaturedBadge[]>(`${CACHE_PREFIX}${userId}`) ?? [] : [],
  )

  const refresh = useCallback(async () => {
    if (!userId) {
      setBadges([])
      return []
    }
    const next = await fetchProfileBadges(userId)
    setBadges(next)
    storeQuick(`${CACHE_PREFIX}${userId}`, next)
    return next
  }, [userId])

  useEffect(() => {
    setBadges(userId ? peekQuick<FeaturedBadge[]>(`${CACHE_PREFIX}${userId}`) ?? [] : [])
    void refresh().catch(() => undefined)
    const onChange = () => {
      void refresh().catch(() => undefined)
    }
    window.addEventListener(CHANGED_EVENT, onChange)
    return () => window.removeEventListener(CHANGED_EVENT, onChange)
  }, [refresh, userId])

  const save = useCallback(
    async (next: FeaturedBadge[]) => {
      if (!supabase || !userId) return false
      const { error } = await supabase.rpc('set_my_profile_badges', {
        p_badges: next.map(serializeFeaturedBadge),
      })
      if (error) {
        toast.error(
          error.message.includes('PROFILE_BADGE_NOT_EARNED')
            ? t('Aún no has conseguido esa insignia.')
            : t('No se pudieron guardar las insignias de tu perfil.'),
        )
        return false
      }
      setBadges(next)
      storeQuick(`${CACHE_PREFIX}${userId}`, next)
      window.dispatchEvent(new Event(CHANGED_EVENT))
      return true
    },
    [userId],
  )

  const includes = useCallback((badge: FeaturedBadge) => badges.some((item) => sameBadge(item, badge)), [badges])

  /** Adds the badge (if there is room) or removes it. */
  const toggle = useCallback(
    async (badge: FeaturedBadge) => {
      if (badges.some((item) => sameBadge(item, badge))) {
        return save(badges.filter((item) => !sameBadge(item, badge)))
      }
      if (badges.length >= PROFILE_BADGES_MAX) {
        toast(t('Ya tienes 3 insignias en tu perfil. Quita una para poner esta.'))
        return false
      }
      return save([...badges, badge])
    },
    [badges, save],
  )

  return { badges, includes, toggle, refresh }
}
