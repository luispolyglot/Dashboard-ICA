import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  Loader2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RepeatIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
  Volume2Icon,
  PlusIcon,
  XIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { IcaDeletionWarningDialog } from '../components/IcaDeletionWarningDialog'
import {
  getMetaTrackerLevelColor,
  hexWithAlpha,
} from '../components/MetaTracker/colors'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { useMasterNotePlayback } from '../hooks/useMasterNotePlayback'
import dingdongCue from '@/audio/dingdong.mp3'
import { formatDate } from '../utils'
import {
  createMasterNote,
  deleteMasterNote,
  downloadMasterNoteAudio,
  fetchMasterNoteAudioPayload,
  fetchMasterNotes,
} from '../services/masterNotes'
import { upsertOfflineClosedMasterNoteAudio } from '../services/masterNotesOfflineStore'
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

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
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
  const [loopPreparing, setLoopPreparing] = useState(false)
  const [loopingClosed, setLoopingClosed] = useState(false)
  const [activeTab, setActiveTab] = useState<'notes' | 'playlists'>('notes')
  const [loopDraftIds, setLoopDraftIds] = useState<string[]>([])
  const [preparedLoopIds, setPreparedLoopIds] = useState<string[]>([])
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [playlistSubmitting, setPlaylistSubmitting] = useState(false)
  const [deletingPlaylistId, setDeletingPlaylistId] = useState<string | null>(null)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('')
  const [playlistDraftNoteIds, setPlaylistDraftNoteIds] = useState<string[]>([])
  const [addingPlaylistNoteId, setAddingPlaylistNoteId] = useState<string>('')
  const [savingPlaylistItems, setSavingPlaylistItems] = useState(false)
  const [loopIds, setLoopIds] = useState<string[]>([])
  const [loopIndex, setLoopIndex] = useState(0)
  const [showLoopDebug, setShowLoopDebug] = useState(false)
  const [loopDebugLogs, setLoopDebugLogs] = useState<string[]>([])
  const [deleteCandidate, setDeleteCandidate] = useState<MasterNote | null>(
    null,
  )
  const previousPlayingNoteIdRef = useRef<string | null>(null)
  const loopTokenRef = useRef(0)

  const {
    error: playbackError,
    clearError,
    playingNoteId,
    canPlay,
    play,
    playTransitionCue,
    stop,
    togglePause,
    seekBack10,
    seekForward10,
    isPaused,
    positionSec,
    durationSec,
    debugEvents: playbackDebugEvents,
    clearDebugEvents,
  } = useMasterNotePlayback()

  const {
    playlists,
    itemsByPlaylistId,
    loading: playlistsLoading,
    error: playlistsError,
    refresh: refreshPlaylists,
    createPlaylist,
    deletePlaylist,
    replacePlaylistItems,
    clearError: clearPlaylistsError,
  } = useMasterNotePlaylists({ targetLang, nativeLang })

  const appendLoopDebug = (message: string, error?: unknown): void => {
    const timestamp = new Date().toISOString()
    const details = error
      ? error instanceof Error
        ? ` | ${error.name}: ${error.message}`
        : ` | ${String(error)}`
      : ''

    setLoopDebugLogs((prev) => [...prev, `${timestamp} | ${message}${details}`].slice(-120))
  }

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
    if (playlists.length === 0) {
      setSelectedPlaylistId('')
      setPlaylistDraftNoteIds([])
      return
    }

    const exists = playlists.some((playlist) => playlist.id === selectedPlaylistId)
    if (exists) return
    setSelectedPlaylistId(playlists[0]?.id || '')
  }, [playlists, selectedPlaylistId])

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

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId],
  )

  const selectedPlaylistItems = useMemo(
    () => (selectedPlaylist ? itemsByPlaylistId.get(selectedPlaylist.id) || [] : []),
    [itemsByPlaylistId, selectedPlaylist],
  )

  const availableClosedNotesForPlaylist = useMemo(() => {
    const selectedSet = new Set(playlistDraftNoteIds)
    return closedItems.filter((note) => !selectedSet.has(note.id))
  }, [closedItems, playlistDraftNoteIds])

  useEffect(() => {
    if (!selectedPlaylist) {
      setPlaylistDraftNoteIds([])
      return
    }

    setPlaylistDraftNoteIds(
      selectedPlaylistItems
        .map((item) => item.master_note_id)
        .filter((noteId) => closedNotesById.has(noteId)),
    )
  }, [closedNotesById, selectedPlaylist, selectedPlaylistItems])

  useEffect(() => {
    if (availableClosedNotesForPlaylist.length === 0) {
      setAddingPlaylistNoteId('')
      return
    }

    const exists = availableClosedNotesForPlaylist.some(
      (note) => note.id === addingPlaylistNoteId,
    )
    if (exists) return
    setAddingPlaylistNoteId(availableClosedNotesForPlaylist[0]?.id || '')
  }, [addingPlaylistNoteId, availableClosedNotesForPlaylist])

  const itemsById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]))
  }, [items])

  const playableClosedItems = useMemo(() => {
    return closedItems.filter((item) =>
      canPlay(item, item.total_duration_ms > 0 ? 1 : 0),
    )
  }, [canPlay, closedItems])

  const selectedPlayableClosedItems = useMemo(() => {
    if (loopDraftIds.length === 0) return []
    const selectedSet = new Set(loopDraftIds)
    return playableClosedItems.filter((item) => selectedSet.has(item.id))
  }, [loopDraftIds, playableClosedItems])

  useEffect(() => {
    const closedIdSet = new Set(closedItems.map((item) => item.id))
    setLoopDraftIds((prev) => prev.filter((id) => closedIdSet.has(id)))
    setPreparedLoopIds((prev) => prev.filter((id) => closedIdSet.has(id)))
  }, [closedItems])

  const disableLoopPlayback = (stopCurrent = false): void => {
    appendLoopDebug('Se desactivó el modo bucle')
    loopTokenRef.current += 1
    setLoopingClosed(false)
    setLoopPreparing(false)
    setLoopIds([])
    setLoopIndex(0)
    if (stopCurrent) {
      stop()
    }
  }

  const warmClosedAudioForOffline = async (
    notes: MasterNote[],
    token: number,
  ): Promise<void> => {
    for (const note of notes) {
      if (token !== loopTokenRef.current) return

      try {
        appendLoopDebug(`Precache audio: ${note.name}`)
        const payload = await fetchMasterNoteAudioPayload(note)
        if (token !== loopTokenRef.current) return
        await upsertOfflineClosedMasterNoteAudio(note, payload.blob)
      } catch (err) {
        appendLoopDebug(`Falló precache: ${note.name}`, err)
      }
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
    const noteId = ids[safeIndex]
    const note = itemsById.get(noteId)
    if (!note) return

    setLoopIndex(safeIndex)

    appendLoopDebug(`Cue transición: ${note.name}`)
    const cuePlayed = await playTransitionCue(dingdongCue)
    if (token !== loopTokenRef.current) return
    if (!cuePlayed) {
      appendLoopDebug(`Cue omitido o falló: ${note.name}`)
    }

    appendLoopDebug(`Play bucle: ${note.name}`)
    await play(note)
  }

  useEffect(() => {
    if (!showLoopDebug) return

    const onWindowError = (event: ErrorEvent) => {
      appendLoopDebug(`window.error: ${event.message}`)
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      appendLoopDebug('window.unhandledrejection', event.reason)
    }

    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [showLoopDebug])

  useEffect(() => {
    const prevPlayingNoteId = previousPlayingNoteIdRef.current

    if (
      loopingClosed &&
      !loopPreparing &&
      prevPlayingNoteId &&
      !playingNoteId &&
      loopIds.length > 0
    ) {
      const token = loopTokenRef.current
      const nextIndex = (loopIndex + 1) % loopIds.length
      void playLoopNoteAt(nextIndex, loopIds, token, 900)
    }

    previousPlayingNoteIdRef.current = playingNoteId
  }, [
    loopIds,
    loopIndex,
    loopPreparing,
    loopingClosed,
    play,
    playingNoteId,
    itemsById,
  ])
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
      appendLoopDebug(`Play manual: ${note.name}`)
      await play(note)
      setError(null)
    } catch (err) {
      appendLoopDebug(`Error play manual: ${note.name}`, err)
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

  const handleClosedLoopToggle = async (): Promise<void> => {
    if (loopingClosed) {
      disableLoopPlayback(true)
      return
    }

    if (preparedLoopIds.length === 0) {
      setError('Primero prepara una sesión de reproducción en bucle')
      return
    }

    const token = loopTokenRef.current + 1
    loopTokenRef.current = token
    appendLoopDebug('Iniciando reproducción de sesión preparada')

    const ids = [...preparedLoopIds]
    setLoopingClosed(true)
    setLoopIds(ids)
    setLoopIndex(0)

    try {
      await playLoopNoteAt(0, ids, token)
      if (token === loopTokenRef.current) {
        appendLoopDebug('Bucle iniciado correctamente')
        setError(null)
      }
    } catch (err) {
      appendLoopDebug('Error iniciando bucle', err)
      console.error(err)
      if (token === loopTokenRef.current) {
        setError('No se pudo iniciar la reproducción en bucle')
        disableLoopPlayback(true)
      }
    }
  }

  const handlePrepareLoopSession = async (): Promise<void> => {
    if (loopPreparing) return
    if (loopingClosed) {
      disableLoopPlayback(true)
    }

    if (selectedPlayableClosedItems.length === 0) {
      setError('Selecciona al menos una nota maestra cerrada para preparar la sesión')
      return
    }

    const token = loopTokenRef.current + 1
    loopTokenRef.current = token

    setShowLoopDebug(true)
    setLoopDebugLogs([])
    clearDebugEvents()
    appendLoopDebug('Iniciando preparación de sesión de bucle')
    setLoopPreparing(true)
    setPreparedLoopIds([])

    try {
      await warmClosedAudioForOffline(selectedPlayableClosedItems, token)
      if (token !== loopTokenRef.current) return

      const sessionIds = selectedPlayableClosedItems.map((note) => note.id)
      setPreparedLoopIds(sessionIds)
      setError(null)
      appendLoopDebug(`Sesión preparada con ${sessionIds.length} notas`)
    } catch (err) {
      appendLoopDebug('Error preparando sesión', err)
      setError('No se pudo preparar la sesión de reproducción en bucle')
    } finally {
      if (token === loopTokenRef.current) {
        setLoopPreparing(false)
      }
    }
  }

  const handleToggleDraftNote = (noteId: string): void => {
    setLoopDraftIds((prev) => {
      if (prev.includes(noteId)) {
        return prev.filter((id) => id !== noteId)
      }
      return [...prev, noteId]
    })

    if (preparedLoopIds.length > 0) {
      setPreparedLoopIds([])
      appendLoopDebug('Se invalidó la sesión preparada por cambio de selección')
    }
  }

  const handleCopyLoopDebug = async (): Promise<void> => {
    const lines = [...loopDebugLogs, ...playbackDebugEvents]
    if (lines.length === 0) return

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      appendLoopDebug('Se copiaron logs al portapapeles')
    } catch (err) {
      appendLoopDebug('No se pudieron copiar logs', err)
    }
  }

  const handleCreatePlaylist = async (): Promise<void> => {
    if (playlistSubmitting) return

    const normalizedName = newPlaylistName.trim()
    if (!normalizedName) {
      setError('Escribe un nombre para la lista de reproducción')
      return
    }

    setPlaylistSubmitting(true)
    try {
      await createPlaylist(normalizedName)
      setNewPlaylistName('')
      clearPlaylistsError()
      setError(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo crear la lista de reproducción')
    } finally {
      setPlaylistSubmitting(false)
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

  const handleAddNoteToPlaylistDraft = (): void => {
    if (!addingPlaylistNoteId) return

    setPlaylistDraftNoteIds((prev) => {
      if (prev.includes(addingPlaylistNoteId)) return prev
      return [...prev, addingPlaylistNoteId]
    })
    setAddingPlaylistNoteId('')
  }

  const handleRemoveNoteFromPlaylistDraft = (noteId: string): void => {
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

  const handleSavePlaylistItems = async (): Promise<void> => {
    if (!selectedPlaylist) {
      setError('Selecciona una lista de reproducción')
      return
    }

    if (savingPlaylistItems) return

    setSavingPlaylistItems(true)
    try {
      await replacePlaylistItems(selectedPlaylist.id, playlistDraftNoteIds)
      setError(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo guardar el orden de la lista')
    } finally {
      setSavingPlaylistItems(false)
    }
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
          <TabsTrigger value='playlists'>Mis Listas de Reproducción</TabsTrigger>
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
                          {item.state === 'closed' ? `⭐ ${item.name}` : item.name}
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
                            !canPlay(item, item.total_duration_ms > 0 ? 1 : 0) ||
                            isDownloadingThis
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
                            {formatSeconds(positionSec)} / {formatSeconds(durationSec)}
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
                            disabled={deletingId === item.id || isDownloadingThis}
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
            <CardContent className='space-y-3'>
              <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
                Crear lista de reproducción
              </p>
              <div className='flex flex-wrap gap-2'>
                <Input
                  value={newPlaylistName}
                  onChange={(event) => setNewPlaylistName(event.target.value)}
                  placeholder='Ej: Cerradas de esta semana'
                  className='min-w-72 flex-1'
                />
                <Button
                  type='button'
                  onClick={() => void handleCreatePlaylist()}
                  disabled={playlistSubmitting}
                >
                  {playlistSubmitting ? 'Creando...' : 'Crear lista'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className='rounded-2xl'>
            <CardContent>
              <div className='mb-3 flex flex-wrap items-center justify-between gap-3'>
                <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
                  Mis listas de reproducción
                </p>

                {playlists.length > 0 && (
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
                )}
              </div>

              {playlistsLoading && (
                <p className='text-sm text-muted-foreground'>Cargando listas...</p>
              )}

              {!playlistsLoading && playlists.length === 0 && (
                <p className='text-sm text-muted-foreground'>
                  Aún no tienes listas de reproducción.
                </p>
              )}

              <div className='space-y-2'>
                {playlists.map((playlist) => {
                  const totalItems = itemsByPlaylistId.get(playlist.id)?.length || 0

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

                      <Button
                        type='button'
                        variant='destructive'
                        size='sm'
                        disabled={deletingPlaylistId === playlist.id}
                        onClick={() => void handleDeletePlaylist(playlist.id)}
                      >
                        {deletingPlaylistId === playlist.id ? 'Eliminando...' : 'Eliminar'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {selectedPlaylist && (
            <Card className='rounded-2xl'>
              <CardContent className='space-y-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div>
                    <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
                      Editar lista seleccionada
                    </p>
                    <p className='text-sm font-semibold'>{selectedPlaylist.name}</p>
                  </div>
                  <Button
                    type='button'
                    onClick={() => void handleSavePlaylistItems()}
                    disabled={savingPlaylistItems}
                  >
                    {savingPlaylistItems ? 'Guardando...' : 'Guardar lista'}
                  </Button>
                </div>

                <div className='flex flex-wrap gap-2'>
                  <div className='min-w-72 flex-1'>
                    <Select
                      value={addingPlaylistNoteId}
                      onValueChange={setAddingPlaylistNoteId}
                      disabled={availableClosedNotesForPlaylist.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Selecciona una nota cerrada' />
                      </SelectTrigger>
                      <SelectContent>
                        {availableClosedNotesForPlaylist.map((note) => (
                          <SelectItem key={note.id} value={note.id}>
                            {note.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={handleAddNoteToPlaylistDraft}
                    disabled={availableClosedNotesForPlaylist.length === 0 || !addingPlaylistNoteId}
                  >
                    <PlusIcon className='mr-1 size-4' />
                    Agregar nota
                  </Button>
                </div>

                <div className='space-y-2'>
                  {playlistDraftNoteIds.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      Esta lista está vacía. Agrega notas cerradas para reproducirlas.
                    </p>
                  ) : (
                    playlistDraftNoteIds.map((noteId, index) => {
                      const note = closedNotesById.get(noteId)
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
                              onClick={() =>
                                handleMovePlaylistDraftNote(noteId, 'up')
                              }
                              disabled={index === 0}
                            >
                              <ArrowUpIcon className='size-4' />
                            </Button>
                            <Button
                              type='button'
                              size='icon'
                              variant='outline'
                              aria-label='Mover abajo'
                              onClick={() =>
                                handleMovePlaylistDraftNote(noteId, 'down')
                              }
                              disabled={index === playlistDraftNoteIds.length - 1}
                            >
                              <ArrowDownIcon className='size-4' />
                            </Button>
                            <Button
                              type='button'
                              size='icon'
                              variant='destructive'
                              aria-label='Quitar nota'
                              onClick={() => handleRemoveNoteFromPlaylistDraft(noteId)}
                            >
                              <XIcon className='size-4' />
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {closedItems.length > 0 && (
            <Card className='rounded-2xl'>
              <CardContent>
                <Accordion type='single' collapsible defaultValue='prepare-loop'>
                  <AccordionItem value='prepare-loop' className='border-none'>
                    <AccordionTrigger className='py-0 hover:no-underline'>
                      <span className='text-xs font-semibold tracking-wide text-muted-foreground'>
                        Preparar sesión de reproducción en bucle
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className='pt-2'>
                      <div className='space-y-2'>
                        {closedItems.map((note) => (
                          <label
                            key={note.id}
                            className='flex items-center gap-2 text-sm'
                          >
                            <input
                              type='checkbox'
                              checked={loopDraftIds.includes(note.id)}
                              onChange={() => handleToggleDraftNote(note.id)}
                              className='size-4 rounded border-input accent-foreground'
                            />
                            <span>{note.name}</span>
                          </label>
                        ))}
                      </div>

                      <div className='mt-3 flex flex-wrap gap-2'>
                        <Button
                          type='button'
                          variant='outline'
                          onClick={() => void handlePrepareLoopSession()}
                          disabled={loopPreparing || selectedPlayableClosedItems.length === 0}
                        >
                          {loopPreparing ? (
                            <>
                              <Loader2Icon className='mr-1 size-4 animate-spin' />
                              Preparando sesión...
                            </>
                          ) : (
                            'Preparar sesión'
                          )}
                        </Button>

                        {preparedLoopIds.length > 0 && (
                          <Button
                            type='button'
                            variant={loopingClosed ? 'secondary' : 'default'}
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
                                Reproducir en bucle
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          )}

          {showLoopDebug && (
            <Card className='rounded-2xl border-dashed'>
              <CardContent>
                <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                  <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
                    Logs de depuración de bucle (provisorio)
                  </p>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => void handleCopyLoopDebug()}
                  >
                    <CopyIcon className='mr-1 size-4' />
                    Copiar errores
                  </Button>
                </div>
                <div className='max-h-56 overflow-auto rounded-md bg-muted p-2 text-[11px] text-muted-foreground'>
                  {[...loopDebugLogs, ...playbackDebugEvents].length === 0 ? (
                    <p>Sin eventos todavía.</p>
                  ) : (
                    <pre className='whitespace-pre-wrap'>
                      {[...loopDebugLogs, ...playbackDebugEvents].join('\n')}
                    </pre>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

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
