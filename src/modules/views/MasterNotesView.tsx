import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SquareIcon, Trash2Icon, Volume2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  createMasterNote,
  createSignedMasterNoteAudioUrl,
  deleteMasterNote,
  fetchMasterNoteChunks,
  fetchMasterNotes,
} from '../services/masterNotes'
import type { MasterNote } from '../types'

type MasterNotesViewProps = {
  targetLang: string
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function MasterNotesView({ targetLang }: MasterNotesViewProps) {
  const [items, setItems] = useState<MasterNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const playTokenRef = useRef(0)

  const stopPlayback = (): void => {
    playTokenRef.current += 1
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      stopPlayback()
    }
  }, [])

  const playSingleAudio = async (src: string, token: number): Promise<void> => {
    if (token !== playTokenRef.current) return
    const audio = new Audio(src)
    currentAudioRef.current = audio

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('AUDIO_PLAYBACK_FAILED'))
      void audio.play().catch(reject)
    })

    if (token === playTokenRef.current) {
      currentAudioRef.current = null
    }
  }

  useEffect(() => {
    fetchMasterNotes()
      .then((rows) => {
        setItems(rows)
        setError(null)
      })
      .catch((err) => {
        console.error(err)
        setError('No se pudieron cargar las notas maestras')
      })
      .finally(() => setLoading(false))
  }, [])

  const openItems = useMemo(
    () => items.filter((item) => item.state === 'open'),
    [items],
  )
  const closedItems = useMemo(
    () => items.filter((item) => item.state === 'closed'),
    [items],
  )

  const handleCreate = async (): Promise<void> => {
    if (creating) return
    setCreating(true)
    try {
      const created = await createMasterNote(name)
      setItems((prev) => [created, ...prev])
      setName('')
      setError(null)
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
    } catch (err) {
      console.error(err)
      setError('No se pudo eliminar la nota maestra')
    } finally {
      setDeletingId(null)
    }
  }

  const handlePlayFinal = async (note: MasterNote): Promise<void> => {
    if (playingId === note.id) {
      stopPlayback()
      setPlayingId(null)
      return
    }

    stopPlayback()
    const token = playTokenRef.current

    try {
      setPlayingId(note.id)

      if (note.close_type === 'final' && note.final_audio_path) {
        const signedUrl = await createSignedMasterNoteAudioUrl(
          note.final_audio_path,
        )
        await playSingleAudio(signedUrl, token)
      } else {
        const chunks = await fetchMasterNoteChunks(note.id)
        if (chunks.length === 0) {
          throw new Error('NO_CHUNKS_AVAILABLE')
        }

        for (const chunk of chunks) {
          if (token !== playTokenRef.current) return
          const signedUrl = await createSignedMasterNoteAudioUrl(
            chunk.storage_path,
          )
          await playSingleAudio(signedUrl, token)
        }
      }

      if (token === playTokenRef.current) {
        setPlayingId(null)
      }
    } catch (err) {
      if (token !== playTokenRef.current) return
      console.error(err)
      setError(
        err instanceof Error && err.message === 'NO_CHUNKS_AVAILABLE'
          ? 'No hay audios para reproducir en esta nota maestra'
          : 'No se pudo reproducir la nota maestra',
      )
      setPlayingId(null)
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
            NUEVA NOTA MAESTRA
          </p>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder='Título (se guardará como NOTA MAESTRA: ...)'
            />
            <Button
              type='button'
              onClick={() => void handleCreate()}
              disabled={creating}
            >
              {creating ? 'Creando...' : 'Crear nota maestra'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <p className='text-sm text-muted-foreground'>Cargando notas...</p>
      )}
      {error && <p className='mb-3 text-sm text-red-400'>{error}</p>}

      <div className='space-y-3'>
        {openItems.map((item) => (
          <Card key={item.id} className='rounded-2xl'>
            <CardContent className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <p className='font-semibold'>{item.name}</p>
                <p className='text-xs text-muted-foreground'>
                  En progreso · {formatDuration(item.total_duration_ms)}
                </p>
              </div>
              <div className='flex gap-2'>
                <Button asChild size='sm'>
                  <Link to={`${DASHBOARD_ROUTES.masterNotes}/note/${item.id}`}>
                    Entrar
                  </Link>
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='destructive'
                  disabled={deletingId === item.id}
                  onClick={() => void handleDelete(item.id)}
                >
                  <Trash2Icon className='mr-1 size-4' />
                  {deletingId === item.id ? 'Eliminando...' : 'Eliminar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {closedItems.map((item) => (
          <Card key={item.id} className='rounded-2xl'>
            <CardContent className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <p className='font-semibold'>⭐ {item.name}</p>
                <p className='text-xs text-muted-foreground'>
                  Cerrada · {formatDuration(item.total_duration_ms)}
                </p>
              </div>
              <div className='flex gap-2'>
                <Button asChild size='sm'>
                  <Link to={`${DASHBOARD_ROUTES.masterNotes}/note/${item.id}`}>
                    Entrar
                  </Link>
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => void handlePlayFinal(item)}
                >
                  {playingId === item.id ? (
                    <>
                      <SquareIcon className='mr-1 size-4' />
                      Detener
                    </>
                  ) : (
                    <>
                      <Volume2Icon className='mr-1 size-4' />
                      Escuchar
                    </>
                  )}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='destructive'
                  disabled={deletingId === item.id}
                  onClick={() => void handleDelete(item.id)}
                >
                  <Trash2Icon className='mr-1 size-4' />
                  {deletingId === item.id ? 'Eliminando...' : 'Eliminar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {!loading && items.length === 0 && (
          <p className='text-sm text-muted-foreground'>
            Todavía no tienes notas maestras.
          </p>
        )}
      </div>
    </section>
  )
}
