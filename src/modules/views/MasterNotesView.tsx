import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  DownloadIcon,
  EyeIcon,
  Loader2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
  Volume2Icon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IcaDeletionWarningDialog } from '../components/IcaDeletionWarningDialog'
import {
  MasterNotePlaylistEditorDialog,
  type PlaylistEditorNoteOption,
} from '../components/MasterNotePlaylistEditorDialog'
import { MasterNotePlaylistPlayerDock } from '../components/MasterNotePlaylistPlayerDock'
import {
  getMetaTrackerLevelColor,
  hexWithAlpha,
} from '../components/MetaTracker/colors'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { useMasterNotePlayback } from '../hooks/useMasterNotePlayback'
import { useLoopedMasterNotePlayback } from '../hooks/useLoopedMasterNotePlayback'
import {
  getLoopCuePlaybackSource,
  warmLoopCueOfflineCache,
} from '../audio/loopCueCache'
import { formatDate } from '../utils'
import {
  createMasterNote,
  deleteMasterNote,
  downloadMasterNoteAudio,
  fetchMasterNotes,
} from '../services/masterNotes'
import { useMasterNotePlaylists } from '../hooks/useMasterNotePlaylists'
import type { MasterNote } from '../types'

type MasterNotesViewProps = {
  targetLang: string
  nativeLang: string
  todayVoiceActivationsCount: number
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function compareByCreatedAtAsc(a: MasterNote, b: MasterNote): number {
  const aTime = new Date(a.created_at || 0).getTime()
  const bTime = new Date(b.created_at || 0).getTime()

  if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
  if (Number.isNaN(aTime)) return 1
  if (Number.isNaN(bTime)) return -1
  return aTime - bTime
}

function SeekBack10Icon() {
  return (
    <div className='relative'>
      <RotateCcwIcon className='size-4' />
      <span className='absolute -right-1 -bottom-1 text-[9px] font-bold'>
        10
      </span>
    </div>
  )
}

function SeekForward10Icon() {
  return (
    <div className='relative'>
      <RotateCwIcon className='size-4' />
      <span className='absolute -right-1 -bottom-1 text-[9px] font-bold'>
        10
      </span>
    </div>
  )
}

export function MasterNotesView({
  targetLang,
  nativeLang,
  todayVoiceActivationsCount,
}: MasterNotesViewProps) {
  const navigate = useNavigate()
  const [items, setItems] = useState<MasterNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'notes' | 'playlists'>('notes')
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false)
  const [playlistDialogMode, setPlaylistDialogMode] = useState<
    'create' | 'edit'
  >('create')
  const [playlistDialogSubmitting, setPlaylistDialogSubmitting] =
    useState(false)
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(
    null,
  )
  const [deletingPlaylistId, setDeletingPlaylistId] = useState<string | null>(
    null,
  )
  const [activePlayerPlaylistId, setActivePlayerPlaylistId] = useState<
    string | null
  >(null)
  const [deleteCandidate, setDeleteCandidate] = useState<MasterNote | null>(
    null,
  )

  const {
    error: playbackError,
    clearError,
    playingNoteId,
    canPlay,
    play,
    playTransitionCue,
    stop,
    pause,
    resume,
    togglePause,
    seekBack10,
    seekForward10,
    isPaused,
    positionSec,
    durationSec,
  } = useMasterNotePlayback()

  const {
    playlists,
    itemsByPlaylistId,
    loading: playlistsLoading,
    error: playlistsError,
    refresh: refreshPlaylists,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    replacePlaylistItems,
    clearError: clearPlaylistsError,
  } = useMasterNotePlaylists({ targetLang, nativeLang })

  useEffect(() => {
    fetchMasterNotes(targetLang, nativeLang)
      .then((rows) => {
        setItems(rows)
        setError(null)
        clearError()
      })
      .catch((err) => {
        console.error(err)
        setError('No se pudieron cargar las notas maestras')
      })
      .finally(() => setLoading(false))
  }, [nativeLang, targetLang])

  useEffect(() => {
    void refreshPlaylists()
  }, [refreshPlaylists])

  useEffect(() => {
    void warmLoopCueOfflineCache()
  }, [])

  const openItems = useMemo(
    () =>
      items
        .filter((item) => item.state === 'open')
        .slice()
        .sort(compareByCreatedAtAsc),
    [items],
  )
  const closedItems = useMemo(
    () =>
      items
        .filter((item) => item.state === 'closed')
        .slice()
        .sort(compareByCreatedAtAsc),
    [items],
  )

  const closedNotesById = useMemo(
    () => new Map(closedItems.map((note) => [note.id, note])),
    [closedItems],
  )

  const closedNoteOptions = useMemo<PlaylistEditorNoteOption[]>(() => {
    return closedItems.map((note) => ({
      id: note.id,
      name: note.name,
    }))
  }, [closedItems])

  const editingPlaylist = useMemo(() => {
    if (!editingPlaylistId) return null
    return (
      playlists.find((playlist) => playlist.id === editingPlaylistId) || null
    )
  }, [editingPlaylistId, playlists])

  const editingPlaylistNoteIds = useMemo(() => {
    if (!editingPlaylist) return []
    return (itemsByPlaylistId.get(editingPlaylist.id) || [])
      .map((item) => item.master_note_id)
      .filter((id) => closedNotesById.has(id))
  }, [closedNotesById, editingPlaylist, itemsByPlaylistId])

  const activePlayerPlaylist = useMemo(() => {
    if (!activePlayerPlaylistId) return null
    return (
      playlists.find((playlist) => playlist.id === activePlayerPlaylistId) ||
      null
    )
  }, [activePlayerPlaylistId, playlists])

  const itemsById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]))
  }, [items])

  const playNoteById = useCallback(
    async (noteId: string): Promise<void> => {
      const note = itemsById.get(noteId)
      if (!note) return
      await play(note)
    },
    [itemsById, play],
  )

  const resolveNowPlayingMetadata = useCallback((noteId: string) => {
    const note = itemsById.get(noteId)
    if (!note) return null

    return {
      title: note.name,
      artist: 'Nota maestra',
      album: 'ICADEMY',
    }
  }, [itemsById])

  const playCue = useCallback(async (kind: 'start' | 'step' | 'finish'): Promise<unknown> => {
    const source = await getLoopCuePlaybackSource(kind)
    return await playTransitionCue(source)
  }, [playTransitionCue])

  const {
    looping: loopingClosed,
    loopIds: activeLoopIds,
    loopIndex,
    repeatEnabled: playlistRepeatEnabled,
    setRepeatEnabled: setPlaylistRepeatEnabled,
    startLoop,
    stopLoop,
    playNext,
    playPrevious,
    replayCurrent,
  } = useLoopedMasterNotePlayback({
    playingNoteId,
    isPaused,
    playNoteById,
    playTransitionCue: playCue,
    pausePlayback: pause,
    resumePlayback: resume,
    seekBack10,
    seekForward10,
    resolveNowPlayingMetadata,
    stopPlayback: stop,
  })

  const activeLoopNote = useMemo(() => {
    const noteId = activeLoopIds[loopIndex]
    if (!noteId) return null
    return itemsById.get(noteId) || null
  }, [activeLoopIds, itemsById, loopIndex])

  const playableClosedNoteIds = useMemo(() => {
    return closedItems
      .filter((note) => canPlay(note, note.total_duration_ms > 0 ? 1 : 0))
      .map((note) => note.id)
  }, [canPlay, closedItems])

  const disableLoopPlayback = (stopCurrent = false): void => {
    stopLoop(stopCurrent)
    setActivePlayerPlaylistId(null)
  }
  const handleCreate = async (): Promise<void> => {
    if (creating) return
    setCreating(true)
    try {
      const created = await createMasterNote(targetLang, nativeLang)
      setItems((prev) => [created, ...prev])
      setError(null)
      navigate(`${DASHBOARD_ROUTES.masterNotes}/note/${created.id}`)
    } catch (err) {
      console.error(err)
      setError('No se pudo crear la nota maestra')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (noteId: string): Promise<void> => {
    if (deletingId) return
    setDeletingId(noteId)
    try {
      await deleteMasterNote(noteId)
      setItems((prev) => prev.filter((item) => item.id !== noteId))
      setDeleteCandidate(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo eliminar la nota maestra')
    } finally {
      setDeletingId(null)
    }
  }

  const handlePlay = async (note: MasterNote): Promise<void> => {
    if (playingNoteId === note.id) {
      if (loopingClosed) {
        disableLoopPlayback(true)
      } else {
        stop()
      }
      return
    }

    if (loopingClosed) {
      disableLoopPlayback(false)
    }

    try {
      await play(note)
      setError(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo reproducir la nota maestra')
    }
  }

  const handleDownload = async (note: MasterNote): Promise<void> => {
    if (downloadingId) return
    setDownloadingId(note.id)
    try {
      await downloadMasterNoteAudio(note)
      setError(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo descargar la nota maestra')
    } finally {
      setDownloadingId(null)
    }
  }

  const getPlayablePlaylistNoteIds = (playlistId: string): string[] => {
    return (itemsByPlaylistId.get(playlistId) || [])
      .map((item) => item.master_note_id)
      .filter((noteId) => {
        const note = closedNotesById.get(noteId)
        if (!note) return false
        return canPlay(note, note.total_duration_ms > 0 ? 1 : 0)
      })
  }

  const handlePlayAllClosedLoop = async (): Promise<void> => {
    if (loopingClosed && !activePlayerPlaylistId) {
      disableLoopPlayback(true)
      return
    }

    const ids = playableClosedNoteIds
    if (ids.length === 0) {
      setError('No hay notas maestras cerradas reproducibles para el bucle')
      return
    }

    setPlaylistRepeatEnabled(false)
    const started = await startLoop(ids)
    if (!started) return
    setActivePlayerPlaylistId(null)
    setError(null)
  }

  const handlePlayPlaylist = async (playlistId: string): Promise<void> => {
    const playlist = playlists.find((row) => row.id === playlistId)
    if (!playlist) return

    const ids = getPlayablePlaylistNoteIds(playlistId)
    if (ids.length === 0) {
      setError('Esta lista no tiene notas cerradas reproducibles')
      return
    }

    setPlaylistRepeatEnabled(true)
    const started = await startLoop(ids)
    if (!started) return
    setActivePlayerPlaylistId(playlistId)
    setError(null)
  }

  const handleNextLoopTrack = async (): Promise<void> => {
    await playNext()
  }

  const handlePrevLoopTrack = async (): Promise<void> => {
    await playPrevious()
  }

  const handleTogglePlaylistPause = async (): Promise<void> => {
    if (!loopingClosed || activeLoopIds.length === 0) return

    if (playingNoteId) {
      togglePause()
      return
    }

    if (isPaused) {
      await resume()
      return
    }

    await replayCurrent()
  }

  const handleCreatePlaylistClick = (): void => {
    setPlaylistDialogMode('create')
    setEditingPlaylistId(null)
    setPlaylistDialogOpen(true)
  }

  const handleEditPlaylistClick = (playlistId: string): void => {
    setPlaylistDialogMode('edit')
    setEditingPlaylistId(playlistId)
    setPlaylistDialogOpen(true)
  }

  const handlePlaylistDialogSubmit = async (payload: {
    name: string
    noteIds: string[]
  }): Promise<void> => {
    if (playlistDialogSubmitting) return

    const normalizedName = payload.name.trim()
    if (!normalizedName) {
      setError('Escribe un nombre para la lista de reproducción')
      return
    }

    setPlaylistDialogSubmitting(true)
    try {
      if (playlistDialogMode === 'create') {
        const created = await createPlaylist(normalizedName)
        await replacePlaylistItems(created.id, payload.noteIds)
      } else if (editingPlaylist) {
        if (editingPlaylist.name.trim() !== normalizedName) {
          await renamePlaylist(editingPlaylist.id, normalizedName)
        }
        await replacePlaylistItems(editingPlaylist.id, payload.noteIds)
      }

      clearPlaylistsError()
      setError(null)
      setPlaylistDialogOpen(false)
      setEditingPlaylistId(null)
    } catch (err) {
      console.error(err)
      setError('No se pudieron guardar los cambios de la lista')
    } finally {
      setPlaylistDialogSubmitting(false)
    }
  }

  const handleDeletePlaylist = async (playlistId: string): Promise<void> => {
    if (deletingPlaylistId) return

    setDeletingPlaylistId(playlistId)
    try {
      await deletePlaylist(playlistId)
      setError(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo eliminar la lista de reproducción')
    } finally {
      setDeletingPlaylistId(null)
    }
  }

  const handleClosePlaylistPlayer = (): void => {
    disableLoopPlayback(true)
  }

  return (
    <section className='mx-auto w-full max-w-4xl flex-1 px-5 pt-8 pb-24 lg:pb-8'>
      <h2 className='mb-1 font-serif text-2xl lg:text-3xl font-bold'>
        ⭐ Notas Maestras
      </h2>
      <p className='mb-5 text-sm text-muted-foreground'>
        Crea notas maestras en {targetLang} y cierra cada una al completar entre
        3:00 y 3:30.
      </p>
      {(error || playbackError || playlistsError) && (
        <p className='mb-3 text-sm text-red-400'>
          {error || playbackError || playlistsError}
        </p>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'notes' | 'playlists')}
      >
        <TabsList>
          <TabsTrigger value='notes'>Mis Notas Maestras</TabsTrigger>
          <TabsTrigger value='playlists'>
            Mis Listas de Reproducción
          </TabsTrigger>
        </TabsList>

        <TabsContent value='notes' className='space-y-4'>
          <Card className='rounded-2xl'>
            <CardContent>
              <p className='mb-2 text-xs font-semibold tracking-wide text-muted-foreground'>
                Nueva Nota Maestra
              </p>
              <Button
                type='button'
                onClick={() => void handleCreate()}
                disabled={creating}
              >
                {creating ? 'Creando...' : 'Crear nota maestra'}
              </Button>
            </CardContent>
          </Card>

          {loading && (
            <p className='text-sm text-muted-foreground'>Cargando notas...</p>
          )}

          {!loading && (
            <Button
              type='button'
              variant={
                loopingClosed && !activePlayerPlaylistId ? 'outline' : 'default'
              }
              onClick={() => void handlePlayAllClosedLoop()}
              disabled={playableClosedNoteIds.length === 0}
            >
              {loopingClosed && !activePlayerPlaylistId ? (
                <>
                  <SquareIcon className='mr-1 size-4' />
                  Detener reproducción total
                </>
              ) : (
                <>
                  <PlayIcon className='mr-1 size-4' />
                  Reproducir todas una vez
                </>
              )}
            </Button>
          )}

          <div className='space-y-3'>
            {[...closedItems, ...openItems].map((item) => {
              const isDownloadingThis = downloadingId === item.id
              const levelColor = getMetaTrackerLevelColor(item.closed_level)

              return (
                <Card key={item.id} className='rounded-2xl'>
                  <CardContent className='flex flex-wrap items-center justify-between gap-3'>
                    <div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <p className='font-semibold'>
                          {item.state === 'closed'
                            ? `⭐ ${item.name}`
                            : item.name}
                        </p>
                        <Badge
                          variant='outline'
                          className={
                            item.state === 'open'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-700'
                          }
                        >
                          {item.state === 'open' ? 'Abierta' : 'Cerrada'}
                        </Badge>
                        {item.closed_level && (
                          <Badge
                            variant='outline'
                            className='font-semibold'
                            style={{
                              color: levelColor,
                              borderColor: hexWithAlpha(levelColor, 0.45),
                              backgroundColor: hexWithAlpha(levelColor, 0.14),
                              boxShadow: `0 0 12px -7px ${hexWithAlpha(levelColor, 0.8)}`,
                            }}
                          >
                            {item.closed_level}
                          </Badge>
                        )}
                      </div>
                      <div className='mt-1 text-xs text-muted-foreground'>
                        Duración: {formatDuration(item.total_duration_ms)}
                        {item.state === 'closed'
                          ? ` · Cerrada el: ${formatDate(item.closed_at)}`
                          : ''}
                      </div>
                    </div>

                    <div className='flex gap-2'>
                      {playingNoteId !== item.id ? (
                        <Button
                          type='button'
                          onClick={() => void handlePlay(item)}
                          disabled={
                            !canPlay(
                              item,
                              item.total_duration_ms > 0 ? 1 : 0,
                            ) || isDownloadingThis
                          }
                        >
                          <Volume2Icon className='mr-1 size-4' />
                          Escuchar
                        </Button>
                      ) : (
                        <>
                          <Button
                            type='button'
                            onClick={() => void handlePlay(item)}
                          >
                            <SquareIcon className='mr-1 size-4' />
                            Detener
                          </Button>
                          <Button
                            type='button'
                            size='icon'
                            variant='outline'
                            onClick={seekBack10}
                          >
                            <SeekBack10Icon />
                          </Button>
                          <Button
                            type='button'
                            size='icon'
                            variant='outline'
                            onClick={togglePause}
                          >
                            {isPaused ? (
                              <PlayIcon className='size-4' />
                            ) : (
                              <PauseIcon className='size-4' />
                            )}
                          </Button>
                          <Button
                            type='button'
                            size='icon'
                            variant='outline'
                            onClick={seekForward10}
                          >
                            <SeekForward10Icon />
                          </Button>
                          <span className='inline-flex min-w-18 items-center justify-end text-xs text-muted-foreground'>
                            {formatSeconds(positionSec)} /{' '}
                            {formatSeconds(durationSec)}
                          </span>
                        </>
                      )}

                      {playingNoteId !== item.id && (
                        <>
                          {isDownloadingThis ? (
                            <Button
                              size='icon'
                              variant='outline'
                              aria-label='Ingresar a la nota maestra'
                              disabled
                            >
                              {item.state === 'closed' ? (
                                <EyeIcon className='size-4' />
                              ) : (
                                <PencilIcon className='size-4' />
                              )}
                            </Button>
                          ) : (
                            <Button
                              asChild
                              size='icon'
                              variant='outline'
                              aria-label='Ingresar a la nota maestra'
                            >
                              <Link
                                to={`${DASHBOARD_ROUTES.masterNotes}/note/${item.id}`}
                              >
                                {item.state === 'closed' ? (
                                  <EyeIcon className='size-4' />
                                ) : (
                                  <PencilIcon className='size-4' />
                                )}
                              </Link>
                            </Button>
                          )}

                          {item.state === 'closed' && (
                            <Button
                              type='button'
                              size='icon'
                              variant='outline'
                              aria-label='Descargar nota maestra'
                              disabled={downloadingId === item.id}
                              onClick={() => void handleDownload(item)}
                            >
                              {isDownloadingThis ? (
                                <Loader2Icon className='size-4 animate-spin' />
                              ) : (
                                <DownloadIcon className='size-4' />
                              )}
                            </Button>
                          )}

                          <Button
                            type='button'
                            size='icon'
                            variant='destructive'
                            disabled={
                              deletingId === item.id || isDownloadingThis
                            }
                            onClick={() => setDeleteCandidate(item)}
                            aria-label='Eliminar nota maestra'
                          >
                            <Trash2Icon className='size-4' />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {!loading && items.length === 0 && (
              <p className='text-sm text-muted-foreground'>
                Todavía no tienes notas maestras.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value='playlists' className='space-y-4'>
          <Card className='rounded-2xl'>
            <CardContent className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
                  Mis listas de reproducción
                </p>
                <p className='text-sm text-muted-foreground'>
                  Crea, edita y reproduce tus listas de notas cerradas.
                </p>
              </div>
              <Button type='button' onClick={handleCreatePlaylistClick}>
                Crear lista de reproducción
              </Button>
            </CardContent>
          </Card>

          <Card className='rounded-2xl'>
            <CardContent>
              {playlistsLoading && (
                <p className='text-sm text-muted-foreground'>
                  Cargando listas...
                </p>
              )}

              {!playlistsLoading && playlists.length === 0 && (
                <p className='text-sm text-muted-foreground'>
                  Aún no tienes listas de reproducción.
                </p>
              )}

              <div className='space-y-2'>
                {playlists.map((playlist) => {
                  const totalItems =
                    itemsByPlaylistId.get(playlist.id)?.length || 0
                  const isThisPlaying =
                    activePlayerPlaylistId === playlist.id && loopingClosed

                  return (
                    <div
                      key={playlist.id}
                      className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'
                    >
                      <div>
                        <p className='font-semibold'>{playlist.name}</p>
                        <p className='text-xs text-muted-foreground'>
                          {totalItems} notas en esta lista
                        </p>
                      </div>

                      <div className='flex items-center gap-2'>
                        <Button
                          type='button'
                          size='sm'
                          variant={isThisPlaying ? 'secondary' : 'default'}
                          onClick={() => {
                            if (isThisPlaying) {
                              handleClosePlaylistPlayer()
                              return
                            }
                            void handlePlayPlaylist(playlist.id)
                          }}
                        >
                          {isThisPlaying ? (
                            <SquareIcon className='mr-1 size-4' />
                          ) : (
                            <Volume2Icon className='mr-1 size-4' />
                          )}
                          {isThisPlaying ? 'Detener' : 'Escuchar'}
                        </Button>

                        <Button
                          type='button'
                          size='icon'
                          variant='outline'
                          onClick={() => handleEditPlaylistClick(playlist.id)}
                          aria-label='Editar lista'
                        >
                          <PencilIcon className='size-4' />
                        </Button>

                        <Button
                          type='button'
                          size='icon'
                          variant='destructive'
                          disabled={deletingPlaylistId === playlist.id}
                          onClick={() => void handleDeletePlaylist(playlist.id)}
                          aria-label='Eliminar lista'
                        >
                          <Trash2Icon className='size-4' />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <MasterNotePlaylistEditorDialog
        open={playlistDialogOpen}
        mode={playlistDialogMode}
        initialName={editingPlaylist?.name || ''}
        initialNoteIds={editingPlaylistNoteIds}
        closedNotes={closedNoteOptions}
        submitting={playlistDialogSubmitting}
        onOpenChange={(open) => {
          setPlaylistDialogOpen(open)
          if (!open) {
            setEditingPlaylistId(null)
          }
        }}
        onSubmit={handlePlaylistDialogSubmit}
      />

      <MasterNotePlaylistPlayerDock
        open={Boolean(activePlayerPlaylist && activeLoopIds.length > 0)}
        playlistName={activePlayerPlaylist?.name || 'Lista de reproducción'}
        noteName={activeLoopNote?.name || 'Sin nota en reproducción'}
        progressSec={positionSec}
        durationSec={durationSec}
        currentIndex={loopIndex}
        totalCount={activeLoopIds.length}
        paused={isPaused || !playingNoteId}
        repeatEnabled={playlistRepeatEnabled}
        onTogglePause={() => {
          void handleTogglePlaylistPause()
        }}
        onToggleRepeat={() => setPlaylistRepeatEnabled((prev) => !prev)}
        onSeekBack10={seekBack10}
        onSeekForward10={seekForward10}
        onPrevious={() => {
          void handlePrevLoopTrack()
        }}
        onNext={() => {
          void handleNextLoopTrack()
        }}
        onClose={handleClosePlaylistPlayer}
      />

      <IcaDeletionWarningDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidate(null)
        }}
        onConfirm={() => {
          if (!deleteCandidate?.id) return
          void handleDelete(deleteCandidate.id)
        }}
        loading={Boolean(deletingId)}
        title='Eliminar nota maestra'
        resourceLabel='esta nota maestra y sus audios'
        resource='audio'
        resourceDates={[
          deleteCandidate?.created_at,
          deleteCandidate?.closed_at,
        ]}
        todayTotalCount={todayVoiceActivationsCount}
      />
    </section>
  )
}
