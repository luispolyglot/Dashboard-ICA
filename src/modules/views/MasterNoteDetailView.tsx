import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MicIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
  Volume2Icon,
} from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
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
import { Input } from '@/components/ui/input'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { fetchPhraseHistory } from '../services/phraseHistory'
import {
  closeMasterNote,
  deleteMasterNote,
  fetchMasterNoteById,
  fetchMasterNoteChunks,
  removeMasterNoteChunk,
} from '../services/masterNotes'
import { fetchPhraseVoiceActivations } from '../services/phraseVoiceActivations'
import { useMasterNotePlayback } from '../hooks/useMasterNotePlayback'
import type {
  MasterNote,
  MasterNoteChunk,
  PhraseGenerationEntry,
} from '../types'

type MasterNoteDetailViewProps = {
  noteId: string
  targetLang: string
}

const MIN_DURATION_MS = 3 * 60 * 1000
const MAX_DURATION_MS = 3 * 60 * 1000 + 30 * 1000

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

export function MasterNoteDetailView({
  noteId,
  targetLang,
}: MasterNoteDetailViewProps) {
  const navigate = useNavigate()
  const [note, setNote] = useState<MasterNote | null>(null)
  const [chunks, setChunks] = useState<MasterNoteChunk[]>([])
  const [phrases, setPhrases] = useState<PhraseGenerationEntry[]>([])
  const [activationsByPhrase, setActivationsByPhrase] = useState<
    Record<string, { id: string }[]>
  >({})
  const [query, setQuery] = useState('')
  const [onlyNotActivated, setOnlyNotActivated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [removingChunkId, setRemovingChunkId] = useState<string | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    error: playbackError,
    clearError,
    playingNoteId,
    canPlay,
    play,
    stop,
    seekBack10,
    seekForward10,
    positionSec,
    durationSec,
  } = useMasterNotePlayback()

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true)
      try {
        const [foundNote, phraseRows, chunkRows] = await Promise.all([
          fetchMasterNoteById(noteId),
          fetchPhraseHistory(80, targetLang),
          fetchMasterNoteChunks(noteId),
        ])

        if (!foundNote) {
          setError('No se encontró la nota maestra')
          setNote(null)
          setPhrases([])
          setChunks([])
          return
        }

        const phraseIds = phraseRows.map((item) => item.id)
        const activationMap = await fetchPhraseVoiceActivations(phraseIds)

        const totalDuration = chunkRows.reduce(
          (sum, chunk) => sum + chunk.duration_ms,
          0,
        )

        setNote({ ...foundNote, total_duration_ms: totalDuration })
        setPhrases(phraseRows)
        setChunks(chunkRows)
        setActivationsByPhrase(
          activationMap as Record<string, { id: string }[]>,
        )
        setError(null)
      } catch (err) {
        console.error(err)
        setError('No se pudo cargar la nota maestra')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [noteId, targetLang])

  const activatedInThisNote = useMemo(() => {
    return new Set(chunks.map((chunk) => chunk.phrase_generation_id))
  }, [chunks])

  const activatedPhrasesInThisNote = useMemo(() => {
    const phraseById = new Map(phrases.map((item) => [item.id, item]))
    return chunks
      .map((chunk) => ({
        chunk,
        phrase: phraseById.get(chunk.phrase_generation_id) || null,
      }))
      .filter((item) => item.phrase !== null)
  }, [chunks, phrases])

  const visiblePhrases = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = !q
      ? phrases
      : phrases.filter((item) => {
          const phrase = (item.generated_phrase || '').toLowerCase()
          const translation = (item.translation || '').toLowerCase()
          const sourceWords = (item.source_words || []).join(' ').toLowerCase()
          return (
            phrase.includes(q) ||
            translation.includes(q) ||
            sourceWords.includes(q)
          )
        })

    const withoutActivatedInThisNote = filtered.filter(
      (item) => !activatedInThisNote.has(item.id),
    )

    if (!onlyNotActivated) return withoutActivatedInThisNote

    return withoutActivatedInThisNote.filter(
      (item) => (activationsByPhrase[item.id] || []).length === 0,
    )
  }, [
    activatedInThisNote,
    activationsByPhrase,
    onlyNotActivated,
    phrases,
    query,
  ])

  const canClose =
    !!note && note.state === 'open' && note.total_duration_ms >= MIN_DURATION_MS
  const canActivateMorePhrases =
    !!note && note.state === 'open' && note.total_duration_ms < MAX_DURATION_MS
  const canPlayNote = !!note && canPlay(note, chunks.length)

  const handlePlayNote = async (): Promise<void> => {
    if (!note) return
    if (playingNoteId === note.id) return
    try {
      await play(note, chunks.length)
      clearError()
      setError(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo reproducir la nota maestra')
    }
  }

  const handleCloseNote = async (): Promise<void> => {
    if (!note || !canClose || closing) return
    setClosing(true)
    try {
      await closeMasterNote(note.id)
      setNote((prev) =>
        prev
          ? {
              ...prev,
              state: 'closed',
              close_type: 'temporal',
              closed_at: new Date().toISOString(),
            }
          : prev,
      )
      setError(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo cerrar la nota maestra')
    } finally {
      setClosing(false)
    }
  }

  const handleDeleteNote = async (): Promise<void> => {
    if (!note || deleting) return
    setDeleting(true)
    try {
      stop()
      await deleteMasterNote(note.id)
      navigate(DASHBOARD_ROUTES.masterNotes)
    } catch (err) {
      console.error(err)
      setError('No se pudo eliminar la nota maestra')
    } finally {
      setDeleting(false)
      setConfirmDeleteOpen(false)
    }
  }

  const handleRemoveActivatedPhrase = async (
    chunkId: string,
  ): Promise<void> => {
    if (!note || note.state !== 'open' || removingChunkId) return
    setRemovingChunkId(chunkId)
    try {
      const nextTotal = await removeMasterNoteChunk(note.id, chunkId)
      const nextChunks = chunks.filter((chunk) => chunk.id !== chunkId)
      setChunks(nextChunks)
      setNote((prev) =>
        prev ? { ...prev, total_duration_ms: nextTotal } : prev,
      )

      const nextActivationMap = await fetchPhraseVoiceActivations(
        phrases.map((item) => item.id),
      )
      setActivationsByPhrase(
        nextActivationMap as Record<string, { id: string }[]>,
      )
      setError(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo eliminar la frase activada de esta nota')
    } finally {
      setRemovingChunkId(null)
    }
  }

  if (loading) {
    return (
      <section className='mx-auto w-full max-w-4xl flex-1 px-5 py-8'>
        <p className='text-sm text-muted-foreground'>
          Cargando nota maestra...
        </p>
      </section>
    )
  }

  if (!note) {
    return (
      <section className='mx-auto w-full max-w-4xl flex-1 px-5 py-8'>
        <p className='text-sm text-red-400'>No se encontró la nota maestra.</p>
      </section>
    )
  }

  return (
    <section className='mx-auto w-full max-w-4xl flex-1 px-5 pt-8 pb-24 lg:pb-8'>
      <h2 className='mb-1 font-serif text-2xl lg:text-3xl font-bold'>
        {note.state === 'closed' ? `⭐ ${note.name}` : note.name}
      </h2>
      <p className='mb-4 text-sm text-muted-foreground'>
        Duración acumulada: {formatDuration(note.total_duration_ms)} · Estado:{' '}
        {note.state === 'closed' ? 'cerrada' : 'abierta'}
      </p>
      <div className='mb-4'>
        <div className='flex gap-2'>
          {playingNoteId !== note.id ? (
            <Button
              type='button'
              onClick={() => void handlePlayNote()}
              disabled={!canPlayNote}
            >
              <Volume2Icon className='mr-1 size-4' />
              Escuchar
            </Button>
          ) : (
            <>
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
                onClick={stop}
              >
                <SquareIcon className='size-4' />
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
          <Button
            type='button'
            size='icon'
            variant='destructive'
            aria-label='Eliminar nota maestra'
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleting}
          >
            <Trash2Icon className='size-4' />
          </Button>
        </div>
      </div>
      {(error || playbackError) && (
        <p className='mb-3 text-sm text-red-400'>{error || playbackError}</p>
      )}

      {note.state === 'open' && (
        <Card className='mb-4 rounded-2xl'>
          <CardContent className='flex flex-wrap items-center justify-between gap-3'>
            <p className='text-sm text-muted-foreground'>
              Cierra la nota cuando supere 3:00.
            </p>
            <Button
              type='button'
              onClick={() => void handleCloseNote()}
              disabled={!canClose || closing}
            >
              {closing ? 'Cerrando...' : 'Cerrar nota maestra'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className='rounded-2xl'>
        <CardContent>
          <p className='mb-2 text-xs font-semibold tracking-wide text-muted-foreground'>
            {note.state === 'closed'
              ? 'FRASES DE ESTA NOTA'
              : 'FRASES DISPONIBLES'}
          </p>

          {note.state === 'closed' ? (
            <div className='space-y-2'>
              {activatedPhrasesInThisNote.map(({ chunk, phrase }, index) => (
                <div
                  key={chunk.id}
                  className='rounded-xl border border-border/70 p-3'
                >
                  <p className='mb-0.5 text-xs text-muted-foreground'>
                    #{index + 1} · {formatDuration(chunk.duration_ms)}
                  </p>
                  <p className='font-serif text-lg font-bold'>
                    {phrase?.generated_phrase || 'Sin frase registrada'}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {phrase?.translation || 'Sin traducción'}
                  </p>
                </div>
              ))}

              {activatedPhrasesInThisNote.length === 0 && (
                <p className='text-sm text-muted-foreground'>
                  No hay frases activadas en esta nota.
                </p>
              )}
            </div>
          ) : (
            <>
              <Accordion
                type='single'
                collapsible
                className='mb-3 rounded-lg border border-border/60 px-3'
              >
                <AccordionItem value='activated-in-note' className='border-b-0'>
                  <AccordionTrigger>
                    Frases activadas en esta nota (
                    {activatedPhrasesInThisNote.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className='space-y-1'>
                      {activatedPhrasesInThisNote.length === 0 && (
                        <p className='text-xs text-muted-foreground'>
                          Aún no activaste frases en esta nota.
                        </p>
                      )}
                      {activatedPhrasesInThisNote.map(({ chunk, phrase }) => (
                        <div
                          key={chunk.id}
                          className='flex flex-row items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5 text-xs'
                        >
                          <p className='truncate font-medium mb-0! p-1'>
                            {phrase?.generated_phrase || 'Sin frase registrada'}
                          </p>
                          <div className='flex items-center gap-2'>
                            <span className='shrink-0 text-muted-foreground'>
                              {formatDuration(chunk.duration_ms)}
                            </span>
                            {note.state === 'open' && (
                              <Button
                                type='button'
                                size='icon'
                                variant='ghost'
                                className='h-6 w-6'
                                aria-label='Eliminar frase activada de esta nota'
                                disabled={Boolean(removingChunkId)}
                                onClick={() =>
                                  void handleRemoveActivatedPhrase(chunk.id)
                                }
                              >
                                <Trash2Icon className='size-3.5 text-destructive' />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className='mb-3 flex flex-col gap-2'>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder='Buscar frase...'
                />
                {!canActivateMorePhrases && (
                  <p className='text-xs font-semibold text-red-400'>
                    Límite alcanzado: esta nota superó 3:30 y ya no admite
                    nuevas activaciones.
                  </p>
                )}
                <label className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
                  <input
                    type='checkbox'
                    checked={onlyNotActivated}
                    onChange={(event) =>
                      setOnlyNotActivated(event.target.checked)
                    }
                    className='h-4 w-4 accent-primary'
                  />
                  Mostrar solo frases NO activadas
                </label>
              </div>

              <div className='space-y-2'>
                {visiblePhrases.map((item) => {
                  const isActivated =
                    (activationsByPhrase[item.id] || []).length > 0

                  return (
                    <div
                      key={item.id}
                      className='flex flex-col items-start justify-between gap-2 rounded-xl border border-border/70 p-3'
                    >
                      <div className='flex flex-col w-full'>
                        <div className='w-full flex items-start justify-between gap-2'>
                          <p className='font-serif text-lg font-bold'>
                            {item.generated_phrase || 'Sin frase registrada'}
                          </p>
                          {isActivated && (
                            <span className='inline-flex rounded-full p-1 shadow-[0_0_10px_#eab30877,0_0_22px_#eab30844]'>
                              <MicIcon className='size-4 text-muted-foreground' />
                            </span>
                          )}
                        </div>
                        <p className='text-xs text-muted-foreground'>
                          {item.translation || 'Sin traducción'}
                        </p>
                      </div>
                      <Button
                        asChild={canActivateMorePhrases}
                        size='sm'
                        variant={canActivateMorePhrases ? 'default' : 'outline'}
                        disabled={!canActivateMorePhrases}
                      >
                        {canActivateMorePhrases ? (
                          <Link
                            to={`${DASHBOARD_ROUTES.masterNotes}/note/${note.id}/activate/${item.id}`}
                          >
                            ACTIVAR
                          </Link>
                        ) : (
                          <span>Límite alcanzado</span>
                        )}
                      </Button>
                    </div>
                  )
                })}

                {!loading && visiblePhrases.length === 0 && (
                  <p className='text-sm text-muted-foreground'>
                    No hay frases para mostrar.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar nota maestra</DialogTitle>
            <DialogDescription>
              Esta acción es irreversible. Se eliminarán la nota y sus audios
              asociados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() => void handleDeleteNote()}
              disabled={deleting}
            >
              {deleting ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
