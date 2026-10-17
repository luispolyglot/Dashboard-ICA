import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AudioLinesIcon, ChevronDownIcon, ChevronRightIcon, ListMusicIcon, Loader2Icon, LockIcon, PauseIcon, PlayIcon } from 'lucide-react'
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
import { useSharedMasterNotePlayback } from '../components/MasterNotePlaybackProvider'
import { useChallengeSequenceStore } from '../stores/challengeSequenceStore'
import { MENU_CONTENT_CLASS, MENU_ITEM_CLASS } from '../components/MasterNoteGameUi'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MasterNotePlaylistPlayerDock } from '../components/MasterNotePlaylistPlayerDock'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { useChallengeEnabled, type ChallengePhraseInput } from '../services/challengeChunks'
import { CHALLENGE_UNLOCK_RATIO, markChallengeNoteSeen, useChallengeUnlock } from '../services/challengeUnlocks'
import { usePendingChallengeNotes } from '../game/usePendingChallengeNotes'
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

function NoteCard({ note, nowPlaying, isNew }: { note: ClosedMasterNote; nowPlaying: boolean; isNew: boolean }) {
  const { user } = useAuth()
  const { progress, unlocked } = useChallengeUnlock(user?.id, note.id, note.totalDurationMs)
  return (
    <Link
      to={`${DASHBOARD_ROUTES.notaDesafiante}/${note.id}`}
      // Pressing «Jugar» removes the notice (the diana) for this week, even if they leave.
      onClick={unlocked ? () => markChallengeNoteSeen(user?.id, note.id) : undefined}
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
            ? isNew
              ? t('¡Desafío nuevo! Abierto hasta el domingo')
              : t('Abierta hasta el domingo')
            : t('Escuchado esta semana: {n} % de {max} %', { n: Math.round(progress * UNLOCK_PERCENT), max: UNLOCK_PERCENT })}
        </span>
      </span>
      {unlocked ? (
        <span
          className='relative shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold text-[#4a3200]'
          style={{ background: tone('gold').solid, boxShadow: `0 3px 0 ${tone('gold').edge}` }}
        >
          {t('Jugar')}
          {isNew ? (
            <span
              className='absolute -top-1 -right-1 size-3 rounded-full border-2 border-card bg-destructive'
              aria-hidden='true'
            />
          ) : null}
        </span>
      ) : (
        <ChevronRightIcon className='size-5 shrink-0 text-muted-foreground' aria-hidden='true' />
      )}
    </Link>
  )
}

// The voice between notes now lives with the shared «todas seguidas» (components/ChallengeNoteSequence).
export { sequenceAnnouncement } from '../components/ChallengeNoteSequence'

