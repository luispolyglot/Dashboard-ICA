import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  DownloadIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
  Volume2Icon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
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
import { MasterNoteProgressBar } from '../components/MasterNoteProgressBar'
import { IcaDeletionWarningDialog } from '../components/IcaDeletionWarningDialog'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  fetchPhraseHistoryByIds,
  fetchPhraseHistoryPage,
} from '../services/phraseHistory'
import {
  MASTER_NOTE_COMPLETE_DURATION_MS,
  closeMasterNote,
  deleteMasterNote,
  downloadMasterNoteAudio,
  fetchMasterNoteById,
  fetchMasterNoteChunks,
  fetchNextMasterNoteLabel,
  formatMasterNoteLabel,
  removeMasterNoteChunk,
} from '../services/masterNotes'
import {
  getMetaTrackerLevelColor,
  hexWithAlpha,
} from '../components/MetaTracker/colors'
import { fetchPhraseVoiceActivations } from '../services/phraseVoiceActivations'
import { useMasterNotePlayback } from '../hooks/useMasterNotePlayback'
import { NotaDesafianteOverlay } from '../components/NotaDesafiante/NotaDesafianteOverlay'
import { NotaDesafianteCard } from '../components/NotaDesafiante/NotaDesafianteCard'
import {
  useChallengeUnlock,
  useOnChallengeUnlocked,
} from '../services/challengeUnlocks'
import {
  isChallengeEnabled,
  type ChallengePhraseInput,
} from '../services/challengeChunks'
import type {
  MasterNote,
  MasterNoteChunk,
  PhraseGenerationEntry,
} from '../types'
import { formatDate } from '../utils'

type MasterNoteDetailViewProps = {
  noteId: string
  targetLang: string
  todayVoiceActivationsCount: number
}

const MIN_DURATION_MS = MASTER_NOTE_COMPLETE_DURATION_MS

