import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AudioLinesIcon, ChevronRightIcon, ListMusicIcon, Loader2Icon, LockIcon, PauseIcon, PlayIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { NotaDesafianteOverlay } from '../components/NotaDesafiante/NotaDesafianteOverlay'
import { useDashboardContext } from '../context/DashboardContext'
import { TargetGlyph } from '../game/icons'
import { CHALLENGE_NOTE_MIN_CLOSED_NOTES } from '../game/rules'
import { EmptyState, GameProgress, GamePage, IconTile, PageTitle, Panel, SectionLabel, tone } from '../game/ui'
import { useClosedMasterNotes, type ClosedMasterNote } from '../game/useClosedMasterNotes'
import { useMasterNotePlayback } from '../hooks/useMasterNotePlayback'
import { useStopSharedMasterNote } from '../components/MasterNotePlaybackProvider'
import { useLoopedMasterNotePlayback } from '../hooks/useLoopedMasterNotePlayback'
import { MasterNotePlaylistPlayerDock } from '../components/MasterNotePlaylistPlayerDock'
import { speakNatural } from '../services/tts'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { useChallengeEnabled, type ChallengePhraseInput } from '../services/challengeChunks'
import { CHALLENGE_UNLOCK_RATIO, useChallengeUnlock } from '../services/challengeUnlocks'
import { fetchMasterNoteById, fetchMasterNoteChunks, fetchMasterNotes, formatMasterNoteLabel } from '../services/masterNotes'
import { fetchPhraseHistoryByIds } from '../services/phraseHistory'
import type { MasterNote } from '../types'

// Nota desafiante, desde Juegos: escuchas una nota maestra TERMINADA y, al llegar al 80 %,
// haces su desafío. Desde aquí no se entra en Activación (ni en la nota ni en sus frases).

const UNLOCK_PERCENT = Math.round(CHALLENGE_UNLOCK_RATIO * 100)

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

/** Anillo de progreso de escucha (0–1 hasta el 80 %). */
function ListenRing({ progress, unlocked, size = 56 }: { progress: number; unlocked: boolean; size?: number }) {
  const stroke = 6
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const gold = tone('gold')
  return (
    <span className='relative flex shrink-0 items-center justify-center' style={{ width: size, height: size }}>
      <svg width={size} height={size} className='absolute inset-0 -rotate-90' aria-hidden='true'>
        <circle cx={size / 2} cy={size / 2} r={r} fill='none' stroke='var(--muted)' strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill='none'
          stroke={unlocked ? gold.solid : gold.edge}
          strokeWidth={stroke}
          strokeLinecap='round'
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, unlocked ? 1 : progress))}
        />
      </svg>
      <TargetGlyph size={size * 0.5} />
    </span>
  )
}

function NoteCard({ note, nowPlaying }: { note: ClosedMasterNote; nowPlaying: boolean }) {
  const { user } = useAuth()
  const { progress, unlocked } = useChallengeUnlock(user?.id, note.id, note.totalDurationMs)
  return (
    <Link
      to={`${DASHBOARD_ROUTES.notaDesafiante}/${note.id}`}
      className={cn('flex items-center gap-3 py-3 transition-opacity active:opacity-70', nowPlaying && 'rounded-2xl')}
    >
      <ListenRing progress={progress} unlocked={unlocked} />
      <span className='min-w-0 flex-1'>
        <span className='flex min-w-0 items-center gap-1.5'>
          <span className='truncate font-extrabold'>{formatMasterNoteLabel(note.name)}</span>
          {nowPlaying ? (
            <span
              className='inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black tracking-wide uppercase'
              style={{ background: tone('gold').soft, color: tone('gold').ink }}
            >
              <AudioLinesIcon className='size-3' strokeWidth={3} aria-hidden='true' />
              {t('Sonando')}
            </span>
          ) : null}
        </span>
        <span className='block text-xs font-semibold text-muted-foreground'>
          {unlocked
            ? t('Abierta hasta el domingo')
            : t('Escuchado esta semana: {n} % de {max} %', { n: Math.round(progress * UNLOCK_PERCENT), max: UNLOCK_PERCENT })}
        </span>
      </span>
      {unlocked ? (
        <span
          className='shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold text-[#4a3200]'
          style={{ background: tone('gold').solid, boxShadow: `0 3px 0 ${tone('gold').edge}` }}
        >
          {t('Jugar')}
        </span>
      ) : (
        <ChevronRightIcon className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
      )}
    </Link>
  )
}

const ORDINALS = [
  'Primera nota maestra',
  'Segunda nota maestra',
  'Tercera nota maestra',
  'Cuarta nota maestra',
  'Quinta nota maestra',
  'Sexta nota maestra',
  'Séptima nota maestra',
  'Octava nota maestra',
  'Novena nota maestra',
  'Décima nota maestra',
]

