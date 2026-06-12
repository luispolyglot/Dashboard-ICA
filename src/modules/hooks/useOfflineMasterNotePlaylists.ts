import { useCallback, useMemo, useState } from 'react'
import {
  listOfflineMasterNotePlaylistItems,
  listOfflineMasterNotePlaylists,
  type OfflineMasterNotePlaylist,
  type OfflineMasterNotePlaylistItem,
} from '../services/masterNotesOfflineStore'
import { buildPlaylistItemsByPlaylistId } from '../services/masterNotePlaylistItems'

type UseOfflineMasterNotePlaylistsParams = {
  targetLang?: string
  nativeLang?: string
}

export function useOfflineMasterNotePlaylists({
  targetLang,
  nativeLang,
}: UseOfflineMasterNotePlaylistsParams = {}) {
  const [playlists, setPlaylists] = useState<OfflineMasterNotePlaylist[]>([])
  const [items, setItems] = useState<OfflineMasterNotePlaylistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const itemsByPlaylistId = useMemo(() => {
    return buildPlaylistItemsByPlaylistId({
      items,
      getPlaylistId: (item) => item.playlistId,
      getSortOrder: (item) => item.sortOrder,
      getCreatedAt: (item) => item.createdAt,
    })
  }, [items])

  const refresh = useCallback(async () => {
    setLoading(true)

    try {
      const [playlistRows, itemRows] = await Promise.all([
        listOfflineMasterNotePlaylists(targetLang, nativeLang),
        listOfflineMasterNotePlaylistItems(),
      ])

      const playlistIds = new Set(playlistRows.map((playlist) => playlist.id))

      setPlaylists(playlistRows)
      setItems(itemRows.filter((item) => playlistIds.has(item.playlistId)))
      setError(null)
    } catch {
      setError('No se pudieron cargar las listas offline')
    } finally {
      setLoading(false)
    }
  }, [nativeLang, targetLang])

  return {
    playlists,
    items,
    itemsByPlaylistId,
    loading,
    error,
    refresh,
    clearError: () => setError(null),
  }
}
