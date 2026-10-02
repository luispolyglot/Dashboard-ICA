import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@/auth/AuthContext'
import { peekQuick, storeQuick } from '../services/quickCache'

export type ClosedMasterNote = {
  id: string
  name: string
  closedAt: string | null
  totalDurationMs: number
}

// Lo último que se cargó (por persona e idioma), guardado también en el navegador: así, al
// recargar, la tarjeta sale ya con su estado (abierta o con candado) y no cambia de golpe.
const quickKey = (key: string) => `closed-notes:${key}`

/** Notas maestras terminadas (cerradas) del idioma activo. Solo lectura. */
export function useClosedMasterNotes(targetLang?: string, nativeLang?: string) {
  const { user } = useAuth()
  const userId = user?.id ?? 'anon'
  const cacheKey = `${userId}|${targetLang || ''}|${nativeLang || ''}`
  const [notes, setNotes] = useState<ClosedMasterNote[] | null>(() => peekQuick<ClosedMasterNote[]>(quickKey(cacheKey)) ?? null)

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!supabase || !targetLang) return
      let query = supabase
        .from('master_notes')
        .select('id, name, closed_at, total_duration_ms')
        .eq('state', 'closed')
        .eq('target_lang', targetLang)
        .order('closed_at', { ascending: false })
      if (nativeLang) query = query.eq('native_lang', nativeLang)
      const { data, error } = await query
      if (!active || error) return
      const next = (data || []).map((row) => ({
        id: String(row.id),
        name: String(row.name || 'Nota maestra'),
        closedAt: (row.closed_at as string | null) ?? null,
        totalDurationMs: Number(row.total_duration_ms || 0),
      }))
      storeQuick(quickKey(cacheKey), next)
      setNotes(next)
    }
    void load()
    return () => {
      active = false
    }
  }, [cacheKey, nativeLang, targetLang])

  return { notes, count: notes?.length ?? null }
}
