import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckIcon,
  MicIcon,
  PencilIcon,
  SquareIcon,
  Volume2Icon,
  XIcon,
} from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { fetchPhraseHistory } from '../services/phraseHistory'
import {
  closeMasterNote,
  createSignedMasterNoteAudioUrl,
  fetchMasterNoteById,
  fetchMasterNoteChunks,
  updateMasterNoteName,
} from '../services/masterNotes'
import { fetchPhraseVoiceActivations } from '../services/phraseVoiceActivations'
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

function extractNameValue(name: string): string {
  return name.replace(/^NOTA MAESTRA:\s*/i, '')
}

export function MasterNoteDetailView({
  noteId,
  targetLang,
}: MasterNoteDetailViewProps) {
  const [note, setNote] = useState<MasterNote | null>(null)
  const [chunks, setChunks] = useState<MasterNoteChunk[]>([])
  const [phrases, setPhrases] = useState<PhraseGenerationEntry[]>([])
  const [activationsByPhrase, setActivationsByPhrase] = useState<
    Record<string, { id: string }[]>
  >({})
  const [query, setQuery] = useState('')
  const [onlyNotActivated, setOnlyNotActivated] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingName, setSavingName] = useState(false)
  const [closing, setClosing] = useState(false)
  const [playingNote, setPlayingNote] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setNameDraft(extractNameValue(foundNote.name))
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

    return () => {
      stopPlayback()
    }
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
    !!note &&
    note.state === 'open' &&
    note.total_duration_ms >= MIN_DURATION_MS &&
    note.total_duration_ms <= MAX_DURATION_MS

  const handlePlayNote = async (): Promise<void> => {
    if (!note || note.state !== 'closed') return

    if (playingNote) {
      stopPlayback()
      setPlayingNote(false)
      return
    }

    stopPlayback()
    const token = playTokenRef.current

    try {
      setPlayingNote(true)

      if (note.close_type === 'final' && note.final_audio_path) {
        const signedUrl = await createSignedMasterNoteAudioUrl(
          note.final_audio_path,
        )
        await playSingleAudio(signedUrl, token)
      } else {
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
        setPlayingNote(false)
      }
    } catch (err) {
      if (token !== playTokenRef.current) return
      console.error(err)
      setError(
        err instanceof Error && err.message === 'NO_CHUNKS_AVAILABLE'
          ? 'No hay audios para reproducir en esta nota maestra'
          : 'No se pudo reproducir la nota maestra',
      )
      setPlayingNote(false)
    }
  }

  const handleSaveName = async (): Promise<void> => {
    if (!note || note.state !== 'open' || savingName) return
    setSavingName(true)
    try {
      await updateMasterNoteName(note.id, nameDraft)
      const nextName = `NOTA MAESTRA: ${nameDraft.trim() || 'Sin título'}`
      setNote((prev) => (prev ? { ...prev, name: nextName } : prev))
      setIsEditingName(false)
      setError(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo actualizar el nombre de la nota')
    } finally {
      setSavingName(false)
    }
  }

  const handleCancelNameEdit = (): void => {
    if (!note) return
    setNameDraft(extractNameValue(note.name))
    setIsEditingName(false)
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
        Nota maestra
      </h2>
      <p className='mb-4 text-sm text-muted-foreground'>
        Duración acumulada: {formatDuration(note.total_duration_ms)} · Estado:{' '}
        {note.state === 'closed' ? 'cerrada' : 'abierta'}
      </p>
      {note.state === 'closed' && (
        <div className='mb-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => void handlePlayNote()}
          >
            {playingNote ? (
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
        </div>
      )}
      {error && <p className='mb-3 text-sm text-red-400'>{error}</p>}

      <Card className='mb-4 rounded-2xl'>
        <CardContent className='space-y-2 text-sm'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-muted-foreground'>Nombre:</span>
            {!isEditingName && <span>{note.name}</span>}

            {isEditingName ? (
              <form
                className='flex min-w-0 flex-1 items-center gap-1.5'
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleSaveName()
                }}
              >
                <div className='flex min-w-0 flex-1 items-center gap-1 px-2'>
                  <span className='text-muted-foreground text-nowrap'>
                    NOTA MAESTRA:
                  </span>
                  <Input
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    minLength={1}
                    required
                    autoFocus
                    className='h-8 border-0 px-1 shadow-none focus-visible:ring-0'
                    aria-label='Editar nombre de nota maestra'
                  />
                </div>
                <Button
                  type='submit'
                  variant='outline'
                  size='icon'
                  className='h-8 w-8'
                  disabled={savingName || note.state === 'closed'}
                  aria-label='Guardar nombre'
                >
                  <CheckIcon className='h-4 w-4' />
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  className='h-8 w-8'
                  onClick={handleCancelNameEdit}
                  disabled={savingName}
                  aria-label='Cancelar edición'
                >
                  <XIcon className='h-4 w-4' />
                </Button>
              </form>
            ) : (
              note.state === 'open' && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7'
                  aria-label='Editar nombre de nota maestra'
                  onClick={() => setIsEditingName(true)}
                >
                  <PencilIcon className='h-4 w-4' />
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {note.state === 'open' && (
        <Card className='mb-4 rounded-2xl'>
          <CardContent className='flex flex-wrap items-center justify-between gap-3'>
            <p className='text-sm text-muted-foreground'>
              Cierra la nota cuando esté entre 3:00 y 3:30.
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
                          className='flex items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5 text-xs'
                        >
                          <p className='truncate font-medium'>
                            {phrase?.generated_phrase || 'Sin frase registrada'}
                          </p>
                          <span className='shrink-0 text-muted-foreground'>
                            {formatDuration(chunk.duration_ms)}
                          </span>
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
                      <div>
                        <div className='flex items-center gap-2'>
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
                      <Button asChild size='sm'>
                        <Link
                          to={`${DASHBOARD_ROUTES.masterNotes}/note/${note.id}/activate/${item.id}`}
                        >
                          {isActivated ? 'ACTIVAR DE NUEVO' : 'ACTIVAR'}
                        </Link>
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
    </section>
  )
}
