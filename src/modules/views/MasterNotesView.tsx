import { useEffect, useMemo, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { useMasterNotePlayback } from '../hooks/useMasterNotePlayback'
import {
  createMasterNote,
  deleteMasterNote,
  downloadMasterNoteAudio,
  fetchMasterNotes,
} from '../services/masterNotes'
import type { MasterNote } from '../types'

type MasterNotesViewProps = {
  targetLang: string
  nativeLang: string
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

export function MasterNotesView({ targetLang, nativeLang }: MasterNotesViewProps) {
  const navigate = useNavigate()
  const [items, setItems] = useState<MasterNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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
      setConfirmDeleteId(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo eliminar la nota maestra')
    } finally {
      setDeletingId(null)
    }
  }

  const handlePlay = async (note: MasterNote): Promise<void> => {
    if (playingNoteId === note.id) {
      stop()
      return
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

  return (
    <section className='mx-auto w-full max-w-4xl flex-1 px-5 pt-8 pb-24 lg:pb-8'>
      <h2 className='mb-1 font-serif text-2xl lg:text-3xl font-bold'>
        ⭐ Notas Maestras
      </h2>
      <p className='mb-5 text-sm text-muted-foreground'>
        Crea notas maestras en {targetLang} y cierra cada una al completar entre
        3:00 y 3:30.
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

          return (
            <Card key={item.id} className='rounded-2xl'>
              <CardContent className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <p className='font-semibold'>
                  {item.state === 'closed' ? `⭐ ${item.name}` : item.name}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {item.state === 'closed' ? 'Cerrada' : 'En progreso'} ·{' '}
                  {formatDuration(item.total_duration_ms)}
                </p>
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
                    <Button type='button' onClick={() => void handlePlay(item)}>
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
                        <Link to={`${DASHBOARD_ROUTES.masterNotes}/note/${item.id}`}>
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
                      onClick={() => setConfirmDeleteId(item.id)}
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

      <Dialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar nota maestra</DialogTitle>
            <DialogDescription>
              Esta acción es irreversible. Se eliminarán la nota y sus audios.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setConfirmDeleteId(null)}
              disabled={Boolean(deletingId)}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() =>
                confirmDeleteId && void handleDelete(confirmDeleteId)
              }
              disabled={Boolean(deletingId)}
            >
              {deletingId ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
