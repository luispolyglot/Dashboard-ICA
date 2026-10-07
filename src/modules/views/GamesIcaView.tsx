import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { LockIcon } from 'lucide-react'
import { GOAL, getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { useChallengeEnabled } from '../services/challengeChunks'
import { useFeatureFlagsStore } from '../stores/featureFlagsStore'
import { ICA_CHALLENGES_LOCAL } from '../services/icaChallengesLocalMode'
import { ChallengeAlertPill, ChallengeNotePill } from '../components/IcaChallenges/ChallengeAlertBadge'
import { ChallengeNoteUnlockGuide } from '../game/WelcomeTour'
import { usePendingChallengeNotes } from '../game/usePendingChallengeNotes'
import {
  challengesRouteForAlerts,
  describeIcaChallengeAlerts,
  useIcaChallengeAlerts,
} from '../hooks/useIcaChallengeAlerts'
import { CardsIcon, MicGlyph, SwordsIcon, TargetGlyph } from '../game/icons'
import {
  CHALLENGE_NOTE_MIN_CLOSED_NOTES,
  FLASHCARDS_MIN_ACTIVATED_WORDS,
  PREGUNTICA_EXTRA_COST,
} from '../game/rules'
import { useActivatedWords } from '../game/useActivatedWords'
import { useClosedMasterNotes } from '../game/useClosedMasterNotes'
import { t, tn } from '@/i18n'

type GamesIcaViewProps = {
  flashcardsReady: boolean
  flashcardsCount: number
  pregunticaUnlocked: boolean
  pregunticaLabel: string
  pregunticaProgress: string
}

function parseProgress(value: string): { current: number; total: number } {
  const match = value.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/)
  if (!match) return { current: 0, total: 20 }
  const current = Number(match[1])
  const total = Number(match[2])
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return { current: 0, total: 20 }
  }
  return { current, total }
}


function ProgressBar({ pct, color = 'var(--primary)' }: { pct: number; color?: string }) {
  return (
    <span className='block h-2 w-full overflow-hidden rounded-full bg-muted'>
      <span
        className='block h-full rounded-full transition-all duration-700'
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </span>
  )
}

/** Tarjeta compacta de un juego (4 en pantalla, 2×2 en el móvil). */
function GameTile({
  icon,
  title,
  status,
  progress,
  locked = false,
  onClick,
  disabled = false,
  color,
  badge,
  tour,
}: {
  icon: ReactNode
  title: string
  status: ReactNode
  progress?: number
  locked?: boolean
  onClick: () => void
  disabled?: boolean
  color: string
  badge?: ReactNode
  /** Marker for the welcome tour. */
  tour?: string
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      data-tour={tour}
      className='relative flex min-h-[156px] flex-col items-start gap-1.5 rounded-3xl border-2 border-border bg-card p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-[176px] lg:p-5'
    >
      <span
        className='flex size-12 items-center justify-center rounded-2xl'
        style={{ background: `color-mix(in oklab, ${color} 16%, transparent)` }}
        aria-hidden='true'
      >
        {icon}
      </span>
      {badge ? <span className='absolute top-3 right-3'>{badge}</span> : null}
      {locked ? (
        <span className='absolute top-3 right-3 flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground'>
          <LockIcon className='size-3.5' aria-hidden='true' />
        </span>
      ) : null}
      <span className='mt-1 font-display text-lg leading-tight font-extrabold'>{title}</span>
      <span className='text-xs leading-snug font-semibold text-muted-foreground'>{status}</span>
      {progress !== undefined ? (
        <span className='mt-auto w-full pt-1'>
          <ProgressBar pct={progress} color={color} />
        </span>
      ) : null}
    </button>
  )
}

