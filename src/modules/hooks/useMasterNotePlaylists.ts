import { useCallback, useMemo, useState } from 'react'
import type { MasterNotePlaylist, MasterNotePlaylistItem } from '../types'
import {
  createMasterNotePlaylist,
  deleteMasterNotePlaylist,
  fetchMasterNotePlaylistsBundle,
  renameMasterNotePlaylist,
  replaceMasterNotePlaylistItems,
} from '../services/masterNotePlaylists'
import { buildPlaylistItemsByPlaylistId } from '../services/masterNotePlaylistItems'

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
    return buildPlaylistItemsByPlaylistId({
      items,
      getPlaylistId: (item) => item.playlist_id,
      getSortOrder: (item) => item.sort_order,
      getCreatedAt: (item) => item.created_at,
    })
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
