import { create } from 'zustand'
import {
  DEFAULT_FEATURE_FLAGS,
  type FeatureFlagKey,
  type FeatureFlagState,
} from '../featureFlags/domain'
import { fetchFeatureFlags } from '../services/featureFlags'
import { peekQuick, storeQuick } from '../services/quickCache'

// Las funciones activadas son iguales para todos: se guarda la última lista para que,
// al recargar, las tarjetas que dependen de ella (p. ej. «Nota desafiante») salgan al
// momento, a la vez que el resto. La lista nueva llega por detrás.
const FLAGS_CACHE_KEY = 'feature-flags'

function initialFlags(): FeatureFlagState {
  const saved = typeof window === 'undefined' ? undefined : peekQuick<Partial<FeatureFlagState>>(FLAGS_CACHE_KEY)
  return { ...DEFAULT_FEATURE_FLAGS, ...(saved || {}) }
}

type FeatureFlagsLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

type FeatureFlagsStore = {
  flags: FeatureFlagState
  status: FeatureFlagsLoadStatus
  error: string | null
  lastLoadedAt: number | null
  loadFlags: (options?: { force?: boolean }) => Promise<void>
  isEnabled: (key: FeatureFlagKey) => boolean
}

export const useFeatureFlagsStore = create<FeatureFlagsStore>((set, get) => ({
  flags: initialFlags(),
  status: 'idle',
  error: null,
  lastLoadedAt: null,
  loadFlags: async (options) => {
    const force = Boolean(options?.force)
    const state = get()

    if (state.status === 'loading') return
    if (!force && state.status === 'ready') return

    set({ status: 'loading', error: null })

    try {
      const flags = await fetchFeatureFlags()
      storeQuick(FLAGS_CACHE_KEY, flags)
      set({
        flags,
        status: 'ready',
        error: null,
        lastLoadedAt: Date.now(),
      })
    } catch (error) {
      set({
        // Se queda con la última lista conocida (así no desaparece nada de golpe).
        flags: get().flags,
        status: 'error',
        error: error instanceof Error ? error.message : 'No se pudieron cargar los feature flags.',
      })
    }
  },
  isEnabled: (key) => Boolean(get().flags[key]),
}))