/** Lista de notas maestras terminadas para hacer su nota desafiante. */
export function NotaDesafianteListView() {
  const { config } = useDashboardContext()
  const { notes, count } = useClosedMasterNotes(config?.targetLang, config?.nativeLang)
  // Oldest first (Luis, 5 Oct): «Nota maestra 1» on top, like in Activación.
  const playable = (notes || [])
    .filter((note) => note.totalDurationMs > 0)
    .sort((x, y) => (x.closedAt || '').localeCompare(y.closedAt || ''))
  const ready = count !== null && count >= CHALLENGE_NOTE_MIN_CLOSED_NOTES
  const nativeLang = config?.nativeLang || 'Español'
  // Notes with a new challenge (the diana in Juegos ICA): marked here with a red dot.
  const pendingNotes = usePendingChallengeNotes(notes, ready)
  const pendingIds = useMemo(() => new Set(pendingNotes.map((note) => note.id)), [pendingNotes])

  // Escuchar todas seguidas: de la primera a la última (o desde la que elijas), con una voz que las
  // presenta. Luis, 12 Oct: suena en el reproductor de toda la app, así que sigue sonando aunque
  // vayas a Inicio u otra pantalla (antes se cortaba al salir de aquí).
  const { pause, resume, seekBack10, seekForward10, isPaused, positionSec, durationSec } = useSharedMasterNotePlayback()
  const sequence = useChallengeSequenceStore()
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
  const sequenceNotes = useMemo(
    () =>
      [...playable]
        .sort((x, y) => (x.closedAt || '').localeCompare(y.closedAt || ''))
        .map((note) => fullById.get(note.id))
        .filter((note): note is MasterNote => Boolean(note)),
    [fullById, playable],
  )
  // Desde qué nota empezar (Luis, 12 Oct: la opción había desaparecido). Por defecto, la primera.
  const [startNoteId, setStartNoteId] = useState<string | null>(null)
  const startIndex = Math.max(0, sequenceNotes.findIndex((note) => note.id === startNoteId))
  const startNote = sequenceNotes[startIndex] ?? null
  const startSequenceFrom = (index: number) => {
    if (sequenceNotes.length === 0) return
    sequence.start(sequenceNotes, index, nativeLang)
  }

  const currentSequenceId = sequence.looping ? sequence.loopIds[sequence.loopIndex] : null
  const currentSequenceNote = currentSequenceId ? fullById.get(currentSequenceId) : null
  const stopSequence = () => sequence.controls?.stop()
  // «3 de 5» counts among all the notes, also when it started at the 3rd.
  const sequenceOffset = sequence.request?.startIndex ?? 0
  const sequenceTotal = sequence.request?.notes.length ?? sequence.loopIds.length

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
              startSequenceFrom(startIndex)
            }}
            disabled={sequenceNotes.length === 0}
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
                  ? t('{n} de {total}', { n: sequenceOffset + sequence.loopIndex + 1, total: sequenceTotal })
                  : startIndex > 0
                    ? t('Desde la {n}.ª, una detrás de otra.', { n: startIndex + 1 })
                    : t('De la primera a la última, una detrás de otra.')}
              </span>
            </span>
            <ListMusicIcon className='size-6 shrink-0 opacity-80' strokeWidth={2.4} aria-hidden='true' />
          </button>

          {/* Empezar desde: elegir la nota con la que empieza (y empezar ya). */}
          {sequenceNotes.length > 1 ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type='button'
                  className='-mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-border bg-card px-4 py-2.5 text-left text-sm font-extrabold transition-colors hover:bg-muted/60'
                >
                  <span className='min-w-0 truncate'>
                    <span className='text-muted-foreground'>{t('Empezar desde')}: </span>
                    {startNote ? formatMasterNoteLabel(startNote.name) : '…'}
                  </span>
                  <ChevronDownIcon className='size-5 shrink-0 text-muted-foreground' strokeWidth={2.6} aria-hidden='true' />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' className={cn(MENU_CONTENT_CLASS, 'max-h-80')}>
                <p className='ica-label m-0 px-2.5 pt-1.5 pb-1'>{t('Empezar desde')}</p>
                {sequenceNotes.map((note, index) => (
                  <DropdownMenuItem
                    key={note.id}
                    className={MENU_ITEM_CLASS}
                    onSelect={() => {
                      setStartNoteId(note.id)
                      startSequenceFrom(index)
                    }}
                  >
                    <PlayIcon strokeWidth={2.4} />
                    {formatMasterNoteLabel(note.name)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <div>
            <SectionLabel>{t('Tus notas maestras terminadas')}</SectionLabel>
            <div className='ica-group divide-y-2 divide-border'>
              {playable.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  nowPlaying={currentSequenceId === note.id}
                  isNew={pendingIds.has(note.id)}
                />
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
        currentIndex={sequenceOffset + sequence.loopIndex}
        totalCount={sequenceTotal}
        paused={isPaused}
        repeatEnabled={sequence.repeatEnabled}
        onTogglePause={() => (isPaused ? void resume() : pause())}
        onToggleRepeat={() => sequence.controls?.setRepeatEnabled(!sequence.repeatEnabled)}
        onSeekBack10={seekBack10}
        onSeekForward10={seekForward10}
        onPrevious={() => sequence.controls?.playPrevious()}
        onNext={() => sequence.controls?.playNext()}
        onClose={stopSequence}
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
  // Luis, 12 Oct: the app's shared player, so the note keeps playing if you go to another screen
  // (the small player at the top brings you back here).
  const { play, stop, togglePause, isPaused, playingNoteId, positionSec, durationSec, error: playError } =
    useSharedMasterNotePlayback()
  const setSequenceOrigin = useChallengeSequenceStore((state) => state.setOrigin)

  const [note, setNote] = useState<MasterNote | null>(null)
  const [chunkCount, setChunkCount] = useState(0)
  const [phrases, setPhrases] = useState<ChallengePhraseInput[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [challengeOpen, setChallengeOpen] = useState(false)
  // Luis, 16 Oct: a fold-out with the note's phrases (both languages), only to read them.
  const [phrasesOpen, setPhrasesOpen] = useState(false)

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
              nativeLang: row.native_lang ?? null,
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
    setSequenceOrigin({ noteId: note.id, path: `${DASHBOARD_ROUTES.notaDesafiante}/${note.id}` })
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
          // Pressing «Jugar» removes the notice (the diana) for this week, even if they leave.
          markChallengeNoteSeen(user?.id, note.id)
          setChallengeOpen(true)
        }}
      >
        {unlocked ? t('Empezar la nota desafiante') : t('Escucha el {n} % para empezar', { n: UNLOCK_PERCENT })}
      </Button>

      {/* Las frases de la nota: solo para leerlas (sin regrabar). */}
      {phrases.length > 0 ? (
        <Panel className='p-0'>
          <button
            type='button'
            aria-expanded={phrasesOpen}
            onClick={() => setPhrasesOpen((open) => !open)}
            className='flex w-full items-center gap-3 px-4 py-3.5 text-left'
          >
            <span className='min-w-0 flex-1 font-extrabold'>
              {t('Ver las frases de esta nota')}{' '}
              <span className='text-sm font-bold text-muted-foreground tabular-nums'>({phrases.length})</span>
            </span>
            <ChevronDownIcon
              className={cn('size-5 shrink-0 text-muted-foreground transition-transform', phrasesOpen && 'rotate-180')}
              strokeWidth={2.6}
              aria-hidden='true'
            />
          </button>
          {phrasesOpen ? (
            <ol className='m-0 list-none space-y-3 border-t-2 border-border px-4 pt-3 pb-4'>
              {phrases.map((phrase, index) => (
                <li key={`${phrase.phraseId}-${index}`} className='flex gap-3'>
                  <span className='w-5 shrink-0 pt-0.5 text-right text-xs font-black text-muted-foreground tabular-nums'>
                    {index + 1}
                  </span>
                  <span className='min-w-0'>
                    <span className='block leading-snug font-extrabold'>{phrase.target}</span>
                    <span className='mt-0.5 block text-sm font-semibold text-muted-foreground'>{phrase.native}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </Panel>
      ) : null}

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
