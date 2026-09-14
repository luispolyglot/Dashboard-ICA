import { create } from 'zustand'
import {
  DEFAULT_FEATURE_FLAGS,
  type FeatureFlagKey,
  type FeatureFlagState,
} from '../featureFlags/domain'
import { fetchFeatureFlags } from '../services/featureFlags'

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
  flags: { ...DEFAULT_FEATURE_FLAGS },
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
      set({
        flags,
        status: 'ready',
        error: null,
        lastLoadedAt: Date.now(),
      })
    } catch (error) {
      set({
        flags: { ...DEFAULT_FEATURE_FLAGS },
        status: 'error',
        error: error instanceof Error ? error.message : 'No se pudieron cargar los feature flags.',
      })
    }
  },
  isEnabled: (key) => Boolean(get().flags[key]),
}))
