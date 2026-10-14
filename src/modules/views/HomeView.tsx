import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useBreakpoints from '@/modules/hooks/useBreakpoints'
import { useAuth } from '@/auth/AuthContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { ChallengeAlertPill, ChallengeNotePill } from '../components/IcaChallenges/ChallengeAlertBadge'
import { challengesRouteForAlerts, describeIcaChallengeAlerts, useIcaChallengeAlerts } from '../hooks/useIcaChallengeAlerts'
import {
  CoachingHomeCard,
  expectsHomeCoaching,
} from '../components/CoachingHomeCard'
import { getTodayProgress } from '../constants'
import { useDailyGame } from '../game/dailyGame'
import { CardsIcon, MicGlyph, SwordsIcon, TargetGlyph } from '../game/icons'
import { IcaPath } from '../game/IcaPath'
import { LevelCard } from '../game/LevelCard'
import { LevelStrip } from '../game/LevelStrip'
import { RankingSnippetCard } from '../game/RankingSnippetCard'
import { isIcaCycleDone } from '../game/streak'
import { StreakRiskBanner } from '../game/StreakRiskBanner'
import { ChatInvite } from '../game/ChatInvite'
import type { DailyProgressMap } from '../types'
import type { AppConfig } from '../types'
import { t, tn, uiLocale } from '@/i18n'
import { useChallengeEnabled } from '../services/challengeChunks'
import { useClosedMasterNotes } from '../game/useClosedMasterNotes'
import { usePendingChallengeNotes } from '../game/usePendingChallengeNotes'
import { CHALLENGE_NOTE_MIN_CLOSED_NOTES } from '../game/rules'

type HomeViewProps = {
  config: AppConfig
  cardCount: number
  dailyProgress: DailyProgressMap
}