/** Lo que dice la voz antes de cada nota: «Primera nota maestra», «Segunda nota maestra»… */
export function sequenceAnnouncement(index: number): string {
  return ORDINALS[index] ? t(ORDINALS[index]) : t('Nota maestra {n}', { n: index + 1 })
}

/** Dice la frase y espera a que termine (como mucho 5 segundos). */
function speakAndWait(text: string, langName: string): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    window.setTimeout(finish, 5000)
    try {
      speakNatural(text, langName, finish)
    } catch {
      finish()
    }
  })
}

/** Lista de notas maestras terminadas para hacer su nota desafiante. */
export function NotaDesafianteListView() {
  const { config } = useDashboardContext()
  const { notes, count } = useClosedMasterNotes(config?.targetLang, config?.nativeLang)
  const playable = (notes || []).filter((note) => note.totalDurationMs > 0)
  const ready = count !== null && count >= CHALLENGE_NOTE_MIN_CLOSED_NOTES
  const nativeLang = config?.nativeLang || 'Español'

  // Escuchar todas seguidas: de la primera a la última, con una voz que las presenta.
  const { play, stop, pause, resume, seekBack10, seekForward10, isPaused, playingNoteId, positionSec, durationSec } =
    useMasterNotePlayback()
  // This screen has its own player: a master note playing in the background stops.
  useStopSharedMasterNote()
  const [fullNotes, setFullNotes] = useState<MasterNote[]>([])
  useEffect(() => {
    if (!ready || !config?.targetLang) return
    let active = true
    void fetchMasterNotes(config.targetLang, config.nativeLang)
      .then((rows) => {
        if (active) setFullNotes(rows.filter((row) => row.state === 'closed'))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [config?.nativeLang, config?.targetLang, ready])
  const fullById = useMemo(() => new Map(fullNotes.map((note) => [note.id, note])), [fullNotes])
  // Orden de la escucha: de la más antigua a la más nueva.
  const sequenceIds = useMemo(
    () =>
      [...playable]
        .sort((x, y) => (x.closedAt || '').localeCompare(y.closedAt || ''))
        .map((note) => note.id)
        .filter((id) => fullById.has(id)),
    [fullById, playable],
  )

  const playNoteById = useCallback(
    async (noteId: string) => {
      const note = fullById.get(noteId)
      if (note) await play(note)
    },
    [fullById, play],
  )
  const announce = useCallback(
    async (kind: 'start' | 'step' | 'finish', index?: number) => {
      if (kind === 'finish') return
      stop()
      await speakAndWait(sequenceAnnouncement(index ?? 0), nativeLang)
    },
    [nativeLang, stop],
  )
  const sequence = useLoopedMasterNotePlayback({
    playingNoteId,
    isPaused,
    playNoteById,
    playTransitionCue: announce,
    pausePlayback: pause,
    resumePlayback: resume,
    seekBack10,
    seekForward10,
    resolveNowPlayingMetadata: (noteId) => {
      const note = fullById.get(noteId)
      return note ? { title: formatMasterNoteLabel(note.name), artist: t('Nota maestra'), album: 'ICADEMY' } : null
    },
    stopPlayback: stop,
  })
  const { setRepeatEnabled, stopLoop } = sequence
  // De seguido, no en bucle: al acabar la última, se para.
  useEffect(() => setRepeatEnabled(false), [setRepeatEnabled])
  // Al salir de la pantalla, deja de sonar (solo al salir, no en cada pintado).
  const stopLoopRef = useRef(stopLoop)
  stopLoopRef.current = stopLoop
  useEffect(() => () => stopLoopRef.current(true), [])

  const currentSequenceId = sequence.looping ? sequence.loopIds[sequence.loopIndex] : null
  const currentSequenceNote = currentSequenceId ? fullById.get(currentSequenceId) : null

  return (
    <GamePage className={sequence.looping ? 'pb-40' : undefined}>
      <PageTitle
        icon={
          <IconTile tone='gold' size={52}>
            <TargetGlyph size={34} />
          </IconTile>
        }
        subtitle={t('Escucha una nota maestra terminada y dila de memoria.')}
      >
        {t('Nota desafiante')}
      </PageTitle>

      {count === null ? (
        <div className='flex justify-center py-10 text-muted-foreground'>
          <Loader2Icon className='size-5 animate-spin' />
        </div>
      ) : !ready ? (
        <EmptyState
          icon={<LockIcon className='size-10 text-muted-foreground' strokeWidth={2.4} />}
          title={t('Aún no está abierta')}
          text={t('Se abre con {n} notas maestras terminadas (llevas {count}).', { n: CHALLENGE_NOTE_MIN_CLOSED_NOTES, count })}
        />
      ) : (
        <div className='flex flex-col gap-5'>
          {/* Escuchar todas seguidas */}
          <button
            type='button'
            onClick={() => {
              if (sequence.looping) {
                if (isPaused) void resume()
                else pause()
                return
              }
              void sequence.startLoop(sequenceIds)
            }}
            disabled={sequenceIds.length === 0}
            className='ica-press flex w-full items-center gap-3 rounded-3xl px-4 py-3.5 text-left disabled:opacity-60'
            style={{ background: tone('gold').solid, boxShadow: `0 5px 0 ${tone('gold').edge}`, color: '#4a3200' }}
          >
            <span className='flex size-12 shrink-0 items-center justify-center rounded-full bg-white/45'>
              {sequence.looping && !isPaused ? (
                <PauseIcon className='size-6' strokeWidth={2.6} fill='currentColor' aria-hidden='true' />
              ) : (
                <PlayIcon className='ml-0.5 size-6' strokeWidth={2.6} fill='currentColor' aria-hidden='true' />
              )}
            </span>
            <span className='min-w-0 flex-1'>
              <span className='block text-base leading-tight font-black'>
                {sequence.looping ? t('Escuchando todas seguidas') : t('Escuchar todas seguidas')}
              </span>
              <span className='block text-xs font-bold opacity-80'>
                {sequence.looping
                  ? t('{n} de {total}', { n: sequence.loopIndex + 1, total: sequence.loopIds.length })
                  : t('De la primera a la última, una detrás de otra.')}
              </span>
            </span>
            <ListMusicIcon className='size-6 shrink-0 opacity-80' strokeWidth={2.4} aria-hidden='true' />
          </button>

          <div>
            <SectionLabel>{t('Tus notas maestras terminadas')}</SectionLabel>
            <div className='ica-group divide-y-2 divide-border'>
              {playable.map((note) => (
                <NoteCard key={note.id} note={note} nowPlaying={currentSequenceId === note.id} />
              ))}
            </div>
            <p className='m-0 mt-3 text-center text-xs font-semibold text-muted-foreground'>
              {t('Escucha al menos el {n} % de una nota y su desafío queda abierto hasta el domingo a las 23:59.', { n: UNLOCK_PERCENT })}
            </p>
          </div>
        </div>
      )}

      <MasterNotePlaylistPlayerDock
        open={sequence.looping}
        playlistName={t('Todas seguidas')}
        noteName={currentSequenceNote?.name || ''}
        progressSec={positionSec}
        durationSec={durationSec}
        currentIndex={sequence.loopIndex}
        totalCount={sequence.loopIds.length}
        paused={isPaused}
        repeatEnabled={sequence.repeatEnabled}
        onTogglePause={() => (isPaused ? void resume() : pause())}
        onToggleRepeat={() => sequence.setRepeatEnabled(!sequence.repeatEnabled)}
        onSeekBack10={seekBack10}
        onSeekForward10={seekForward10}
        onPrevious={() => void sequence.playPrevious()}
        onNext={() => void sequence.playNext()}
        onClose={() => stopLoop(true)}
      />
    </GamePage>
  )
}

/** Una nota: escucharla entera y, al llegar al 80 %, empezar su desafío. */
export function NotaDesafiantePlayerView() {
  const { noteId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { config } = useDashboardContext()
  const targetLang = config?.targetLang || ''
  const challengeEnabled = useChallengeEnabled()
  const { play, stop, togglePause, isPaused, playingNoteId, positionSec, durationSec, error: playError } =
    useMasterNotePlayback()
  // This screen has its own player: a master note playing in the background stops.
  useStopSharedMasterNote()

  const [note, setNote] = useState<MasterNote | null>(null)
  const [chunkCount, setChunkCount] = useState(0)
  const [phrases, setPhrases] = useState<ChallengePhraseInput[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [challengeOpen, setChallengeOpen] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        const [found, chunks] = await Promise.all([fetchMasterNoteById(noteId, targetLang), fetchMasterNoteChunks(noteId)])
        if (!active) return
        if (!found || found.state !== 'closed') {
          setError(t('Esta nota maestra no está terminada.'))
          return
        }
        const ids = Array.from(new Set(chunks.map((chunk) => chunk.phrase_generation_id)))
        const rows = await fetchPhraseHistoryByIds(ids)
        if (!active) return
        const byId = new Map(rows.map((row) => [row.id, row]))
        setPhrases(
          chunks
            .map((chunk) => byId.get(chunk.phrase_generation_id))
            .filter((row): row is NonNullable<typeof row> => Boolean(row))
            .map((row) => ({
              phraseId: row.id,
              target: (row.generated_phrase || '').trim(),
              native: (row.translation || '').trim(),
            }))
            .filter((item) => item.target && item.native),
        )
        const total = chunks.reduce((sum, chunk) => sum + chunk.duration_ms, 0)
        setNote({ ...found, total_duration_ms: total || found.total_duration_ms })
        setChunkCount(chunks.length)
        setError(null)
      } catch {
        if (active) setError(t('No se pudo cargar la nota maestra'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [noteId, targetLang])

  // Al salir de la pantalla, la nota deja de sonar.
  useEffect(() => () => stop(), [stop])

  const { progress, unlocked } = useChallengeUnlock(user?.id, note?.id, note?.total_duration_ms || 0, challengeEnabled)
  const isPlaying = Boolean(note) && playingNoteId === note?.id
  const listenedPercent = Math.round(Math.min(1, progress) * UNLOCK_PERCENT)
  const label = useMemo(() => formatMasterNoteLabel(note?.name), [note?.name])

  const onPlay = () => {
    if (!note) return
    if (isPlaying) {
      togglePause()
      return
    }
    void play(note, chunkCount)
  }

  if (loading) {
    return (
      <div className='flex flex-1 items-center justify-center py-20 text-muted-foreground'>
        <Loader2Icon className='size-6 animate-spin' />
      </div>
    )
  }

  if (error || !note) {
    return (
      <GamePage>
        <EmptyState
          icon={<TargetGlyph size={56} />}
          title={error || t('No se pudo cargar la nota maestra')}
          action={
            <Button type='button' onClick={() => navigate(DASHBOARD_ROUTES.notaDesafiante)}>
              {t('Volver')}
            </Button>
          }
        />
      </GamePage>
    )
  }

  return (
    <GamePage>
      <PageTitle
        icon={
          <IconTile tone='gold' size={52}>
            <TargetGlyph size={34} />
          </IconTile>
        }
        subtitle={t('Nota desafiante')}
      >
        {label}
      </PageTitle>

      {/* Reproductor grande */}
      <Panel className='flex flex-col items-center gap-4 py-6 text-center' tone='gold'>
        <button
          type='button'
          onClick={onPlay}
          aria-label={isPlaying && !isPaused ? t('Pausar') : t('Escuchar la nota')}
          className='ica-press flex size-28 items-center justify-center rounded-full text-[#4a3200]'
          style={{ background: tone('gold').solid, boxShadow: `0 6px 0 ${tone('gold').edge}` }}
        >
          {isPlaying && !isPaused ? (
            <PauseIcon className='size-12' strokeWidth={2.6} fill='currentColor' />
          ) : (
            <PlayIcon className='ml-1.5 size-12' strokeWidth={2.6} fill='currentColor' />
          )}
        </button>
        <p className='m-0 text-sm font-extrabold tabular-nums' style={{ color: tone('gold').ink }}>
          {isPlaying ? `${formatTime(positionSec)} / ${formatTime(durationSec)}` : formatTime((note.total_duration_ms || 0) / 1000)}
        </p>
        <div className='w-full'>
          <div className='mb-1.5 flex items-center justify-between text-xs font-extrabold'>
            <span style={{ color: tone('gold').ink }}>{unlocked ? t('¡Desafío abierto!') : t('Escuchado esta semana')}</span>
            <span className='text-muted-foreground tabular-nums'>
              {listenedPercent} % / {UNLOCK_PERCENT} %
            </span>
          </div>
          <GameProgress value={unlocked ? 1 : progress} color={tone('gold').solid} />
        </div>
        {playError ? <p className='m-0 text-xs font-semibold text-destructive'>{playError}</p> : null}
      </Panel>

      {/* El desafío */}
      <Button
        type='button'
        size='xl'
        variant='gold'
        className={cn('w-full', !unlocked && 'opacity-60')}
        disabled={!unlocked || phrases.length === 0}
        onClick={() => {
          stop()
          setChallengeOpen(true)
        }}
      >
        {unlocked ? t('Empezar la nota desafiante') : t('Escucha el {n} % para empezar', { n: UNLOCK_PERCENT })}
      </Button>

      {challengeOpen ? (
        <NotaDesafianteOverlay
          open={challengeOpen}
          noteId={note.id}
          noteName={note.name}
          phrases={phrases}
          targetLang={note.target_lang || targetLang}
          nativeLang={note.native_lang || config?.nativeLang || 'Español'}
          onClose={() => setChallengeOpen(false)}
        />
      ) : null}
    </GamePage>
  )
}
