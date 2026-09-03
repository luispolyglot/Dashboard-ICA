import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDownIcon,
  Loader2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SquareIcon,
  Volume2Icon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  MasterNotePlaylistEditorDialog,
  type PlaylistEditorNoteOption,
} from '../components/MasterNotePlaylistEditorDialog'
import { MasterNotePlaylistPlayerDock } from '../components/MasterNotePlaylistPlayerDock'
import {
  getLoopCuePlaybackSource,
  warmLoopCueOfflineCache,
} from '../audio/loopCueCache'
import { useOfflineMasterNotePlaylists } from '../hooks/useOfflineMasterNotePlaylists'
import { useLoopedMasterNotePlayback } from '../hooks/useLoopedMasterNotePlayback'
import { useMasterNotePlayback } from '../hooks/useMasterNotePlayback'
import { OFFLINE_SAFE_LAST_PATH_STORAGE_KEY } from '../offline/events'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  listOfflineClosedMasterNotes,
  type OfflineClosedMasterNote,
} from '../services/masterNotesOfflineStore'
import type { MasterNote } from '../types'
import { formatDate } from '../utils'

function getCurrentPath(): string {
  if (typeof window === 'undefined') return DASHBOARD_ROUTES.home

  const candidate = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (!candidate || candidate === DASHBOARD_ROUTES.offlineSafe) {
    return DASHBOARD_ROUTES.home
  }

  return candidate
}

