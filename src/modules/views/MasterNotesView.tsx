import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
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
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { IcaDeletionWarningDialog } from '../components/IcaDeletionWarningDialog'
import {
  getMetaTrackerLevelColor,
  hexWithAlpha,
} from '../components/MetaTracker/colors'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { useMasterNotePlayback } from '../hooks/useMasterNotePlayback'
import { speakNatural, stopTTS } from '../services/tts'
import { formatDate } from '../utils'
import { getMasterNotesLoopAnnouncement, type LoopAnnouncementType } from './masterNotesLoopAnnouncements'
import {
  createMasterNote,
  deleteMasterNote,
  downloadMasterNoteAudio,
  fetchMasterNoteAudioPayload,
  fetchMasterNotes,
} from '../services/masterNotes'
import { upsertOfflineClosedMasterNoteAudio } from '../services/masterNotesOfflineStore'
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
  const [loopIds, setLoopIds] = useState<string[]>([])
  const [loopIndex, setLoopIndex] = useState(0)
  const [deleteCandidate, setDeleteCandidate] = useState<MasterNote | null>(null)
  const previousPlayingNoteIdRef = useRef<string | null>(null)
  const loopTokenRef = useRef(0)

  const {
    error: playbackError,
    clearError,
    playingNoteId,
    canPlay,
    play,
    stop,
    togglePause,
    seekBack10,
    seekForward10,
    isPaused,
    positionSec,
    durationSec,
  } = useMasterNotePlayback()

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

  const itemsById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]))
  }, [items])

  const playableClosedItems = useMemo(() => {
    return closedItems.filter((item) => canPlay(item, item.total_duration_ms > 0 ? 1 : 0))
  }, [canPlay, closedItems])

  const disableLoopPlayback = (stopCurrent = false): void => {
    loopTokenRef.current += 1
    setLoopingClosed(false)
    setLoopPreparing(false)
    setLoopIds([])
    setLoopIndex(0)
    stopTTS()
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
        const payload = await fetchMasterNoteAudioPayload(note)
        if (token !== loopTokenRef.current) return
        await upsertOfflineClosedMasterNoteAudio(note, payload.blob)
      } catch {
        // noop: seguimos con el siguiente audio
      }
    }
  }

  const announceLoopNote = async (
    text: string,
    token: number,
    announcementType: LoopAnnouncementType,
  ): Promise<void> => {
    if (token !== loopTokenRef.current) return

    const spokenText = getMasterNotesLoopAnnouncement(text, announcementType)

    await new Promise<void>((resolve) => {
      const done = () => resolve()
      speakNatural(spokenText, nativeLang || targetLang, done, 1)
    })
  }

  const playLoopNoteAt = async (
    index: number,
    ids: string[],
    token: number,
    announcementType: 'first' | 'next',
    delayBeforeSpeakMs = 0,
  ): Promise<void> => {
    if (ids.length === 0) return
    if (token !== loopTokenRef.current) return

    if (delayBeforeSpeakMs > 0) {
      await waitMs(delayBeforeSpeakMs)
      if (token !== loopTokenRef.current) return
    }

    const safeIndex = ((index % ids.length) + ids.length) % ids.length
    const noteId = ids[safeIndex]
    const note = itemsById.get(noteId)
    if (!note) return

    setLoopIndex(safeIndex)
    await announceLoopNote(note.name || 'nota maestra', token, announcementType)
    if (token !== loopTokenRef.current) return

    await waitMs(1000)
    if (token !== loopTokenRef.current) return

    await play(note)
  }

  useEffect(() => {
    const prevPlayingNoteId = previousPlayingNoteIdRef.current

    if (loopingClosed && !loopPreparing && prevPlayingNoteId && !playingNoteId && loopIds.length > 0) {
      const token = loopTokenRef.current
      const nextIndex = (loopIndex + 1) % loopIds.length
      void playLoopNoteAt(nextIndex, loopIds, token, 'next', 1000)
    }

    previousPlayingNoteIdRef.current = playingNoteId
  }, [loopIds, loopIndex, loopPreparing, loopingClosed, play, playingNoteId, itemsById])
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

  const handleClosedLoopToggle = async (): Promise<void> => {
    if (loopingClosed || loopPreparing) {
      disableLoopPlayback(true)
      return
    }

    if (playableClosedItems.length === 0) {
      setError('No hay notas maestras cerradas listas para reproducir en bucle')
      return
    }

    const token = loopTokenRef.current + 1
    loopTokenRef.current = token

    const ids = playableClosedItems.map((note) => note.id)
    setLoopingClosed(true)
    setLoopPreparing(true)
    setLoopIds(ids)
    setLoopIndex(0)

    try {
      await warmClosedAudioForOffline(playableClosedItems, token)
      if (token !== loopTokenRef.current) return

      setLoopPreparing(false)
      await playLoopNoteAt(0, ids, token, 'first')
      if (token === loopTokenRef.current) {
        setError(null)
      }
    } catch (err) {
      console.error(err)
      if (token === loopTokenRef.current) {
        setError('No se pudo iniciar la reproducción en bucle')
        disableLoopPlayback(true)
      }
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

      <p className='mb-4 text-xs text-muted-foreground'>
        💡 Tip: cada vez que escuchas una nota maestra cerrada, preparamos su audio en este
        dispositivo para que su reproducción sea más rápida y también funcione mejor sin
        conexión.
      </p>

      <Card className='mb-4 rounded-2xl'>
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

          {closedItems.length > 0 && (
            <Button
              type='button'
              variant={loopingClosed ? 'secondary' : 'outline'}
              onClick={() => void handleClosedLoopToggle()}
              className='ml-2'
            >
              {loopPreparing ? (
                <>
                  <Loader2Icon className='mr-1 size-4 animate-spin' />
                  Preparando bucle...
                </>
              ) : loopingClosed ? (
                <>
                  <SquareIcon className='mr-1 size-4' />
                  Detener bucle
                </>
              ) : (
                <>
                  <RepeatIcon className='mr-1 size-4' />
                  Reproducir cerradas en bucle
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {loading && (
        <p className='text-sm text-muted-foreground'>Cargando notas...</p>
      )}
      {(error || playbackError) && (
        <p className='mb-3 text-sm text-red-400'>{error || playbackError}</p>
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
        resourceDates={[deleteCandidate?.created_at, deleteCandidate?.closed_at]}
        todayTotalCount={todayVoiceActivationsCount}
      />
    </section>
  )
}
