import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SquareIcon,
  Volume2Icon,
  XIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import dingdongCue from '@/audio/dingdong.mp3'
import { useOfflineMasterNotePlaylists } from '../hooks/useOfflineMasterNotePlaylists'
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

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
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
  const [loopingClosed, setLoopingClosed] = useState(false)
  const [loopIds, setLoopIds] = useState<string[]>([])
  const [loopIndex, setLoopIndex] = useState(0)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('')
  const [playlistDraftNoteIds, setPlaylistDraftNoteIds] = useState<string[]>([])
  const [addingPlaylistNoteId, setAddingPlaylistNoteId] = useState('')
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('')
  const previousPlayingNoteIdRef = useRef<string | null>(null)
  const loopTokenRef = useRef(0)

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

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId],
  )

  const selectedPlaylistItems = useMemo(
    () => (selectedPlaylist ? itemsByPlaylistId.get(selectedPlaylist.id) || [] : []),
    [itemsByPlaylistId, selectedPlaylist],
  )

  const selectedPlaylistNotes = useMemo(() => {
    return playlistDraftNoteIds
      .map((noteId) => notesById.get(noteId))
      .filter((note): note is OfflineClosedMasterNote => Boolean(note))
  }, [notesById, playlistDraftNoteIds])

  const playableSelectedPlaylistNotes = useMemo(
    () => selectedPlaylistNotes.filter((note) => note.audioAvailable),
    [selectedPlaylistNotes],
  )

  const availableVisibleNotesForPlaylist = useMemo(() => {
    const selectedSet = new Set(playlistDraftNoteIds)
    return visibleNotes
      .filter((note) => note.audioAvailable)
      .filter((note) => !selectedSet.has(note.noteId))
  }, [playlistDraftNoteIds, visibleNotes])

  useEffect(() => {
    if (playlists.length === 0) {
      setSelectedPlaylistId('')
      setPlaylistDraftNoteIds([])
      return
    }

    const exists = playlists.some((playlist) => playlist.id === selectedPlaylistId)
    if (exists) return
    setSelectedPlaylistId(playlists[0]?.id || '')
  }, [playlists, selectedPlaylistId])

  useEffect(() => {
    if (!selectedPlaylist) {
      setPlaylistDraftNoteIds([])
      return
    }

    setPlaylistDraftNoteIds(
      selectedPlaylistItems
        .map((item) => item.masterNoteId)
        .filter((noteId) => notesById.has(noteId)),
    )
  }, [notesById, selectedPlaylist, selectedPlaylistItems])

  useEffect(() => {
    if (availableVisibleNotesForPlaylist.length === 0) {
      setAddingPlaylistNoteId('')
      return
    }

    const exists = availableVisibleNotesForPlaylist.some(
      (note) => note.noteId === addingPlaylistNoteId,
    )
    if (exists) return
    setAddingPlaylistNoteId(availableVisibleNotesForPlaylist[0]?.noteId || '')
  }, [addingPlaylistNoteId, availableVisibleNotesForPlaylist])

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
    loopTokenRef.current += 1
    setLoopingClosed(false)
    setLoopIds([])
    setLoopIndex(0)
    if (stopCurrent) {
      stop()
    }
  }

  const playLoopNoteAt = async (
    index: number,
    ids: string[],
    token: number,
    delayBeforeCueMs = 0,
  ): Promise<void> => {
    if (ids.length === 0) return
    if (token !== loopTokenRef.current) return

    if (delayBeforeCueMs > 0) {
      await waitMs(delayBeforeCueMs)
      if (token !== loopTokenRef.current) return
    }

    const safeIndex = ((index % ids.length) + ids.length) % ids.length
    const note = notesById.get(ids[safeIndex])
    if (!note || !note.audioAvailable) return

    setLoopIndex(safeIndex)

    await playTransitionCue(dingdongCue)
    if (token !== loopTokenRef.current) return

    await play(toMasterNote(note))
  }

  useEffect(() => {
    const prevPlayingNoteId = previousPlayingNoteIdRef.current

    if (
      loopingClosed &&
      prevPlayingNoteId &&
      !playingNoteId &&
      loopIds.length > 0
    ) {
      const nextIndex = (loopIndex + 1) % loopIds.length
      const token = loopTokenRef.current
      void playLoopNoteAt(nextIndex, loopIds, token, 900)
    }

    previousPlayingNoteIdRef.current = playingNoteId
  }, [loopIds, loopIndex, loopingClosed, notesById, play, playingNoteId])

  useEffect(() => {
    if (!loopingClosed) return
    if (activeTab !== 'notes') return
    disableLoopPlayback(true)
  }, [activeTab, selectedGroupKey])

  useEffect(() => {
    if (!loopingClosed) return
    if (activeTab !== 'playlists') return
    disableLoopPlayback(true)
  }, [activeTab, selectedPlaylistId])

  useEffect(() => {
    if (!loopingClosed) return
    if (activeTab !== 'playlists') return
    disableLoopPlayback(true)
  }, [activeTab, playlistDraftNoteIds])

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

  const handleClosedLoopToggle = async (): Promise<void> => {
    if (loopingClosed) {
      disableLoopPlayback(true)
      return
    }

    const sourceNotes =
      activeTab === 'playlists'
        ? playableSelectedPlaylistNotes
        : playableOfflineNotes

    if (sourceNotes.length === 0) {
      return
    }

    const token = loopTokenRef.current + 1
    loopTokenRef.current = token

    const ids = sourceNotes.map((note) => note.noteId)
    setLoopingClosed(true)
    setLoopIds(ids)
    setLoopIndex(0)
    await playLoopNoteAt(0, ids, token)
  }

  const handleAddPlaylistDraftNote = (): void => {
    if (!addingPlaylistNoteId) return

    setPlaylistDraftNoteIds((prev) => {
      if (prev.includes(addingPlaylistNoteId)) return prev
      return [...prev, addingPlaylistNoteId]
    })
    setAddingPlaylistNoteId('')
  }

  const handleRemovePlaylistDraftNote = (noteId: string): void => {
    setPlaylistDraftNoteIds((prev) => prev.filter((id) => id !== noteId))
  }

  const handleMovePlaylistDraftNote = (noteId: string, direction: 'up' | 'down'): void => {
    setPlaylistDraftNoteIds((prev) => {
      const index = prev.indexOf(noteId)
      if (index < 0) return prev

      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= prev.length) return prev

      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
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
          onValueChange={(value) => setActiveTab(value as 'notes' | 'playlists')}
        >
          <TabsList>
            <TabsTrigger value='notes'>Mis Notas Maestras</TabsTrigger>
            <TabsTrigger value='playlists'>Mis Listas de Reproducción</TabsTrigger>
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
              <Button
                type='button'
                variant={loopingClosed ? 'secondary' : 'outline'}
                onClick={() => void handleClosedLoopToggle()}
              >
                {loopingClosed ? (
                  <>
                    <SquareIcon className='mr-1 size-4' />
                    Detener bucle
                  </>
                ) : (
                  <>
                    <RepeatIcon className='mr-1 size-4' />
                    Reproducir bucle
                  </>
                )}
              </Button>
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
                        <Badge variant='outline'>Caché local</Badge>
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
                        {` · Sync local: ${formatDate(note.cachedAt)}`}
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
              <p className='text-sm text-muted-foreground'>Cargando listas offline...</p>
            )}

            {!playlistsLoading && playlists.length === 0 && (
              <p className='text-sm text-muted-foreground'>
                Aún no hay listas guardadas offline para este usuario.
              </p>
            )}

            {playlists.length > 0 && (
              <Card className='rounded-2xl'>
                <CardContent className='space-y-3'>
                  <div className='flex flex-wrap items-center justify-between gap-3'>
                    <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
                      Lista seleccionada
                    </p>

                    <div className='min-w-72'>
                      <Select
                        value={selectedPlaylistId}
                        onValueChange={setSelectedPlaylistId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder='Selecciona una lista' />
                        </SelectTrigger>
                        <SelectContent>
                          {playlists.map((playlist) => (
                            <SelectItem key={playlist.id} value={playlist.id}>
                              {playlist.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {selectedPlaylist && (
                    <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                      <Badge variant='outline'>
                        {(selectedPlaylist.targetLang || 'Sin objetivo') + ' -> ' + (selectedPlaylist.nativeLang || 'Sin nativo')}
                      </Badge>
                      <span>{selectedPlaylistItems.length} notas guardadas</span>
                    </div>
                  )}

                  {playableSelectedPlaylistNotes.length > 0 && (
                    <Button
                      type='button'
                      variant={loopingClosed ? 'secondary' : 'outline'}
                      onClick={() => void handleClosedLoopToggle()}
                    >
                      {loopingClosed ? (
                        <>
                          <SquareIcon className='mr-1 size-4' />
                          Detener bucle
                        </>
                      ) : (
                        <>
                          <RepeatIcon className='mr-1 size-4' />
                          Reproducir lista en bucle
                        </>
                      )}
                    </Button>
                  )}

                  <div className='flex flex-wrap gap-2'>
                    <div className='min-w-72 flex-1'>
                      <Select
                        value={addingPlaylistNoteId}
                        onValueChange={setAddingPlaylistNoteId}
                        disabled={availableVisibleNotesForPlaylist.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder='Agregar nota de este idioma' />
                        </SelectTrigger>
                        <SelectContent>
                          {availableVisibleNotesForPlaylist.map((note) => (
                            <SelectItem key={note.noteId} value={note.noteId}>
                              {note.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={handleAddPlaylistDraftNote}
                      disabled={availableVisibleNotesForPlaylist.length === 0 || !addingPlaylistNoteId}
                    >
                      <PlusIcon className='mr-1 size-4' />
                      Armar cola local
                    </Button>
                  </div>

                  {playlistDraftNoteIds.length > 0 && (
                    <div className='space-y-2'>
                      {playlistDraftNoteIds.map((noteId, index) => {
                        const note = notesById.get(noteId)
                        if (!note) return null

                        return (
                          <div
                            key={noteId}
                            className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'
                          >
                            <div>
                              <p className='font-semibold'>{note.name}</p>
                              <p className='text-xs text-muted-foreground'>
                                Posición {index + 1}
                              </p>
                            </div>

                            <div className='flex items-center gap-2'>
                              <Button
                                type='button'
                                size='icon'
                                variant='outline'
                                aria-label='Mover arriba'
                                onClick={() => handleMovePlaylistDraftNote(noteId, 'up')}
                                disabled={index === 0}
                              >
                                <ArrowUpIcon className='size-4' />
                              </Button>
                              <Button
                                type='button'
                                size='icon'
                                variant='outline'
                                aria-label='Mover abajo'
                                onClick={() => handleMovePlaylistDraftNote(noteId, 'down')}
                                disabled={index === playlistDraftNoteIds.length - 1}
                              >
                                <ArrowDownIcon className='size-4' />
                              </Button>
                              <Button
                                type='button'
                                size='icon'
                                variant='destructive'
                                aria-label='Quitar nota'
                                onClick={() => handleRemovePlaylistDraftNote(noteId)}
                              >
                                <XIcon className='size-4' />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