export function OfflineSafeView() {
  const navigate = useNavigate()
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [notes, setNotes] = useState<OfflineClosedMasterNote[]>([])
  const [notesError, setNotesError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'notes' | 'playlists'>('notes')
  const [activePlayerPlaylistId, setActivePlayerPlaylistId] = useState<
    string | null
  >(null)
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false)
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(
    null,
  )
  const [playlistDraftById, setPlaylistDraftById] = useState<
    Record<string, string[]>
  >({})
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('')
  const [playAllStartNoteId, setPlayAllStartNoteId] = useState<string | null>(
    null,
  )

  const {
    playlists,
    itemsByPlaylistId,
    loading: playlistsLoading,
    error: playlistsError,
    refresh: refreshPlaylists,
  } = useOfflineMasterNotePlaylists()

  const {
    error: playbackError,
    playingNoteId,
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

  useEffect(() => {
    let isMounted = true

    const loadOfflineNotes = async () => {
      setLoadingNotes(true)
      try {
        const rows = await listOfflineClosedMasterNotes()
        if (!isMounted) return
        setNotes(rows)
        setNotesError(null)
      } catch {
        if (!isMounted) return
        setNotesError('No se pudo cargar tu caché local de notas maestras')
      } finally {
        if (!isMounted) return
        setLoadingNotes(false)
      }
    }

    void loadOfflineNotes()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    void refreshPlaylists()
  }, [refreshPlaylists])

  useEffect(() => {
    void warmLoopCueOfflineCache()
  }, [])

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const returnPath = useMemo(() => {
    if (typeof window === 'undefined') return DASHBOARD_ROUTES.home
    const stored = window.sessionStorage.getItem(
      OFFLINE_SAFE_LAST_PATH_STORAGE_KEY,
    )
    if (stored && stored !== DASHBOARD_ROUTES.offlineSafe) {
      return stored
    }
    return getCurrentPath()
  }, [])

  const shouldAutoReturn = useMemo(() => {
    if (typeof window === 'undefined') return false
    return Boolean(
      window.sessionStorage.getItem(OFFLINE_SAFE_LAST_PATH_STORAGE_KEY),
    )
  }, [])

  useEffect(() => {
    if (!isOnline || !shouldAutoReturn) return

    const timeoutId = window.setTimeout(() => {
      window.sessionStorage.removeItem(OFFLINE_SAFE_LAST_PATH_STORAGE_KEY)
      navigate(returnPath, { replace: true })
    }, 700)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isOnline, navigate, returnPath, shouldAutoReturn])

  const handleRetry = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(OFFLINE_SAFE_LAST_PATH_STORAGE_KEY)
    }
    navigate(returnPath, { replace: true })
  }

  const languageGroups = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        key: string
        label: string
        notes: OfflineClosedMasterNote[]
      }
    >()

    for (const note of notes) {
      const target = (note.targetLang || '').trim() || 'Sin idioma objetivo'
      const native = (note.nativeLang || '').trim() || 'Sin idioma nativo'
      const key = `${target}::${native}`
      const label = `${target} -> ${native}`

      const current = groupsMap.get(key)
      if (current) {
        current.notes.push(note)
      } else {
        groupsMap.set(key, {
          key,
          label,
          notes: [note],
        })
      }
    }

    return Array.from(groupsMap.values())
  }, [notes])

  useEffect(() => {
    if (languageGroups.length === 0) {
      setSelectedGroupKey('')
      return
    }

    const hasSelected = languageGroups.some(
      (group) => group.key === selectedGroupKey,
    )
    if (hasSelected) return
    setSelectedGroupKey(languageGroups[0]?.key || '')
  }, [languageGroups, selectedGroupKey])

  const visibleNotes = useMemo(() => {
    if (languageGroups.length <= 1) {
      return notes
    }

    const selected = languageGroups.find(
      (group) => group.key === selectedGroupKey,
    )
    return selected?.notes || []
  }, [languageGroups, notes, selectedGroupKey])

  const notesById = useMemo(() => {
    return new Map(notes.map((note) => [note.noteId, note]))
  }, [notes])

  const playableOfflineNotes = useMemo(
    () => visibleNotes.filter((note) => note.audioAvailable),
    [visibleNotes],
  )

  const playableOfflineNoteIds = useMemo(
    () => playableOfflineNotes.map((note) => note.noteId),
    [playableOfflineNotes],
  )
  const defaultPlayAllStartNoteId = playableOfflineNoteIds[0] || null

  useEffect(() => {
    if (!defaultPlayAllStartNoteId) {
      setPlayAllStartNoteId(null)
      return
    }

    if (
      playAllStartNoteId &&
      playableOfflineNoteIds.includes(playAllStartNoteId)
    ) {
      return
    }

    setPlayAllStartNoteId(defaultPlayAllStartNoteId)
  }, [
    defaultPlayAllStartNoteId,
    playAllStartNoteId,
    playableOfflineNoteIds,
  ])

  const selectedPlayAllStartNote = useMemo(() => {
    const selectedId = playAllStartNoteId || defaultPlayAllStartNoteId
    if (!selectedId) return null
    return visibleNotes.find((note) => note.noteId === selectedId) || null
  }, [defaultPlayAllStartNoteId, playAllStartNoteId, visibleNotes])

  const closedNoteOptions = useMemo<PlaylistEditorNoteOption[]>(() => {
    return visibleNotes
      .filter((note) => note.audioAvailable)
      .map((note) => ({
        id: note.noteId,
        name: note.name,
      }))
  }, [visibleNotes])

  const editingPlaylist = useMemo(() => {
    if (!editingPlaylistId) return null
    return (
      playlists.find((playlist) => playlist.id === editingPlaylistId) || null
    )
  }, [editingPlaylistId, playlists])

  const editingPlaylistNoteIds = useMemo(() => {
    if (!editingPlaylist) return []

    const stored = (itemsByPlaylistId.get(editingPlaylist.id) || [])
      .map((item) => item.masterNoteId)
      .filter((noteId) => notesById.has(noteId))

    const draft = playlistDraftById[editingPlaylist.id]
    if (draft && draft.length >= 0) {
      return draft.filter((noteId) => notesById.has(noteId))
    }

    return stored
  }, [editingPlaylist, itemsByPlaylistId, notesById, playlistDraftById])

  const activePlayerPlaylist = useMemo(() => {
    if (!activePlayerPlaylistId) return null
    return (
      playlists.find((playlist) => playlist.id === activePlayerPlaylistId) ||
      null
    )
  }, [activePlayerPlaylistId, playlists])

  const playNoteById = useCallback(
    async (noteId: string): Promise<void> => {
      const note = notesById.get(noteId)
      if (!note || !note.audioAvailable) return
      await play(toMasterNote(note))
    },
    [notesById, play],
  )

  const resolveNowPlayingMetadata = useCallback((noteId: string) => {
    const note = notesById.get(noteId)
    if (!note) return null

    return {
      title: note.name,
      artist: 'Nota maestra',
      album: 'ICADEMY Offline',
    }
  }, [notesById])

  const playCue = useCallback(
    async (kind: 'start' | 'step' | 'finish'): Promise<unknown> => {
      const source = await getLoopCuePlaybackSource(kind)
      return await playTransitionCue(source)
    },
    [playTransitionCue],
  )

  const {
    looping: loopingClosed,
    loopIds,
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
    const noteId = loopIds[loopIndex]
    if (!noteId) return null
    return notesById.get(noteId) || null
  }, [loopIds, loopIndex, notesById])

  const toMasterNote = (note: OfflineClosedMasterNote): MasterNote => {
    return {
      id: note.noteId,
      name: note.name,
      state: 'closed',
      close_type: note.closeType,
      closed_level: note.closedLevel,
      total_duration_ms: note.totalDurationMs,
      final_audio_path: note.finalAudioPath,
      target_lang: note.targetLang,
      native_lang: note.nativeLang,
      created_at: note.createdAt,
      updated_at: note.updatedAt,
      closed_at: note.closedAt,
    }
  }

  const disableLoopPlayback = (stopCurrent = false): void => {
    stopLoop(stopCurrent)
    setActivePlayerPlaylistId(null)
  }

  useEffect(() => {
    if (!loopingClosed) return
    if (activePlayerPlaylistId) return
    disableLoopPlayback(true)
  }, [activePlayerPlaylistId, selectedGroupKey])

  useEffect(() => {
    if (!loopingClosed) return
    if (!activePlayerPlaylistId) return
    if (activeTab === 'playlists') return
    disableLoopPlayback(true)
  }, [activePlayerPlaylistId, activeTab, loopingClosed])

  const handlePlay = async (note: OfflineClosedMasterNote): Promise<void> => {
    if (!note.audioAvailable) return

    if (playingNoteId === note.noteId) {
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

    await play(toMasterNote(note))
  }

  const handleClosedLoopFrom = async (startNoteId: string): Promise<void> => {
    if (playableOfflineNotes.length === 0) {
      return
    }

    const ids = playableOfflineNotes.map((note) => note.noteId)
    const startIndex = ids.indexOf(startNoteId)
    if (startIndex === -1) {
      return
    }

    const idsFromStart = ids.slice(startIndex)
    if (idsFromStart.length === 0) {
      return
    }

    setPlayAllStartNoteId(startNoteId)
    setPlaylistRepeatEnabled(false)
    const started = await startLoop(idsFromStart)
    if (!started) return
    setActivePlayerPlaylistId(null)
  }

  const handlePlayPlaylist = async (playlistId: string): Promise<void> => {
    const ids = (
      playlistDraftById[playlistId] ||
      (itemsByPlaylistId.get(playlistId) || []).map((item) => item.masterNoteId)
    ).filter((noteId) => {
      const note = notesById.get(noteId)
      return Boolean(note?.audioAvailable)
    })

    if (ids.length === 0) return

    setPlaylistRepeatEnabled(true)
    const started = await startLoop(ids)
    if (!started) return
    setActivePlayerPlaylistId(playlistId)
  }

  const handleEditPlaylistClick = (playlistId: string): void => {
    setEditingPlaylistId(playlistId)
    setPlaylistDialogOpen(true)
  }

  const handlePlaylistDialogSubmit = async (payload: {
    name: string
    noteIds: string[]
  }): Promise<void> => {
    if (!editingPlaylistId) return

    setPlaylistDraftById((prev) => ({
      ...prev,
      [editingPlaylistId]: payload.noteIds,
    }))
    setPlaylistDialogOpen(false)
    setEditingPlaylistId(null)
  }

  const handleTogglePlaylistPause = async (): Promise<void> => {
    if (!loopingClosed || loopIds.length === 0) return

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

  const formatDuration = (durationMs: number): string => {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  return (
    <section className='mx-auto w-full max-w-3xl flex-1 px-5 pt-8 pb-24 lg:pb-8'>
      <h2 className='mb-2 font-serif text-2xl font-bold lg:text-3xl'>
        Modo seguro offline
      </h2>
      <p className='mb-5 text-sm text-muted-foreground'>
        Detectamos problemas de conectividad. Te llevamos a un modo seguro para
        mantener disponible Notas Maestras cuando no hay red.
      </p>

      <Card className='rounded-2xl'>
        <CardContent className='space-y-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <p className='text-sm font-semibold'>Estado de red:</p>
            <Badge
              variant='outline'
              className={
                isOnline
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700'
              }
            >
              {isOnline ? 'Conexión disponible' : 'Sin conexión'}
            </Badge>
          </div>

          <p className='text-sm text-muted-foreground'>
            Si la conexión vuelve, puedes reintentar para regresar a la pantalla
            anterior.
          </p>

          <div className='flex flex-wrap gap-2'>
            <Button type='button' onClick={handleRetry} disabled={!isOnline}>
              Reintentar y volver
            </Button>
            <Button
              type='button'
              variant='outline'
              onClick={() => navigate(DASHBOARD_ROUTES.masterNotes)}
            >
              Ir a Notas maestras
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className='mt-4'>
        {(playbackError || notesError || playlistsError) && (
          <p className='mb-3 text-sm text-red-400'>
            {playbackError || notesError || playlistsError}
          </p>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as 'notes' | 'playlists')
          }
        >
          <TabsList>
            <TabsTrigger value='notes'>Mis Notas Maestras</TabsTrigger>
            <TabsTrigger value='playlists'>
              Mis Listas de Reproducción
            </TabsTrigger>
          </TabsList>

          <TabsContent value='notes' className='space-y-3'>
            <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
              Notas maestras cerradas en caché local
            </p>

            {languageGroups.length > 1 && (
              <div className='flex items-center gap-2'>
                <p className='text-xs text-muted-foreground'>Idioma:</p>
                <Select
                  value={selectedGroupKey}
                  onValueChange={setSelectedGroupKey}
                >
                  <SelectTrigger size='sm' className='min-w-56'>
                    <SelectValue placeholder='Selecciona idioma' />
                  </SelectTrigger>
                  <SelectContent>
                    {languageGroups.map((group) => (
                      <SelectItem key={group.key} value={group.key}>
                        {group.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {playableOfflineNotes.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type='button'
                    variant={
                      loopingClosed && !activePlayerPlaylistId
                        ? 'outline'
                        : 'default'
                    }
                    className='h-auto max-w-full whitespace-normal py-2 text-left'
                  >
                    <PlayIcon className='mr-1 size-4' />
                    <span className='min-w-0 break-words'>
                      {`Reproducir todas una vez desde: ${selectedPlayAllStartNote?.name || '...'}`}
                    </span>
                    <ChevronDownIcon className='ml-1 size-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start'>
                  {loopingClosed && !activePlayerPlaylistId && (
                    <DropdownMenuItem onClick={() => disableLoopPlayback(true)}>
                      <SquareIcon className='mr-2 size-4' />
                      Detener reproducción total
                    </DropdownMenuItem>
                  )}
                  {visibleNotes.map((note) => (
                    <DropdownMenuItem
                      key={note.noteId}
                      disabled={!note.audioAvailable}
                      onClick={() => {
                        void handleClosedLoopFrom(note.noteId)
                      }}
                    >
                      {note.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {loadingNotes && (
              <p className='text-sm text-muted-foreground'>
                Cargando notas offline...
              </p>
            )}

            {!loadingNotes && !notesError && visibleNotes.length === 0 && (
              <p className='text-sm text-muted-foreground'>
                Aún no hay notas cerradas guardadas en este dispositivo.
              </p>
            )}

            {!loadingNotes &&
              !notesError &&
              visibleNotes.map((note) => (
                <Card key={note.noteId} className='rounded-2xl'>
                  <CardContent className='flex flex-wrap items-center justify-between gap-3'>
                    <div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <p className='font-semibold'>⭐ {note.name}</p>
                        <Badge
                          variant='outline'
                          className='border-amber-500/30 bg-amber-500/10 text-amber-700'
                        >
                          Cerrada
                        </Badge>
                        <Badge
                          variant='outline'
                          className={
                            note.audioAvailable
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                              : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-700'
                          }
                        >
                          {note.audioAvailable
                            ? 'Audio offline listo'
                            : 'Audio offline pendiente'}
                        </Badge>
                      </div>
                      <div className='mt-1 text-xs text-muted-foreground'>
                        Duración: {formatDuration(note.totalDurationMs)}
                        {note.closedAt
                          ? ` · Cerrada el: ${formatDate(note.closedAt)}`
                          : ''}
                      </div>
                    </div>

                    <div className='flex gap-2'>
                      {playingNoteId !== note.noteId ? (
                        <Button
                          type='button'
                          onClick={() => void handlePlay(note)}
                          disabled={!note.audioAvailable}
                        >
                          <Volume2Icon className='mr-1 size-4' />
                          Escuchar
                        </Button>
                      ) : (
                        <>
                          <Button
                            type='button'
                            onClick={() => void handlePlay(note)}
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
                            <RotateCcwIcon className='size-4' />
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
                            <RotateCwIcon className='size-4' />
                          </Button>
                          <span className='inline-flex min-w-18 items-center justify-end text-xs text-muted-foreground'>
                            {formatDuration(positionSec * 1000)} /{' '}
                            {formatDuration(durationSec * 1000)}
                          </span>
                        </>
                      )}

                      {!note.audioAvailable && (
                        <Button
                          type='button'
                          size='icon'
                          variant='outline'
                          disabled
                        >
                          <Loader2Icon className='size-4' />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </TabsContent>

          <TabsContent value='playlists' className='space-y-3'>
            <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
              Listas de reproducción disponibles offline
            </p>

            {playlistsLoading && (
              <p className='text-sm text-muted-foreground'>
                Cargando listas offline...
              </p>
            )}

            {!playlistsLoading && playlists.length === 0 && (
              <p className='text-sm text-muted-foreground'>
                Aún no hay listas guardadas offline para este usuario.
              </p>
            )}

            {playlists.length > 0 && (
              <Card className='rounded-2xl'>
                <CardContent className='space-y-2'>
                  {playlists.map((playlist) => {
                    const storedIds = (
                      itemsByPlaylistId.get(playlist.id) || []
                    ).map((item) => item.masterNoteId)
                    const ids = playlistDraftById[playlist.id] || storedIds
                    const playableCount = ids.filter((noteId) => {
                      const note = notesById.get(noteId)
                      return Boolean(note?.audioAvailable)
                    }).length
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
                            {ids.length} notas ({playableCount} reproducibles)
                          </p>
                        </div>

                        <div className='flex items-center gap-2'>
                          <Button
                            type='button'
                            size='sm'
                            variant={isThisPlaying ? 'secondary' : 'default'}
                            onClick={() => {
                              if (isThisPlaying) {
                                disableLoopPlayback(true)
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
                            aria-label='Editar cola offline de lista'
                          >
                            <PencilIcon className='size-4' />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <MasterNotePlaylistEditorDialog
          open={playlistDialogOpen}
          mode='edit'
          initialName={editingPlaylist?.name || ''}
          initialNoteIds={editingPlaylistNoteIds}
          closedNotes={closedNoteOptions}
          submitting={false}
          onOpenChange={(open) => {
            setPlaylistDialogOpen(open)
            if (!open) {
              setEditingPlaylistId(null)
            }
          }}
          onSubmit={handlePlaylistDialogSubmit}
        />

        <MasterNotePlaylistPlayerDock
          open={Boolean(activePlayerPlaylist && loopIds.length > 0)}
          playlistName={activePlayerPlaylist?.name || 'Lista offline'}
          noteName={activeLoopNote?.name || 'Sin nota en reproducción'}
          progressSec={positionSec}
          durationSec={durationSec}
          currentIndex={loopIndex}
          totalCount={loopIds.length}
          paused={isPaused || !playingNoteId}
          repeatEnabled={playlistRepeatEnabled}
          onToggleRepeat={() => setPlaylistRepeatEnabled((prev) => !prev)}
          onTogglePause={() => {
            void handleTogglePlaylistPause()
          }}
          onSeekBack10={seekBack10}
          onSeekForward10={seekForward10}
          onPrevious={() => {
            void playPrevious()
          }}
          onNext={() => {
            void playNext()
          }}
          onClose={() => disableLoopPlayback(true)}
          extraClassname='bottom-0! z-50!'
        />
      </div>
    </section>
  )
}
