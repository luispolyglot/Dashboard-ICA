import { useAuth } from '@/auth/AuthContext'
import { useDashboardContext } from '../context/DashboardContext'
import { peekMetaTrackerProfile } from '../services/metaTracker'
import type { AppConfig, MetaTrackerProfile } from '../types'

/**
 * Tu nivel real mientras carga: el último que se vio (guardado en el navegador). Así la
 * barrita sale al momento con tu nivel y se pone al día sola, sin bloque gris parpadeando.
 * `loading` solo es true la primera vez (cuando aún no hay nada guardado).
 */
export function useLevelProfile(config: AppConfig): { profile: MetaTrackerProfile | null; loading: boolean } {
  const { metaTrackerProfile, metaTrackerLoading } = useDashboardContext()
  const { user } = useAuth()
  if (!metaTrackerLoading) return { profile: metaTrackerProfile, loading: false }
  const cached = peekMetaTrackerProfile(user?.id, config.targetLang, config.nativeLang)
  return cached === undefined ? { profile: null, loading: true } : { profile: cached, loading: false }
}
