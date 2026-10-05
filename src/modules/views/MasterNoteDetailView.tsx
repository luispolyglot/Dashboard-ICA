import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  MicIcon,
  PlayIcon,
  SearchIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { MasterNoteProgressBar } from '../components/MasterNoteProgressBar'
import { IcaDeletionWarningDialog } from '../components/IcaDeletionWarningDialog'
import {
  ErrorNote,
  MENU_CONTENT_CLASS,
  MENU_ITEM_CLASS,
  NotePlayerControls,
  NoteNumberTile,
  RoundActionButton,
  formatDuration,
  formatShortDate,
  moreMenuTrigger,
} from '../components/MasterNoteGameUi'
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
import { getMetaTrackerLevelColor } from '../components/MetaTracker/colors'
import { fetchPhraseVoiceActivations } from '../services/phraseVoiceActivations'
import { useSharedMasterNotePlayback } from '../components/MasterNotePlaybackProvider'
import { NotaDesafianteOverlay } from '../components/NotaDesafiante/NotaDesafianteOverlay'
import { NotaDesafianteCard } from '../components/NotaDesafiante/NotaDesafianteCard'
import { CHALLENGE_NOTE_MIN_CLOSED_NOTES } from '../game/rules'
import { useClosedMasterNotes } from '../game/useClosedMasterNotes'
import {
  useChallengeUnlock,
  useOnChallengeUnlocked,
} from '../services/challengeUnlocks'
import {
  useChallengeEnabled,
  type ChallengePhraseInput,
} from '../services/challengeChunks'
import type {
  MasterNote,
  MasterNoteChunk,
  PhraseGenerationEntry,
} from '../types'
import { formatDate } from '../utils'
import { t, tn } from '@/i18n'
import { TargetGlyph, TrophyIcon } from '../game/icons'
import {
  EmptyState,
  GamePage,
  GameProgress,
  IconTile,
  PageTitle,
  Panel,
  Pill,
  RowGroup,
  SectionLabel,
  tone,
} from '../game/ui'

type MasterNoteDetailViewProps = {
  noteId: string
  targetLang: string
  todayVoiceActivationsCount: number
}

const MIN_DURATION_MS = MASTER_NOTE_COMPLETE_DURATION_MS
/** Frases que enseña de golpe la lista «Elegir otra frase» (luego, «Ver más frases»). */
const CHOOSER_PAGE_SIZE = 8

type CompletionCelebration = {
  noteLabel: string
  nextNoteLabel: string | null
  coachNotified: boolean
}

/** Pastilla del nivel con el que se cerró la nota (B1, B2...), con su color. */
function LevelPill({ level }: { level: string }) {
  const color = getMetaTrackerLevelColor(level)
  return (
    <span
      className='inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] leading-5 font-extrabold'
      style={{
        background: `color-mix(in oklab, ${color} 16%, var(--card))`,
        color: `color-mix(in oklab, ${color} 70%, var(--foreground))`,
      }}
    >
      {level}
    </span>
  )
}