export function GamesIcaView({
  flashcardsReady,
  flashcardsCount,
  pregunticaUnlocked,
  pregunticaProgress,
}: GamesIcaViewProps) {
  const navigate = useNavigate()
  const { dailyProgress, config } = useDashboardContext()
  const loadFlags = useFeatureFlagsStore((state) => state.loadFlags)
  const icaChallengesFlag = useFeatureFlagsStore(
    (state) => state.flags['ica-challenges'],
  )
  // En el modo local de prueba la tarjeta sale siempre.
  const icaChallengesEnabled = icaChallengesFlag || ICA_CHALLENGES_LOCAL
  const challengeAlerts = useIcaChallengeAlerts()
  const challengeAlertText = describeIcaChallengeAlerts(challengeAlerts)
  const challengeNoteEnabled = useChallengeEnabled()
  const { activatedWords, flashcardsUnlocked } = useActivatedWords()
  const { notes: closedNoteList, count: closedNotes } = useClosedMasterNotes(config?.targetLang, config?.nativeLang)
  const progress = parseProgress(pregunticaProgress)
  const pregunticaPct = (progress.current / progress.total) * 100
  const reviewedToday = Math.min(getTodayProgress(dailyProgress).reviewCorrect, GOAL)
  const flashcardsOpen = flashcardsReady && flashcardsUnlocked
  const challengeReady = closedNotes !== null && closedNotes >= CHALLENGE_NOTE_MIN_CLOSED_NOTES
  const pendingChallengeNotes = usePendingChallengeNotes(closedNoteList, challengeNoteEnabled && challengeReady)

  useEffect(() => {
    void loadFlags()
  }, [loadFlags])

  return (
    <section className='mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pt-4 pb-28 lg:py-10'>
      <h2 className='mb-1 font-display tracking-tight text-2xl font-extrabold lg:text-3xl'>{t('Juegos ICA')}</h2>
      <p className='text-sm text-muted-foreground'>
        {t('Refuerza tu memoria, reta a otros icademers o practica expresión real.')}
      </p>

      <div className='mt-5 grid grid-cols-2 gap-3 lg:gap-4'>
        <GameTile
          icon={<CardsIcon size={30} />}
          title={t('Flashcards')}
          tour='game-flashcards'
          color='var(--primary)'
          disabled={!flashcardsReady}
          locked={flashcardsReady && !flashcardsUnlocked}
          onClick={() => navigate(DASHBOARD_ROUTES.flashcards)}
          status={
            flashcardsOpen
              ? t('{reviewedToday} de {GOAL} hoy · {flashcardsCount} palabras', { reviewedToday, GOAL, flashcardsCount })
              : !flashcardsReady
                ? t('Añade palabras ICA para empezar')
                : t('Se abren con {FLASHCARDS_MIN_ACTIVATED_WORDS} palabras activadas (llevas {n})', { FLASHCARDS_MIN_ACTIVATED_WORDS, n: Math.min(activatedWords, FLASHCARDS_MIN_ACTIVATED_WORDS) })
          }
          progress={
            flashcardsOpen
              ? (reviewedToday / GOAL) * 100
              : (activatedWords / FLASHCARDS_MIN_ACTIVATED_WORDS) * 100
          }
        />

        {icaChallengesEnabled ? (
          <GameTile
            icon={<SwordsIcon size={32} />}
            title={t('Desafíos ICA')}
            tour='game-challenges'
            color='var(--ica-a)'
            onClick={() => navigate(challengesRouteForAlerts(challengeAlerts))}
            status={challengeAlertText ? t('¡Tienes retos esperando!') : t('Retos 1 vs 1 con tus palabras ICA')}
            badge={challengeAlertText ? <ChallengeAlertPill text={String(challengeAlerts.total)} /> : undefined}
          />
        ) : null}

        <GameTile
          icon={<MicGlyph size={30} />}
          title={t('PreguntICA')}
          tour='game-preguntica'
          color='var(--ica-c)'
          locked={!pregunticaUnlocked}
          onClick={() => navigate(DASHBOARD_ROUTES.preguntica)}
          status={
            pregunticaUnlocked
              ? t('Desbloqueada esta semana · extra: {PREGUNTICA_EXTRA_COST} ICA Coins', { PREGUNTICA_EXTRA_COST })
              : t('{pregunticaProgress} palabras activadas esta semana', { pregunticaProgress })
          }
          progress={pregunticaPct}
        />

        {challengeNoteEnabled ? (
          <GameTile
            icon={<TargetGlyph size={30} />}
            title={t('Nota desafiante')}
            tour='game-challenge-note'
            color='var(--ica-gold-edge)'
            locked={closedNotes !== null && !challengeReady}
            onClick={() => navigate(DASHBOARD_ROUTES.notaDesafiante)}
            badge={
              pendingChallengeNotes.length > 0 ? <ChallengeNotePill count={pendingChallengeNotes.length} /> : undefined
            }
            status={
              pendingChallengeNotes.length > 0
                ? tn(
                    pendingChallengeNotes.length,
                    '¡Tienes una nota desafiante esperando!',
                    '¡Tienes {n} notas desafiantes esperando!',
                  )
                : closedNotes === null
                ? t('Elige una nota maestra terminada')
                : challengeReady
                  ? t('Elige una nota maestra terminada')
                  : t('Se abre con {CHALLENGE_NOTE_MIN_CLOSED_NOTES} notas maestras terminadas (llevas {closedNotes})', { CHALLENGE_NOTE_MIN_CLOSED_NOTES, closedNotes })
            }
            progress={closedNotes === null || challengeReady ? undefined : (closedNotes / CHALLENGE_NOTE_MIN_CLOSED_NOTES) * 100}
          />
        ) : null}
      </div>

      <ChallengeNoteUnlockGuide unlocked={challengeNoteEnabled && challengeReady} />
    </section>
  )
}