export function HomeView({ config, cardCount, dailyProgress }: HomeViewProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [showPregunticaPulse, setShowPregunticaPulse] = useState(false)
  // Alumnos de coaching: su tarjeta sale debajo del camino (y a la izquierda de Juegos ICA en ordenador).
  const [hasCoaching, setHasCoaching] = useState(() =>
    expectsHomeCoaching(user?.id, config.targetLang),
  )
  const todayProgress = getTodayProgress(dailyProgress)
  const cycleDone = isIcaCycleDone(todayProgress)
  const { done: gameDone } = useDailyGame(user?.id)
  const challengeAlerts = useIcaChallengeAlerts()
  // Nota desafiante waiting: unlocked this week (80 % listened) and «Jugar» not pressed yet.
  const challengeNoteEnabled = useChallengeEnabled()
  const { notes: closedNoteList } = useClosedMasterNotes(config.targetLang, config.nativeLang)
  const pendingChallengeNotes = usePendingChallengeNotes(
    closedNoteList,
    challengeNoteEnabled && (closedNoteList?.length ?? 0) >= CHALLENGE_NOTE_MIN_CLOSED_NOTES,
  )
  const challengeAlertText = describeIcaChallengeAlerts(challengeAlerts)
  const { isLg } = useBreakpoints()

  useEffect(() => {
    setHasCoaching(expectsHomeCoaching(user?.id, config.targetLang))
  }, [config.targetLang, user?.id])

  useEffect(() => {
    let active = true

    const loadPregunticaStatus = async () => {
      try {
        const { fetchPregunticaWeekStatus } = await import('../services/preguntica')
        const status = await fetchPregunticaWeekStatus({
          targetLang: config.targetLang,
          nativeLang: config.nativeLang,
        })
        if (!active || !status) return
        setShowPregunticaPulse(status.isUnlocked && !status.completedAt)
      } catch {
        if (!active) return
        setShowPregunticaPulse(false)
      }
    }

    void loadPregunticaStatus()

    return () => {
      active = false
    }
  }, [config.nativeLang, config.targetLang])

  const subtitle = cycleDone
    ? gameDone
      ? t('Ciclo y reto del día hechos. ¡Buen día!')
      : t('Ciclo hecho. Abre tu cofre y juega el reto del día.')
    : t('Completa I·C·A para mantener tu racha.')

  // En el móvil, versión pequeña: solo tu coaching y el siguiente paso (Entrenar si toca).
  const coachingCard = (
    <CoachingHomeCard
      key={`${user?.id || 'anon'}:${config.targetLang}`}
      targetLang={config.targetLang}
      compact={!isLg}
      className={isLg ? 'px-5 py-3.5' : undefined}
      onAvailabilityChange={setHasCoaching}
    />
  )

  // Each game, and where its icon goes (on the computer every icon opens its game; Luis, 13 Oct).
  const gameItems = [
    { key: 'flashcards', icon: <CardsIcon size={isLg ? 36 : 26} />, label: 'Flashcards', color: 'var(--primary)', to: DASHBOARD_ROUTES.flashcards },
    { key: 'challenges', icon: <SwordsIcon size={isLg ? 38 : 28} />, label: t('Desafíos'), color: 'var(--ica-a)', to: challengesRouteForAlerts(challengeAlerts) },
    { key: 'preguntica', icon: <MicGlyph size={isLg ? 36 : 26} />, label: 'PreguntICA', color: 'var(--ica-c)', to: DASHBOARD_ROUTES.preguntica },
    {
      key: 'nota',
      icon: <TargetGlyph size={isLg ? 36 : 26} />,
      label: isLg ? 'Nota desafiante' : 'Nota desaf.',
      color: 'var(--ica-gold-edge)',
      // To the list of notes, as in Juegos ICA (Luis, 14 Oct).
      to: DASHBOARD_ROUTES.notaDesafiante,
    },
  ]
  const gamesClickable = isLg && cardCount > 0

  // The card goes to Juegos ICA. On the computer its four icons are buttons of their own on top of it.
  const gamesCard = (
    <div
      className={`relative flex w-full flex-col gap-3 rounded-3xl border-2 border-border p-4 text-left transition-colors ${
        cardCount === 0 ? 'opacity-70' : 'hover:bg-muted/50'
      }`}
    >
      <button
        type='button'
        onClick={() => navigate(DASHBOARD_ROUTES.gamesIca)}
        disabled={cardCount === 0}
        aria-label={t('Juegos ICA')}
        className='absolute inset-0 rounded-3xl disabled:cursor-not-allowed'
      />
      <span className='pointer-events-none relative flex items-center justify-between gap-2'>
        <span className='text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>{t('Juegos ICA')}</span>
        {challengeAlertText ? (
          <ChallengeAlertPill text={challengeAlertText} />
        ) : pendingChallengeNotes.length > 0 ? (
          <ChallengeNotePill
            count={pendingChallengeNotes.length}
            text={tn(pendingChallengeNotes.length, 'Nota desafiante esperando', '{n} notas desafiantes esperando')}
          />
        ) : showPregunticaPulse ? (
          <span className='rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white' style={{ background: 'var(--ica-c)' }}>
            {t('PreguntICA lista')}
          </span>
        ) : null}
      </span>
      {/* Luis, 12 Oct: on the computer the card is as tall as its row, so the four games grow and
          fill it. 13 Oct: a bit smaller (about 10 %), and each one opens its game. */}
      <span className={`relative grid grid-cols-4 gap-2 lg:flex-1 lg:content-center lg:gap-3 ${gamesClickable ? '' : 'pointer-events-none'}`}>
        {gameItems.map((item) => {
          const content = (
            <>
              <span
                className='flex size-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-105 lg:aspect-square lg:size-auto lg:w-full lg:max-w-[76px] lg:rounded-3xl'
                style={{ background: `color-mix(in oklab, ${item.color} 16%, transparent)` }}
              >
                {item.icon}
              </span>
              <span className='text-center text-[11px] font-bold text-muted-foreground lg:text-sm lg:leading-tight'>{t(item.label)}</span>
            </>
          )
          return gamesClickable ? (
            <button
              key={item.key}
              type='button'
              onClick={() => navigate(item.to)}
              className='group flex flex-col items-center gap-2 rounded-2xl p-1 transition-colors hover:bg-background/80'
            >
              {content}
            </button>
          ) : (
            <span key={item.key} className='flex flex-col items-center gap-1 lg:gap-2'>
              {content}
            </span>
          )
        })}
      </span>
      <span className='pointer-events-none relative text-xs font-semibold text-muted-foreground'>
        {cardCount === 0 ? t('Añade palabras para empezar') : t('Refuerza tu memoria y reta a otros icademers.')}
      </span>
    </div>
  )

  // ORDENADOR: arriba el saludo, luego el camino del día en horizontal y, debajo, las tarjetas.
  if (isLg) {
    const firstName = String(user?.user_metadata?.display_name || user?.email?.split('@')[0] || '').trim().split(/\s+/)[0]
    const dateLabel = new Date().toLocaleDateString(uiLocale(), { weekday: 'long', day: 'numeric', month: 'long' })
    return (
      <section className='flex flex-1 justify-center px-8 pt-3 pb-10'>
        <div className='flex w-full max-w-[1180px] flex-col gap-4'>
          <div className='flex items-end justify-between gap-6'>
            <div className='min-w-0'>
              <p className='ica-label m-0 first-letter:uppercase'>{dateLabel}</p>
              <h1 className='m-0 mt-1 font-display text-4xl leading-tight font-extrabold tracking-tight'>
                {firstName ? t('Hola, {name}', { name: firstName }) : t('Tu ciclo ICA de hoy')}
              </h1>
              <p className='m-0 mt-1 text-base font-semibold text-muted-foreground'>
                {t('Tu ciclo ICA de hoy')} · {subtitle}
              </p>
            </div>
          </div>

          <StreakRiskBanner className='max-w-xl' />
          <IcaPath />

          {/* Luis, 6 Oct: the coaching where people see it (left, wide) and, on the right, one
              column with your level, ICA games and the ranking, in that order. */}
          {/* Luis, 6 Oct (second try): coaching on top with your level and ICA games under it,
              and the ranking on the right from the top of the coaching to the bottom of the games,
              so the block is square. */}
          {/* Luis, 7 Oct: without a coaching there is no big coaching invite here (it stays in the
              profile). One row instead: your level, ICA games and a short ranking (3 people), all
              the same height. The coaching card is still mounted, hidden, to find out if you have one. */}
          {/* Luis, 8 Oct: the cards 1 cm (36 px) further from the path. */}
          {hasCoaching ? (
            <div className='mt-9 grid grid-cols-3 gap-5'>
              <div className='col-span-2'>{coachingCard}</div>
              <div className='row-span-2 flex flex-col [&>*]:flex-1'>
                <RankingSnippetCard />
              </div>
              <div className='flex flex-col [&>*]:flex-1'>
                <LevelCard config={config} />
              </div>
              <div className='flex flex-col [&>*]:flex-1'>{gamesCard}</div>
            </div>
          ) : (
            <>
              <div className='hidden'>{coachingCard}</div>
              <div className='mt-9 grid grid-cols-3 gap-5'>
                <div className='flex flex-col [&>*]:flex-1'>
                  <LevelCard config={config} />
                </div>
                <div className='flex flex-col [&>*]:flex-1'>{gamesCard}</div>
                <div className='flex flex-col [&>*]:flex-1'>
                  <RankingSnippetCard maxRows={3} />
                </div>
              </div>
            </>
          )}
        </div>
        <ChatInvite />
      </section>
    )
  }

  return (
    <section className='flex flex-1 justify-center px-2.5 pt-3 pb-6 md:px-6 lg:px-8 lg:pt-8'>
      <div className='grid w-full max-w-[1040px] grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]'>
        {/* Móvil (Luis, 5 oct): poco margen a los lados para aprovechar el ancho de cada pantalla. */}
        <div className='mx-auto flex w-full max-w-[480px] min-w-0 flex-col gap-3'>
          {/* Tu nivel real, en una línea (en ordenador va en la columna derecha) */}
          <div className='lg:hidden'>
            <LevelStrip config={config} />
          </div>
          {/* Coaching arriba en el móvil, como prioridad (Luis, 5 oct, maqueta B6). Se monta
              siempre para saber si lo tienes. */}
          {!isLg ? <div className={hasCoaching ? '' : 'hidden'}>{coachingCard}</div> : null}
          <StreakRiskBanner />
          <div>
            <h1 className='m-0 font-display tracking-tight text-2xl leading-tight font-extrabold lg:text-3xl'>
              {t('Tu ciclo ICA de hoy')}
            </h1>
            <p className='m-0 mt-0.5 text-sm font-medium text-muted-foreground'>{subtitle}</p>
          </div>
          <IcaPath />
        </div>

        <aside className='hidden flex-col gap-4 lg:sticky lg:top-6 lg:flex'>
          <LevelCard config={config} />
          <RankingSnippetCard />
          {gamesCard}
          {isLg ? coachingCard : null}
        </aside>
      </div>
      <ChatInvite />
    </section>
  )
}