/** Palabras de origen de la frase (salen de la I: azul), con "Ya activada" delante si toca. */
function SourceWords({ words, activated = false }: { words: string[] | null | undefined; activated?: boolean }) {
  if (!activated && (!words || words.length === 0)) return null
  return (
    <span className='mt-2 flex flex-wrap gap-1.5'>
      {activated ? (
        <Pill tone='a'>
          <MicIcon className='size-3' strokeWidth={3} aria-hidden='true' />
          {t('Ya activada')}
        </Pill>
      ) : null}
      {(words || []).map((word) => (
        <Pill key={word} tone='i'>
          {word}
        </Pill>
      ))}
    </span>
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
  } = useSharedMasterNotePlayback()

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
          setError(t('No se encontró la nota maestra'))
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
        setError(t('No se pudo cargar la nota maestra'))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [noteId, targetLang])

  useEffect(() => {
    if (searchParams.get('rerecordUpdated') !== '1') return

    toast.success(t('Regrabación guardada correctamente.'))

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
  const challengeEnabled = useChallengeEnabled()
  const challengeUnlock = useChallengeUnlock(
    user?.id,
    note?.id,
    note?.total_duration_ms || 0,
    challengeEnabled,
  )
  // Solo las notas cerradas tienen nota desafiante (para contar la escucha y para empezarla).
  const noteClosed = note?.state === 'closed'
  // Y hace falta tener al menos 2 notas maestras terminadas en este idioma.
  const { count: closedNotesCount } = useClosedMasterNotes(
    note?.target_lang || targetLang,
    note?.native_lang || undefined,
  )
  const enoughClosedNotes =
    closedNotesCount !== null &&
    closedNotesCount >= CHALLENGE_NOTE_MIN_CLOSED_NOTES
  const hasChallengePhrases =
    challengeEnabled && challengePhrases.length > 0 && enoughClosedNotes
  const challengeLockedByCount =
    challengeEnabled &&
    challengePhrases.length > 0 &&
    noteClosed &&
    closedNotesCount !== null &&
    !enoughClosedNotes
  const showChallenge = hasChallengePhrases && noteClosed

  const openChallenge = useCallback((): void => {
    stop()
    setChallengeOpen(true)
  }, [stop])

  useOnChallengeUnlocked(
    useCallback(
      (unlockedNoteId: string) => {
        if (!note || unlockedNoteId !== note.id || !showChallenge) return
        toast.success(t('Nota desafiante desbloqueada'), {
          description: t('Ya puedes ponerte a prueba con las frases de esta nota.'),
          action: { label: t('Empezar'), onClick: openChallenge },
          duration: 10000,
        })
      },
      [note, openChallenge, showChallenge],
    ),
  )

  // Desde la lista de notas (?challenge=1): abrir el desafío directamente si ya está desbloqueado.
  // Mientras carga se muestra ya la pantalla del desafío, para no ver la página de la nota un instante.
  const [pendingAutoChallenge, setPendingAutoChallenge] = useState(
    () => searchParams.get('challenge') === '1',
  )
  useEffect(() => {
    if (!pendingAutoChallenge || loading) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('challenge')
    setSearchParams(nextParams, { replace: true })
    if (note && showChallenge && challengeUnlock.unlocked) setChallengeOpen(true)
    setPendingAutoChallenge(false)
  }, [
    challengeUnlock.unlocked,
    loading,
    note,
    pendingAutoChallenge,
    searchParams,
    setSearchParams,
    showChallenge,
  ])

  const handlePlayNote = async (): Promise<void> => {
    if (!note) return
    if (playingNoteId === note.id) return
    try {
      await play(note, chunks.length)
      clearError()
      setError(null)
    } catch (err) {
      console.error(err)
      setError(t('No se pudo reproducir la nota maestra'))
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
      setError(t('No se pudo cerrar la nota maestra'))
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
      setError(t('No se pudo eliminar la nota maestra'))
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
      setError(t('No se pudo descargar la nota maestra'))
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
      setError(t('No se pudo eliminar la frase activada de esta nota'))
    } finally {
      setRemovingChunkId(null)
      setChunkDeleteCandidate(null)
    }
  }

  // Frases grabadas en esta nota (desplegable) y la próxima frase para grabar:
  // la más reciente que aún no se ha grabado (primero las que no se han activado nunca).
  const [recordedOpen, setRecordedOpen] = useState(false)
  const [chooserOpen, setChooserOpen] = useState(false)
  const [chooserLimit, setChooserLimit] = useState(CHOOSER_PAGE_SIZE)
  const chooserRef = useRef<HTMLDivElement | null>(null)
  const nextPhrase = useMemo(() => {
    const candidates = phrases.filter((item) => !activatedInThisNote.has(item.id))
    return (
      candidates.find((item) => (activationsByPhrase[item.id] || []).length === 0) ||
      candidates[0] ||
      null
    )
  }, [activatedInThisNote, activationsByPhrase, phrases])

  if (pendingAutoChallenge) {
    // Mismo fondo que el desafío: se pasa de la lista al desafío sin ver nada en medio
    return (
      <div className='fixed inset-0 z-100 flex flex-col items-center justify-center gap-5 bg-background px-6 text-center text-foreground'>
        <span className='ica-bob'>
          <TargetGlyph size={84} />
        </span>
        <p className='m-0 font-display text-3xl font-black tracking-tight'>{t('Preparando tu desafío…')}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <GamePage>
        <p className='sr-only'>{t('Cargando nota maestra...')}</p>
        <div className='flex items-center gap-3' aria-hidden='true'>
          <div className='size-13 animate-pulse rounded-2xl bg-muted' />
          <div className='h-8 w-52 animate-pulse rounded-xl bg-muted' />
        </div>
        <div className='h-80 animate-pulse rounded-3xl bg-muted' aria-hidden='true' />
        <div className='h-44 animate-pulse rounded-3xl bg-muted' aria-hidden='true' />
      </GamePage>
    )
  }

  if (!note) {
    return (
      <GamePage>
        <EmptyState
          icon={
            <IconTile tone='bad' size={64}>
              <MicIcon className='size-8' strokeWidth={2.4} />
            </IconTile>
          }
          title={t('No se encontró la nota maestra.')}
        />
      </GamePage>
    )
  }

  const closed = note.state === 'closed'
  const label = formatMasterNoteLabel(note.name)
  const isPlayingThis = playingNoteId === note.id
  const a = tone('a')
  // En «Elegir otra frase» no se repite la que ya sale arriba.
  const otherPhrases = visiblePhrases.filter((item) => item.id !== nextPhrase?.id)
  const activateHref = (phraseId: string): string =>
    `${DASHBOARD_ROUTES.masterNotes}/note/${note.id}/activate/${phraseId}`
  const rerecordHref = (chunk: MasterNoteChunk): string =>
    `${DASHBOARD_ROUTES.masterNotes}/note/${note.id}/activate/${chunk.phrase_generation_id}?mode=rerecord&chunkId=${chunk.id}`

  // Más opciones: descargar y eliminar (se esconden mientras suena la nota, como antes).
  const menu = !isPlayingThis ? (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{moreMenuTrigger()}</DropdownMenuTrigger>
      <DropdownMenuContent align='end' className={MENU_CONTENT_CLASS}>
        {closed && (
          <>
            <DropdownMenuItem
              className={MENU_ITEM_CLASS}
              disabled={downloading}
              onSelect={() => void handleDownloadNote()}
            >
              <DownloadIcon strokeWidth={2.4} />
              {t('Descargar nota maestra')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          variant='destructive'
          className={MENU_ITEM_CLASS}
          disabled={deleting}
          onSelect={() => setConfirmDeleteOpen(true)}
        >
          <Trash2Icon strokeWidth={2.4} />
          {t('Eliminar nota maestra')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  const player = isPlayingThis ? (
    <NotePlayerControls
      className='mt-5 w-full'
      positionSec={positionSec}
      durationSec={durationSec}
      isPaused={isPaused}
      onSeekBack={seekBack10}
      onTogglePause={togglePause}
      onSeekForward={seekForward10}
    />
  ) : null

  // Nota desafiante (bloqueada o lista). En una nota abierta va al final, para no distraer.
  const challengeSection = (
    <>
        {challengeLockedByCount && (
          <Panel className='flex items-start gap-4'>
            <IconTile tone='neutral' size={48}>
              <span className='opacity-45 grayscale'>
                <TargetGlyph size={30} />
              </span>
            </IconTile>
            <div className='min-w-0 flex-1'>
              <p className='m-0 text-sm font-bold'>
                {t('La nota desafiante se abre cuando tengas {min} notas maestras terminadas (llevas {n}).', { min: CHALLENGE_NOTE_MIN_CLOSED_NOTES, n: closedNotesCount ?? 0 })}
              </p>
              <GameProgress
                className='mt-2.5'
                value={(closedNotesCount || 0) / CHALLENGE_NOTE_MIN_CLOSED_NOTES}
                color='var(--ica-gold)'
                height={10}
              />
            </div>
          </Panel>
        )}
        {hasChallengePhrases && (
          <NotaDesafianteCard
            noteClosed={noteClosed}
            progress={challengeUnlock.progress}
            unlocked={noteClosed && challengeUnlock.unlocked}
            isPlayingThisNote={isPlayingThis}
            onListen={() => void handlePlayNote()}
            onStart={openChallenge}
          />
        )}
    </>
  )

  return (
    <GamePage>
      <PageTitle
        icon={<NoteNumberTile name={note.name} closed={closed} size={52} />}
        right={menu}
        subtitle={
          <span className='mt-1 flex flex-wrap items-center gap-1.5'>
            <Pill tone={closed ? 'gold' : 'ok'}>{closed ? t('Cerrada') : t('Abierta')}</Pill>
            {note.closed_level ? <LevelPill level={note.closed_level} /> : null}
            <span className='tabular-nums'>{formatDuration(note.total_duration_ms)}</span>
            {closed && note.closed_at ? (
              <span aria-label={t('Cerrada el {date}', { date: formatDate(note.closed_at) })}>· {formatShortDate(note.closed_at)}</span>
            ) : null}
          </span>
        }
      >
        {label}
      </PageTitle>

      {error || playbackError ? <ErrorNote>{error || playbackError}</ErrorNote> : null}

      {closed ? (
        // Nota terminada: escucharla es lo principal (y abre su nota desafiante).
        <Panel tone='a' className='flex flex-col items-center p-6 text-center'>
          <RoundActionButton
            size={104}
            onClick={isPlayingThis ? stop : () => void handlePlayNote()}
            disabled={!isPlayingThis && !canPlayNote}
            ariaLabel={isPlayingThis ? t('Detener') : t('Escuchar')}
            live={isPlayingThis && !isPaused}
          >
            {isPlayingThis ? (
              <SquareIcon className='size-9 fill-current' strokeWidth={2.4} />
            ) : (
              <PlayIcon className='ml-1.5 size-12 fill-current' strokeWidth={2.4} />
            )}
          </RoundActionButton>
          <p className='m-0 mt-6 text-xl font-black tracking-tight'>
            {isPlayingThis ? (isPaused ? t('En pausa') : t('Escuchando tu nota…')) : t('Escucha tu nota maestra')}
          </p>
          <p className='m-0 mt-1 text-sm font-semibold text-muted-foreground'>
            {formatDuration(note.total_duration_ms)} · {tn(chunks.length, '{n} frase con tu voz', '{n} frases con tu voz')}
          </p>
          {player}
        </Panel>
      ) : (
        // Nota abierta: progreso hasta 3:00 y el micro grande para grabar la siguiente frase.
        <Panel tone='a' className='p-5'>
          <MasterNoteProgressBar noteName={note.name} savedMs={note.total_duration_ms} showName={false} />
          {nextPhrase ? (
            // La próxima frase, bien grande, y un solo botón para grabarla.
            <div className='mt-5 rounded-2xl bg-card px-4 py-4'>
              <p className='m-0 text-xs font-extrabold tracking-[0.08em] uppercase' style={{ color: a.ink }}>
                {t('Tu próxima frase')}
              </p>
              <p className='m-0 mt-1.5 text-xl leading-snug font-black'>
                «{nextPhrase.generated_phrase || t('Sin frase registrada')}»
              </p>
              {nextPhrase.translation ? (
                <p className='m-0 mt-1 text-sm font-semibold text-muted-foreground'>{nextPhrase.translation}</p>
              ) : null}
            </div>
          ) : (
            <p className='m-0 mt-5 text-center text-sm font-semibold text-muted-foreground'>
              {t('No quedan frases por grabar. Crea una frase nueva en la C y vuelve para grabarla.')}
            </p>
          )}
          {nextPhrase ? (
            canActivateMorePhrases ? (
              <Button asChild size='xl' variant='a' className='mt-4 w-full'>
                <Link to={activateHref(nextPhrase.id)}>
                  <MicIcon className='size-5' strokeWidth={2.6} />
                  {t('Grabar esta frase')}
                </Link>
              </Button>
            ) : (
              <Button type='button' size='xl' variant='outline' className='mt-4 w-full' disabled>
                {t('Límite de hoy alcanzado')}
              </Button>
            )
          ) : null}
          {phrases.some((item) => !activatedInThisNote.has(item.id) && item.id !== nextPhrase?.id) ? (
            <button
              type='button'
              className='mt-3 block w-full text-center text-sm font-extrabold underline-offset-4 hover:underline'
              style={{ color: a.ink }}
              aria-expanded={chooserOpen}
              onClick={() => {
                setChooserOpen(true)
                window.requestAnimationFrame(() =>
                  chooserRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                )
              }}
            >
              {t('Elegir otra frase')}
            </button>
          ) : null}
          {canClose ? (
            // Notas antiguas que ya pasaron de 3:00 sin cerrarse: se completan con un toque.
            <Button
              type='button'
              size='xl'
              variant='success'
              className='mt-5 w-full'
              onClick={() => void handleCloseNote()}
              disabled={closing}
            >
              {closing ? t('Completando...') : t('Completar nota maestra')}
            </Button>
          ) : (
            <p className='m-0 mt-4 text-center text-xs font-semibold text-muted-foreground'>
              {t('Se completa sola cuando guardes la frase que la lleve a 3:00.')}
            </p>
          )}
          {isPlayingThis ? (
            <div
              className='mt-5 border-t-2 pt-4'
              style={{ borderColor: `color-mix(in oklab, ${a.solid} 25%, transparent)` }}
            >
              <div className='flex items-center justify-between gap-2'>
                <p className='ica-label m-0'>{t('Escuchando lo grabado')}</p>
                <Button type='button' size='sm' variant='outline' onClick={stop}>
                  <SquareIcon className='fill-current' strokeWidth={2.4} />
                  {t('Detener')}
                </Button>
              </div>
              {player}
            </div>
          ) : canPlayNote ? (
            <Button type='button' size='lg' variant='outline' className='mt-4 w-full' onClick={() => void handlePlayNote()}>
              <PlayIcon className='size-4 fill-current' strokeWidth={2.4} />
              {t('Escuchar lo grabado')}
            </Button>
          ) : null}
        </Panel>
      )}

      {/* Nota terminada: su nota desafiante va justo debajo */}
      {closed ? challengeSection : null}
      {challengeOpen && (
        <NotaDesafianteOverlay
          open={challengeOpen}
          noteId={note.id}
          noteName={note.name}
          phrases={challengePhrases}
          targetLang={note.target_lang || targetLang}
          nativeLang={note.native_lang || 'Español'}
          onClose={() => setChallengeOpen(false)}
        />
      )}

      <Dialog
        open={Boolean(celebration)}
        onOpenChange={(open) => {
          if (!open) setCelebration(null)
        }}
      >
        <DialogContent className='text-center sm:max-w-sm'>
          <DialogHeader className='items-center text-center'>
            <div className='ica-pop mb-1 flex justify-center' aria-hidden='true'>
              <TrophyIcon size={76} />
            </div>
            <DialogTitle className='pr-0 font-display text-2xl font-black tracking-tight'>
              {t('{note} completada', { note: celebration?.noteLabel ?? '' })}
            </DialogTitle>
            <DialogDescription className='text-base font-semibold text-balance'>
              {celebration?.nextNoteLabel
                ? t('Tu próxima frase empezará la {note}.', { note: celebration.nextNoteLabel })
                : t('Tu próxima frase empezará una nueva Nota Maestra.')}
            </DialogDescription>
          </DialogHeader>
          {celebration?.coachNotified && (
            <p
              className='m-0 rounded-2xl px-4 py-3 text-sm font-bold'
              style={{ background: tone('i').soft, color: tone('i').ink }}
            >
              {t('Hemos avisado a tu coach para que te dé feedback de pronunciación.')}
            </p>
          )}
          <DialogFooter className='flex-col gap-3 sm:flex-col'>
            <Button type='button' size='xl' variant='a' className='w-full' onClick={() => setCelebration(null)}>
              {t('¡Genial!')}
            </Button>
            {showChallenge && (
              <Button
                type='button'
                size='lg'
                variant='outline'
                className='h-auto min-h-11 w-full py-2 whitespace-normal'
                onClick={() => {
                  setCelebration(null)
                  if (challengeUnlock.unlocked) {
                    openChallenge()
                  } else {
                    void handlePlayNote()
                  }
                }}
              >
                {challengeUnlock.unlocked ? (
                  <>
                    <TargetGlyph size={20} />
                    {t('Empezar nota desafiante')}
                  </>
                ) : (
                  <>
                    <PlayIcon className='size-4 fill-current' strokeWidth={2.4} />
                    {t('Escúchala y desbloquea su nota desafiante')}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {closed ? (
        <div>
          <SectionLabel
            right={
              <span className='text-xs font-extrabold text-muted-foreground tabular-nums'>
                {tn(activatedPhrasesInThisNote.length, '{n} frase', '{n} frases')}
              </span>
            }
          >
            {t('Frases de esta nota')}
          </SectionLabel>
          {activatedPhrasesInThisNote.length === 0 ? (
            <EmptyState className='py-6' title={t('No hay frases activadas en esta nota.')} />
          ) : (
            <RowGroup>
              {activatedPhrasesInThisNote.map(({ chunk, phrase }, index) => (
                <div key={chunk.id} className='flex items-start gap-3 py-3.5'>
                  <span
                    className='mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl text-sm font-black tabular-nums'
                    style={{ background: a.soft, color: a.ink }}
                  >
                    {index + 1}
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block text-base leading-snug font-extrabold'>
                      {phrase?.generated_phrase || t('Sin frase registrada')}
                    </span>
                    <span className='mt-0.5 block text-sm font-semibold text-muted-foreground'>
                      {phrase?.translation || t('Sin traducción')}
                    </span>
                    <span className='mt-1 block text-xs font-bold text-muted-foreground tabular-nums'>
                      {formatDuration(chunk.duration_ms)}
                    </span>
                  </span>
                  <Button asChild type='button' size='sm' variant='outline' className='shrink-0 px-2.5 sm:px-3'>
                    <Link to={rerecordHref(chunk)} aria-label={t('Regrabar: {phrase}', { phrase: phrase?.generated_phrase || t('frase') })}>
                      <MicIcon strokeWidth={2.6} />
                      <span className='hidden sm:inline'>{t('Regrabar')}</span>
                    </Link>
                  </Button>
                </div>
              ))}
            </RowGroup>
          )}
        </div>
      ) : (
        <div className='flex flex-col gap-6'>
          {/* Frases ya grabadas en esta nota (se despliegan) */}
          <div className='ica-group'>
            <button
              type='button'
              aria-expanded={recordedOpen}
              onClick={() => setRecordedOpen((value) => !value)}
              className='flex w-full items-center gap-3 py-3 text-left'
            >
              <IconTile tone='ok' size={40} className='rounded-xl'>
                <CheckIcon className='size-5' strokeWidth={3} />
              </IconTile>
              <span className='min-w-0 flex-1 leading-tight font-extrabold'>
                {t('Frases activadas en esta nota ({n})', { n: activatedPhrasesInThisNote.length })}
              </span>
              <ChevronDownIcon
                className={cn('size-5 shrink-0 text-muted-foreground transition-transform', recordedOpen && 'rotate-180')}
                strokeWidth={2.6}
              />
            </button>
            {recordedOpen && (
              <div className='divide-y-2 divide-border border-t-2 border-border'>
                {activatedPhrasesInThisNote.length === 0 && (
                  <p className='m-0 py-3 text-sm font-semibold text-muted-foreground'>
                    {t('Aún no activaste frases en esta nota.')}
                  </p>
                )}
                {activatedPhrasesInThisNote.map(({ chunk, phrase }) => (
                  <div key={chunk.id} className='flex items-center gap-2 py-2.5'>
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-sm font-bold'>
                        {phrase?.generated_phrase || t('Sin frase registrada')}
                      </span>
                      <span className='block text-xs font-bold text-muted-foreground tabular-nums'>
                        {formatDuration(chunk.duration_ms)}
                      </span>
                    </span>
                    {note.state === 'open' && (
                      <Button asChild type='button' size='sm' variant='outline'>
                        <Link to={rerecordHref(chunk)}>{t('Regrabar')}</Link>
                      </Button>
                    )}
                    {note.state === 'open' && (
                      <Button
                        type='button'
                        size='icon-sm'
                        variant='ghost'
                        aria-label={t('Eliminar frase activada de esta nota')}
                        disabled={Boolean(removingChunkId)}
                        onClick={() => setChunkDeleteCandidate(chunk)}
                        className='text-[var(--ica-bad-ink)]'
                      >
                        <Trash2Icon className='size-4' strokeWidth={2.4} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Elegir otra frase para activar (plegado: la próxima frase ya sale arriba) */}
          <div ref={chooserRef} className='ica-group scroll-mt-4'>
            <button
              type='button'
              aria-expanded={chooserOpen}
              onClick={() => setChooserOpen((value) => !value)}
              className='flex w-full items-center gap-3 py-3 text-left'
            >
              <IconTile tone='a' size={40} className='rounded-xl'>
                <SearchIcon className='size-5' strokeWidth={2.8} />
              </IconTile>
              <span className='min-w-0 flex-1 leading-tight font-extrabold'>{t('Elegir otra frase')}</span>
              <ChevronDownIcon
                className={cn('size-5 shrink-0 text-muted-foreground transition-transform', chooserOpen && 'rotate-180')}
                strokeWidth={2.6}
              />
            </button>
            {chooserOpen && (
              <div className='border-t-2 border-border pt-4 pb-3'>
                <div className='relative'>
                  <SearchIcon
                    className='pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground'
                    strokeWidth={2.6}
                  />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('Buscar frase...')}
                    className='pl-10'
                  />
                </div>
                <label
                  className={cn(
                    'mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-extrabold transition-colors select-none',
                    onlyNotActivated ? '' : 'border-border text-muted-foreground',
                  )}
                  style={
                    onlyNotActivated
                      ? { background: a.soft, borderColor: `color-mix(in oklab, ${a.solid} 45%, transparent)`, color: a.ink }
                      : undefined
                  }
                >
                  <input
                    type='checkbox'
                    checked={onlyNotActivated}
                    onChange={(event) => setOnlyNotActivated(event.target.checked)}
                    className='sr-only'
                  />
                  <span
                    className='flex size-4 items-center justify-center rounded-[5px] border-2'
                    style={
                      onlyNotActivated
                        ? { background: a.solid, borderColor: a.solid, color: '#fff' }
                        : { borderColor: 'var(--border-strong, var(--border))' }
                    }
                    aria-hidden='true'
                  >
                    {onlyNotActivated ? <CheckIcon className='size-3' strokeWidth={3.5} /> : null}
                  </span>
                  {t('Mostrar solo frases NO activadas')}
                </label>

                {otherPhrases.length > 0 ? (
                  <RowGroup className='mt-4'>
                    {otherPhrases.slice(0, chooserLimit).map((item) => {
                      const isActivated = (activationsByPhrase[item.id] || []).length > 0

                      return (
                        <div key={item.id} className='flex items-center gap-3 py-3.5'>
                          <span className='min-w-0 flex-1'>
                            <span className='block text-base leading-snug font-extrabold'>
                              {item.generated_phrase || t('Sin frase registrada')}
                            </span>
                            <span className='mt-0.5 block text-sm font-semibold text-muted-foreground'>
                              {item.translation || t('Sin traducción')}
                            </span>
                            <SourceWords words={item.source_words} activated={isActivated} />
                          </span>
                          {canActivateMorePhrases ? (
                            <span className='flex shrink-0 flex-col items-center gap-1.5'>
                              <RoundActionButton
                                size={48}
                                to={activateHref(item.id)}
                                ariaLabel={t('Activar: {phrase}', { phrase: item.generated_phrase || t('frase') })}
                              >
                                <MicIcon className='size-5' strokeWidth={2.6} />
                              </RoundActionButton>
                              <span className='text-[11px] font-extrabold' style={{ color: a.ink }}>
                                {t('Activar')}
                              </span>
                            </span>
                          ) : (
                            <Button type='button' size='sm' variant='outline' disabled>
                              {t('Límite alcanzado')}
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </RowGroup>
                ) : (
                  <EmptyState className='py-6' title={t('No hay frases para mostrar.')} />
                )}
                {otherPhrases.length > chooserLimit ? (
                  <Button
                    type='button'
                    variant='outline'
                    className='mt-3 w-full'
                    onClick={() => setChooserLimit((value) => value + CHOOSER_PAGE_SIZE)}
                  >
                    {t('Ver más frases')}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
          {challengeSection}
        </div>
      )}

      <IcaDeletionWarningDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={() => void handleDeleteNote()}
        loading={deleting}
        title={t('Eliminar nota maestra')}
        resourceLabel={t('esta nota maestra y sus audios')}
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
        title={t('Eliminar audio activado')}
        resourceLabel={t('este audio activado')}
        resource='audio'
        resourceDates={[chunkDeleteCandidate?.created_at]}
        todayTotalCount={todayVoiceActivationsCount}
      />
    </GamePage>
  )
}