type CompletionCelebration = {
  noteLabel: string
  nextNoteLabel: string | null
  coachNotified: boolean
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
  todayVoiceActivationsCount,
}: MasterNoteDetailViewProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [downloading, setDownloading] = useState(false)
  const [removingChunkId, setRemovingChunkId] = useState<string | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [chunkDeleteCandidate, setChunkDeleteCandidate] =
    useState<MasterNoteChunk | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const { user } = useAuth()
  const [celebration, setCelebration] = useState<CompletionCelebration | null>(
    null,
  )
  const celebrationHandledRef = useRef(false)

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
    const load = async (): Promise<void> => {
      setLoading(true)
      try {
        const [foundNote, phraseRows, chunkRows] = await Promise.all([
          fetchMasterNoteById(noteId, targetLang),
          fetchPhraseHistoryPage({ limit: 80, offset: 0, targetLang }),
          fetchMasterNoteChunks(noteId),
        ])

        if (!foundNote) {
          setError('No se encontró la nota maestra')
          setNote(null)
          setPhrases([])
          setChunks([])
          return
        }

        const latestPhraseRows = phraseRows.items
        const latestPhraseIds = new Set(latestPhraseRows.map((item) => item.id))
        const missingChunkPhraseIds = Array.from(
          new Set(
            chunkRows
              .map((chunk) => chunk.phrase_generation_id)
              .filter((id) => !latestPhraseIds.has(id)),
          ),
        )

        const missingPhrases = await fetchPhraseHistoryByIds(missingChunkPhraseIds)
        const phraseById = new Map<string, PhraseGenerationEntry>()
        for (const row of latestPhraseRows) {
          phraseById.set(row.id, row)
        }
        for (const row of missingPhrases) {
          if (!phraseById.has(row.id)) {
            phraseById.set(row.id, row)
          }
        }

        const mergedPhrases = Array.from(phraseById.values())

        const activationMap = await fetchPhraseVoiceActivations(
          mergedPhrases.map((item) => item.id),
        )

        const totalDuration = chunkRows.reduce(
          (sum, chunk) => sum + chunk.duration_ms,
          0,
        )

        setNote({ ...foundNote, total_duration_ms: totalDuration })
        setPhrases(mergedPhrases)
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

  useEffect(() => {
    if (searchParams.get('rerecordUpdated') !== '1') return

    toast.success('Regrabación guardada correctamente.')

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('rerecordUpdated')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  // 🎉 Celebración al completarse la nota (llegamos aquí con ?completed=1 tras guardar el audio)
  useEffect(() => {
    if (searchParams.get('completed') !== '1') return
    if (!note || celebrationHandledRef.current) return
    celebrationHandledRef.current = true

    const coachNotified = searchParams.get('coach') === '1'
    const noteLabel = formatMasterNoteLabel(note.name)
    setCelebration({ noteLabel, nextNoteLabel: null, coachNotified })

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('completed')
    nextParams.delete('coach')
    setSearchParams(nextParams, { replace: true })

    confetti({
      particleCount: 120,
      spread: 160,
      startVelocity: 26,
      ticks: 260,
      origin: { x: 0.5, y: 0.35 },
      zIndex: 1300,
    })

    const lang = note.target_lang || targetLang
    const nativeLang = note.native_lang || ''
    if (lang && nativeLang) {
      void fetchNextMasterNoteLabel(lang, nativeLang)
        .then((nextNoteLabel) => {
          setCelebration((prev) => (prev ? { ...prev, nextNoteLabel } : prev))
        })
        .catch(() => {})
    }
  }, [note, searchParams, setSearchParams, targetLang])

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

  // Nota desafiante: las frases grabadas en esta nota, en su orden.
  const challengePhrases = useMemo<ChallengePhraseInput[]>(
    () =>
      activatedPhrasesInThisNote
        .map(({ phrase }) => ({
          phraseId: phrase?.id || '',
          target: (phrase?.generated_phrase || '').trim(),
          native: (phrase?.translation || '').trim(),
        }))
        .filter((item) => item.phraseId && item.target && item.native),
    [activatedPhrasesInThisNote],
  )

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
  const canActivateMorePhrases = !!note && note.state === 'open'
  const canPlayNote = !!note && canPlay(note, chunks.length)

  // Nota desafiante: se desbloquea al escuchar el 80 % de esta nota hoy
  const challengeUnlock = useChallengeUnlock(
    user?.id,
    note?.id,
    note?.total_duration_ms || 0,
  )
  const showChallenge = isChallengeEnabled && challengePhrases.length > 0

  const openChallenge = useCallback((): void => {
    stop()
    setChallengeOpen(true)
  }, [stop])

  useOnChallengeUnlocked(
    useCallback(
      (unlockedNoteId: string) => {
        if (!note || unlockedNoteId !== note.id || !showChallenge) return
        toast.success('🎯 Nota desafiante desbloqueada', {
          description: 'Ya puedes ponerte a prueba con las frases de esta nota.',
          action: { label: 'Empezar', onClick: openChallenge },
          duration: 10000,
        })
      },
      [note, openChallenge, showChallenge],
    ),
  )

  // Desde la lista de notas (?challenge=1): abrir el desafío directamente si ya está desbloqueado
  useEffect(() => {
    if (searchParams.get('challenge') !== '1') return
    if (!note || !showChallenge) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('challenge')
    setSearchParams(nextParams, { replace: true })
    if (challengeUnlock.unlocked) setChallengeOpen(true)
  }, [challengeUnlock.unlocked, note, searchParams, setSearchParams, showChallenge])

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
      const closeResult = await closeMasterNote(note.id)
      const noteLabel = formatMasterNoteLabel(note.name)
      setCelebration({
        noteLabel,
        nextNoteLabel: null,
        coachNotified: closeResult.coachingNotificationStatus === 'sent',
      })
      if (note.target_lang && note.native_lang) {
        void fetchNextMasterNoteLabel(note.target_lang, note.native_lang)
          .then((nextNoteLabel) => {
            setCelebration((prev) => (prev ? { ...prev, nextNoteLabel } : prev))
          })
          .catch(() => {})
      }
      setNote((prev) =>
        prev
          ? {
              ...prev,
              state: 'closed',
              close_type: 'temporal',
              closed_at: closeResult.closedAt,
              closed_level: closeResult.closedLevel,
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

  const handleDownloadNote = async (): Promise<void> => {
    if (!note || note.state !== 'closed' || downloading) return
    setDownloading(true)
    try {
      await downloadMasterNoteAudio(note)
      setError(null)
    } catch (err) {
      console.error(err)
      setError('No se pudo descargar la nota maestra')
    } finally {
      setDownloading(false)
    }
  }

  const handleRemoveActivatedPhrase = async (
    chunk: MasterNoteChunk,
  ): Promise<void> => {
    if (!note || note.state !== 'open' || removingChunkId) return
    setRemovingChunkId(chunk.id)
    try {
      const nextTotal = await removeMasterNoteChunk(note.id, chunk.id)
      const nextChunks = chunks.filter((item) => item.id !== chunk.id)
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
      setChunkDeleteCandidate(null)
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

  const levelColor = getMetaTrackerLevelColor(note.closed_level)

  return (
    <section className='mx-auto w-full max-w-4xl flex-1 px-5 pt-8 pb-24 lg:pb-8'>
      <div className='mb-1 flex flex-wrap items-center gap-2'>
        <h2 className='font-serif text-2xl lg:text-3xl font-bold'>
          {note.state === 'closed' ? `⭐ ${note.name}` : note.name}
        </h2>
        <Badge
          variant='outline'
          className={
            note.state === 'open'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-700'
          }
        >
          {note.state === 'open' ? 'Abierta' : 'Cerrada'}
        </Badge>
        {note.closed_level && (
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
            {note.closed_level}
          </Badge>
        )}
      </div>
      <p className='mb-4 text-sm text-muted-foreground'>
        Duracion: {formatDuration(note.total_duration_ms)}
        {note.state === 'closed'
          ? ` · Cerrada el: ${formatDate(note.closed_at)}`
          : ''}
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
              <Button type='button' onClick={stop}>
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
          {playingNoteId !== note.id && (
            <>
              {note.state === 'closed' && (
                <Button
                  type='button'
                  size='icon'
                  variant='outline'
                  aria-label='Descargar nota maestra'
                  onClick={() => void handleDownloadNote()}
                  disabled={downloading}
                >
                  <DownloadIcon className='size-4' />
                </Button>
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
            </>
          )}
        </div>
      </div>
      {showChallenge && (
        <NotaDesafianteCard
          progress={challengeUnlock.progress}
          unlocked={challengeUnlock.unlocked}
          isPlayingThisNote={playingNoteId === note.id}
          onListen={() => void handlePlayNote()}
          onStart={openChallenge}
        />
      )}
      {challengeOpen && (
        <NotaDesafianteOverlay
          open={challengeOpen}
          noteName={note.name}
          phrases={challengePhrases}
          targetLang={note.target_lang || targetLang}
          nativeLang={note.native_lang || 'Español'}
          onClose={() => setChallengeOpen(false)}
        />
      )}
      {(error || playbackError) && (
        <p className='mb-3 text-sm text-red-400'>{error || playbackError}</p>
      )}

      {note.state === 'open' && (
        <div className='mb-4 space-y-2'>
          <MasterNoteProgressBar
            noteName={note.name}
            savedMs={note.total_duration_ms}
          />
          {canClose ? (
            // Notas antiguas que ya pasaron de 3:00 sin cerrarse: se completan con un toque.
            <Button
              type='button'
              className='w-full sm:w-auto'
              onClick={() => void handleCloseNote()}
              disabled={closing}
            >
              {closing ? 'Completando...' : '🎉 Completar nota maestra'}
            </Button>
          ) : (
            <p className='text-xs text-muted-foreground'>
              Se completa sola cuando guardes la frase que la lleve a 3:00.
            </p>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(celebration)}
        onOpenChange={(open) => {
          if (!open) setCelebration(null)
        }}
      >
        <DialogContent className='text-center sm:max-w-sm'>
          <DialogHeader className='items-center text-center'>
            <div className='mb-1 text-5xl leading-none' aria-hidden='true'>
              🎉
            </div>
            <DialogTitle className='font-serif text-2xl'>
              {celebration?.noteLabel} completada
            </DialogTitle>
            <DialogDescription className='text-base text-balance'>
              {celebration?.nextNoteLabel
                ? `Tu próxima frase empezará la ${celebration.nextNoteLabel}.`
                : 'Tu próxima frase empezará una nueva Nota Maestra.'}
            </DialogDescription>
          </DialogHeader>
          {celebration?.coachNotified && (
            <p className='rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm'>
              📩 Hemos avisado a tu coach para que te dé feedback de
              pronunciación.
            </p>
          )}
          <DialogFooter className='flex-col gap-2 sm:flex-col'>
            <Button type='button' onClick={() => setCelebration(null)}>
              ¡Genial!
            </Button>
            {showChallenge && (
              <Button
                type='button'
                variant='secondary'
                onClick={() => {
                  setCelebration(null)
                  if (challengeUnlock.unlocked) {
                    openChallenge()
                  } else {
                    void handlePlayNote()
                  }
                }}
              >
                {challengeUnlock.unlocked
                  ? '🎯 Empezar nota desafiante'
                  : '▶ Escúchala y desbloquea su nota desafiante'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <div className='mb-0.5 flex items-center justify-between gap-2'>
                    <p className='text-xs text-muted-foreground'>
                      #{index + 1} · {formatDuration(chunk.duration_ms)}
                    </p>
                    <Button
                      asChild
                      type='button'
                      size='sm'
                      variant='ghost'
                      className='h-6 px-2 text-[11px]'
                    >
                      <Link
                        to={`${DASHBOARD_ROUTES.masterNotes}/note/${note.id}/activate/${chunk.phrase_generation_id}?mode=rerecord&chunkId=${chunk.id}`}
                      >
                        Regrabar
                      </Link>
                    </Button>
                  </div>
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
                                asChild
                                type='button'
                                size='sm'
                                variant='ghost'
                                className='h-6 px-2 text-[11px]'
                              >
                                <Link
                                  to={`${DASHBOARD_ROUTES.masterNotes}/note/${note.id}/activate/${chunk.phrase_generation_id}?mode=rerecord&chunkId=${chunk.id}`}
                                >
                                  Regrabar
                                </Link>
                              </Button>
                            )}
                            {note.state === 'open' && (
                              <Button
                                type='button'
                                size='icon'
                                variant='ghost'
                                className='h-6 w-6'
                                aria-label='Eliminar frase activada de esta nota'
                                disabled={Boolean(removingChunkId)}
                                onClick={() => setChunkDeleteCandidate(chunk)}
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
                        <p className='text-base text-muted-foreground'>
                          {item.translation || 'Sin traducción'}
                        </p>
                        {item.source_words && item.source_words.length > 0 && (
                          <div className='mt-2 flex flex-wrap gap-2'>
                            {item.source_words.map((word) => (
                              <span
                                key={word}
                                className='rounded-md bg-primary/30 px-2.5 py-0.5 text-xs font-semibold text-white'
                              >
                                {word}
                              </span>
                            ))}
                          </div>
                        )}
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
                            Activar
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

      <IcaDeletionWarningDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={() => void handleDeleteNote()}
        loading={deleting}
        title='Eliminar nota maestra'
        resourceLabel='esta nota maestra y sus audios'
        resource='audio'
        resourceDates={[
          note.created_at,
          note.closed_at,
          ...chunks.map((chunk) => chunk.created_at),
        ]}
        todayTotalCount={todayVoiceActivationsCount}
      />

      <IcaDeletionWarningDialog
        open={Boolean(chunkDeleteCandidate)}
        onOpenChange={(open) => {
          if (!open && !removingChunkId) setChunkDeleteCandidate(null)
        }}
        onConfirm={() => {
          if (!chunkDeleteCandidate) return
          void handleRemoveActivatedPhrase(chunkDeleteCandidate)
        }}
        loading={Boolean(removingChunkId)}
        title='Eliminar audio activado'
        resourceLabel='este audio activado'
        resource='audio'
        resourceDates={[chunkDeleteCandidate?.created_at]}
        todayTotalCount={todayVoiceActivationsCount}
      />
    </section>
  )
}
