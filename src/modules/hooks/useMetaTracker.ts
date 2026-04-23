import { useCallback, useEffect, useState } from 'react'
import {
  loadMetaTrackerProfile,
  saveMetaTrackerProfile,
} from '../services/metaTracker'
import type { AppConfig, MetaTrackerProfile, MetaTrackerStartLevel } from '../types'

type SaveMetaTrackerParams = {
  startLevel: MetaTrackerStartLevel
  priorIcaWords: number
}

export function useMetaTracker(config: AppConfig | null) {
  const [profile, setProfile] = useState<MetaTrackerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    if (!config) {
      setProfile(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const next = await loadMetaTrackerProfile(config.targetLang, config.nativeLang)
    setProfile(next)
    setLoading(false)
  }, [config])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(
    async (params: SaveMetaTrackerParams): Promise<MetaTrackerProfile | null> => {
      if (!config) return null
      setSaving(true)
      try {
        const saved = await saveMetaTrackerProfile(config.targetLang, config.nativeLang, {
          startLevel: params.startLevel,
          priorIcaWords: params.priorIcaWords,
          confirmedAt: Date.now(),
        })
        setProfile(saved)
        return saved
      } finally {
        setSaving(false)
      }
    },
    [config],
  )

  return {
    profile,
    loading,
    saving,
    save,
    refresh,
  }
}
