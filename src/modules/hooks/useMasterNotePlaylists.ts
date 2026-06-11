import { useCallback, useMemo, useState } from 'react'
import type { MasterNotePlaylist, MasterNotePlaylistItem } from '../types'
import {
  createMasterNotePlaylist,
  deleteMasterNotePlaylist,
  fetchMasterNotePlaylistsBundle,
  renameMasterNotePlaylist,
  replaceMasterNotePlaylistItems,
} from '../services/masterNotePlaylists'

type UseMasterNotePlaylistsParams = {
  targetLang?: string
  nativeLang?: string
}

export function useMasterNotePlaylists({
  targetLang,
  nativeLang,
}: UseMasterNotePlaylistsParams) {
  const [playlists, setPlaylists] = useState<MasterNotePlaylist[]>([])
  const [items, setItems] = useState<MasterNotePlaylistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const itemsByPlaylistId = useMemo(() => {
    const map = new Map<string, MasterNotePlaylistItem[]>()

    for (const item of items) {
      const list = map.get(item.playlist_id) || []
      list.push(item)
      map.set(item.playlist_id, list)
    }

    for (const [playlistId, list] of map.entries()) {
      list.sort((a, b) => {
        if (a.sort_order === b.sort_order) {
          const aTime = new Date(a.created_at || 0).getTime()
          const bTime = new Date(b.created_at || 0).getTime()
          if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
          if (Number.isNaN(aTime)) return 1
          if (Number.isNaN(bTime)) return -1
          return aTime - bTime
        }
        return a.sort_order - b.sort_order
      })

      map.set(playlistId, list)
    }

    return map
  }, [items])

  const refresh = useCallback(async () => {
    setLoading(true)

    try {
      const bundle = await fetchMasterNotePlaylistsBundle(targetLang, nativeLang)
      setPlaylists(bundle.playlists)
      setItems(bundle.items)
      setError(null)
    } catch {
      setError('No se pudieron cargar las listas de reproducción')
    } finally {
      setLoading(false)
    }
  }, [nativeLang, targetLang])

  const createPlaylist = useCallback(async (name: string) => {
    await createMasterNotePlaylist({
      name,
      targetLang: targetLang || null,
      nativeLang: nativeLang || null,
    })
    await refresh()
  }, [nativeLang, refresh, targetLang])

  const renamePlaylist = useCallback(async (playlistId: string, nextName: string) => {
    await renameMasterNotePlaylist(playlistId, nextName)
    await refresh()
  }, [refresh])

  const deletePlaylist = useCallback(async (playlistId: string) => {
    await deleteMasterNotePlaylist(playlistId)
    await refresh()
  }, [refresh])

  const replacePlaylistItems = useCallback(async (playlistId: string, noteIdsInOrder: string[]) => {
    await replaceMasterNotePlaylistItems(playlistId, noteIdsInOrder)
    await refresh()
  }, [refresh])

  return {
    playlists,
    items,
    itemsByPlaylistId,
    loading,
    error,
    refresh,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    replacePlaylistItems,
    clearError: () => setError(null),
  }
}
