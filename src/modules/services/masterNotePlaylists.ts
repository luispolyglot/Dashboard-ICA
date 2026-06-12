import { supabase } from '@/lib/supabase'
import { getSessionWithTimeout } from '@/lib/supabaseAuthSafe'
import {
  syncMasterNotePlaylistsOfflineSnapshot,
} from './masterNotesOfflineStore'
import type { MasterNotePlaylist, MasterNotePlaylistItem } from '../types'

type MasterNotePlaylistRow = {
  id: string
  name: string
  target_lang: string | null
  native_lang: string | null
  created_at: string
  updated_at: string
}

type MasterNotePlaylistItemRow = {
  id: string
  playlist_id: string
  master_note_id: string
  sort_order: number
  created_at: string
}

export type MasterNotePlaylistBundle = {
  playlists: MasterNotePlaylist[]
  items: MasterNotePlaylistItem[]
}

async function getCurrentUserId(): Promise<string | null> {
  const session = await getSessionWithTimeout()
  return session?.user?.id || null
}

function mapPlaylistRow(row: MasterNotePlaylistRow): MasterNotePlaylist {
  return {
    id: row.id,
    name: row.name,
    target_lang: row.target_lang,
    native_lang: row.native_lang,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function mapPlaylistItemRow(row: MasterNotePlaylistItemRow): MasterNotePlaylistItem {
  return {
    id: row.id,
    playlist_id: row.playlist_id,
    master_note_id: row.master_note_id,
    sort_order: row.sort_order,
    created_at: row.created_at,
  }
}

async function fetchPlaylistItemsByPlaylistIds(
  playlistIds: string[],
): Promise<MasterNotePlaylistItem[]> {
  if (!supabase || playlistIds.length === 0) return []

  const { data, error } = await supabase
    .from('master_note_playlist_items')
    .select('id, playlist_id, master_note_id, sort_order, created_at')
    .in('playlist_id', playlistIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []).map((row) => mapPlaylistItemRow(row as MasterNotePlaylistItemRow))
}

export async function fetchMasterNotePlaylistsBundle(
  targetLang?: string,
  nativeLang?: string,
): Promise<MasterNotePlaylistBundle> {
  if (!supabase) return { playlists: [], items: [] }

  const userId = await getCurrentUserId()
  if (!userId) return { playlists: [], items: [] }

  let query = supabase
    .from('master_note_playlists')
    .select('id, name, target_lang, native_lang, created_at, updated_at')
    .order('updated_at', { ascending: false })

  if (targetLang) {
    query = query.eq('target_lang', targetLang)
  }
  if (nativeLang) {
    query = query.eq('native_lang', nativeLang)
  }

  const { data, error } = await query
  if (error) throw error

  const playlists = (data || []).map((row) => mapPlaylistRow(row as MasterNotePlaylistRow))
  const items = await fetchPlaylistItemsByPlaylistIds(playlists.map((playlist) => playlist.id))

  void syncMasterNotePlaylistsOfflineSnapshot(playlists, items, targetLang, nativeLang).catch(() => {})

  return { playlists, items }
}

export async function createMasterNotePlaylist(input: {
  name: string
  targetLang?: string | null
  nativeLang?: string | null
}): Promise<MasterNotePlaylist> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Debes iniciar sesión')

  const normalizedName = input.name.trim()
  if (!normalizedName) {
    throw new Error('El nombre de la lista no puede estar vacío')
  }

  const targetLang = input.targetLang || null
  const nativeLang = input.nativeLang || null

  const { data, error } = await supabase
    .from('master_note_playlists')
    .insert({
      user_id: userId,
      name: normalizedName,
      target_lang: targetLang,
      native_lang: nativeLang,
    })
    .select('id, name, target_lang, native_lang, created_at, updated_at')
    .single()

  if (error || !data) {
    throw error || new Error('No se pudo crear la lista de reproducción')
  }

  return mapPlaylistRow(data as MasterNotePlaylistRow)
}

export async function renameMasterNotePlaylist(
  playlistId: string,
  nextName: string,
): Promise<void> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const normalizedName = nextName.trim()
  if (!normalizedName) {
    throw new Error('El nombre de la lista no puede estar vacío')
  }

  const { error } = await supabase
    .from('master_note_playlists')
    .update({ name: normalizedName })
    .eq('id', playlistId)

  if (error) throw error
}

export async function deleteMasterNotePlaylist(
  playlistId: string,
): Promise<void> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const { error } = await supabase
    .from('master_note_playlists')
    .delete()
    .eq('id', playlistId)

  if (error) throw error
}

export async function replaceMasterNotePlaylistItems(
  playlistId: string,
  masterNoteIdsInOrder: string[],
): Promise<void> {
  if (!supabase) throw new Error('Falta configurar Supabase')

  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Debes iniciar sesión')

  const dedupedNoteIds = Array.from(new Set(masterNoteIdsInOrder.filter(Boolean)))

  const { error: deleteError } = await supabase
    .from('master_note_playlist_items')
    .delete()
    .eq('playlist_id', playlistId)

  if (deleteError) throw deleteError

  if (dedupedNoteIds.length === 0) return

  const payload = dedupedNoteIds.map((masterNoteId, index) => ({
    user_id: userId,
    playlist_id: playlistId,
    master_note_id: masterNoteId,
    sort_order: index,
  }))

  const { error: insertError } = await supabase
    .from('master_note_playlist_items')
    .insert(payload)

  if (insertError) throw insertError
}
