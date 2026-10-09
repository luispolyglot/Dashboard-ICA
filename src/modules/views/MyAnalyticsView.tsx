import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, Gamepad2Icon, GiftIcon, HeadphonesIcon, PercentIcon, SparklesIcon, SwordsIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { longestStreak } from '../game/achievements'
import { CardsIcon, FlameIcon, TrophyIcon } from '../game/icons'
import {
  localMonthStart,
  monthLabel,
  openMonthlyRecap,
  useMonthSummary,
} from '../game/monthlyRecap'
import { getIcaStreakState } from '../game/streak'
import { useActivatedWords } from '../game/useActivatedWords'
import { useClosedMasterNotes } from '../game/useClosedMasterNotes'
import { LISTENING_METRICS_CHANGED_EVENT } from '../services/creationMetricsSync'
import { getStreak } from '../utils'
import { SegmentedTabs } from '../game/ui'
import { openIcaWrapped } from '../game/wrapped/IcaWrapped'
import { availableWrappedYears } from '../game/wrapped/wrappedSlides'
import { useIcaSummary } from '../services/icaSummary'
import { t, uiLocale } from '@/i18n'

function shiftMonth(monthStart: string, delta: number): string {
  const [year, month] = monthStart.split('-').map(Number)
  return localMonthStart(new Date(year, (month || 1) - 1 + delta, 1))
}

function StatTile({
  icon,
  value,
  label,
  hint,
  color,
}: {
  icon: ReactNode
  value: string
  label: string
  hint?: ReactNode
  color: string
}) {
  return (
    <div className='flex flex-col gap-1 rounded-2xl border-2 border-border p-3.5'>
      <span
        className='flex size-10 items-center justify-center rounded-xl text-lg font-extrabold'
        style={{ background: `color-mix(in oklab, ${color} 15%, transparent)`, color }}
        aria-hidden='true'
      >
        {icon}
      </span>
      <span className='mt-1 text-3xl leading-none font-black tabular-nums'>{value}</span>
      <span className='text-sm font-bold'>{label}</span>
      {hint ? <span className='text-xs font-medium text-muted-foreground'>{hint}</span> : null}
    </div>
  )
}

function Delta({ current, previous, previousName }: { current: number; previous: number | null | undefined; previousName: string }) {
  if (previous === null || previous === undefined) return null
  const delta = current - previous
  if (delta === 0) return <>{t('Igual que en {previousName}', { previousName })}</>
  return (
    <span className={delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
      {delta > 0 ? '+' : ''}
      {delta} vs {previousName}
    </span>
  )
}

/**
 * Estadísticas: tus cifras de ahora (rachas, palabras, notas maestras) y las del mes
 * que elijas, con la comparación con el mes anterior y el resumen del mes en grande.
 */
export function MyAnalyticsView() {
  const { user } = useAuth()
  const {
    config,
    cards,
    dailyProgress,
    completedDays,
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
  } = useDashboardContext()
  const { activatedWords } = useActivatedWords()
  const { count: closedNotes } = useClosedMasterNotes(config?.targetLang, config?.nativeLang)
  const currentMonth = localMonthStart()
  const firstMonth = useMemo(() => {
    const created = user?.created_at ? new Date(user.created_at) : new Date()
    return localMonthStart(Number.isNaN(created.getTime()) ? new Date() : created)
  }, [user?.created_at])
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  // «Global» (Luis, 9 Oct): everything since the account was created, with no comparison.
  const [mode, setMode] = useState<'month' | 'all'>('month')
  const [refreshTick, setRefreshTick] = useState(0)
  const previousMonth = shiftMonth(selectedMonth, -1)
  const hasPrevious = previousMonth >= firstMonth
  const summary = useMonthSummary(selectedMonth, refreshTick)
  const previous = useMonthSummary(hasPrevious ? previousMonth : null)
  const accountStart = useMemo(() => {
    const created = user?.created_at ? new Date(user.created_at) : null
    return created && !Number.isNaN(created.getTime()) ? created : new Date(2025, 0, 1)
  }, [user?.created_at])
  // The end is the start of tomorrow, so it stays the same during the whole day (no refetch loop).
  const allTimeEnd = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  }, [])
  const allTime = useIcaSummary(
    mode === 'all' && config?.targetLang && config?.nativeLang
      ? { from: accountStart, to: allTimeEnd, targetLang: config.targetLang, nativeLang: config.nativeLang }
      : null,
    refreshTick,
  )

  useEffect(() => {
    const onChange = () => setRefreshTick((value) => value + 1)
    window.addEventListener(LISTENING_METRICS_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(LISTENING_METRICS_CHANGED_EVENT, onChange)
  }, [])

  const icaStreak = getIcaStreakState({
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
    todayProgress: getTodayProgress(dailyProgress),
  })
  const bestIca = Math.max(icaStreak.streak, longestStreak(creationDays, savedCreationDays))
  const flashStreak = getStreak(completedDays)
  const bestFlash = Math.max(flashStreak, longestStreak(completedDays))

  if (!config) {
    return (
      <section className='mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-28 lg:py-10'>
        <h2 className='mb-1 font-display tracking-tight text-2xl font-extrabold lg:text-3xl'>{t('Estadísticas')}</h2>
        <p className='text-sm text-muted-foreground'>{t('Configura tu idioma para ver tus cifras.')}</p>
      </section>
    )
  }

  const k = summary.kpis
  const p = hasPrevious ? previous.kpis : null
  const prevName = monthLabel(previousMonth)
  const loadingValue = summary.loading ? '…' : '0'
  const isCurrentMonth = selectedMonth === currentMonth
  const a = allTime.summary
  const allValue = (value: number | undefined) => (value !== undefined ? String(value) : allTime.loading ? '…' : '0')
  const sinceLabel = new Intl.DateTimeFormat(uiLocale(), { month: 'long', year: 'numeric' }).format(accountStart)
  // Every year's Wrapped stays here once it is out (15 December), discreetly (Luis, 9 Oct).
  const wrappedYears = availableWrappedYears(new Date(), user?.created_at ? new Date(user.created_at) : null)

  return (
    <section className='mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-28 lg:py-10'>
      <h2 className='mb-1 font-display tracking-tight text-2xl font-extrabold lg:text-3xl'>{t('Estadísticas')}</h2>
      <p className='text-sm text-muted-foreground'>{t('Tus cifras en {n}.', { n: config.targetLang.toLowerCase() })}</p>

      <h3 className='mt-6 mb-2 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>
        {t('Ahora mismo')}
      </h3>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <StatTile
          icon={<FlameIcon size={22} tone={icaStreak.cycleDoneToday ? 'fire' : 'off'} />}
          value={String(icaStreak.streak)}
          label='Racha ICA'
          hint={t('Tu mejor racha: {bestIca} días', { bestIca })}
          color='var(--ica-fire)'
        />
        <StatTile
          icon={<CardsIcon size={24} />}
          value={String(flashStreak)}
          label={t('Racha flashcards')}
          hint={t('Tu mejor racha: {bestFlash} días', { bestFlash })}
          color='var(--primary)'
        />
        <StatTile
          icon={<span className='font-ica'>I</span>}
          value={String(cards.length)}
          label='Palabras ICA'
          hint={`${activatedWords} activadas`}
          color='var(--ica-i)'
        />
        <StatTile
          icon={<span className='font-ica'>A</span>}
          value={closedNotes === null ? '…' : String(closedNotes)}
          label='Notas maestras'
          hint='terminadas'
          color='var(--ica-a)'
        />
      </div>

      <SegmentedTabs
        className='mt-8 mb-4'
        ariaLabel={t('Qué cifras ver')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'month', label: t('Por mes') },
          { value: 'all', label: t('Global') },
        ]}
      />

      {mode === 'all' ? (
        <>
          <div className='mb-3 flex items-center justify-between gap-2'>
            <h3 className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>
              {t('Global')}
            </h3>
            <span className='text-sm font-extrabold text-muted-foreground'>
              {t('Desde {date}', { date: sinceLabel })}
            </span>
          </div>

          {allTime.error ? (
            <p className='mb-3 text-sm text-destructive'>{t('No se pudieron cargar tus cifras de siempre.')}</p>
          ) : null}

          <div className='grid grid-cols-2 gap-3 lg:grid-cols-3'>
            <StatTile
              icon={<FlameIcon size={22} />}
              value={allValue(a?.cycleDays)}
              label={t('Días con el ciclo ICA')}
              hint={t('Tu mejor racha: {bestIca} días', { bestIca })}
              color='var(--ica-fire)'
            />
            <StatTile
              icon={<span className='font-ica'>I</span>}
              value={allValue(a?.wordsAdded)}
              label={t('Palabras añadidas')}
              color='var(--ica-i)'
            />
            <StatTile
              icon={<span className='font-ica'>C</span>}
              value={allValue(a?.phrasesCreated)}
              label={t('Frases creadas')}
              color='var(--ica-c)'
            />
            <StatTile
              icon={<span className='font-ica'>A</span>}
              value={allValue(a?.masterNotesClosed)}
              label={t('Notas maestras cerradas')}
              color='var(--ica-a)'
            />
            <StatTile
              icon={<CardsIcon size={24} />}
              value={allValue(a?.reviewsCorrect)}
              label={t('Flashcards acertadas')}
              hint={a && a.reviewsTotal > 0 ? t('{p} % de acierto', { p: Math.round((a.reviewsCorrect / a.reviewsTotal) * 100) }) : null}
              color='var(--primary)'
            />
            <StatTile
              icon={<HeadphonesIcon className='size-5' strokeWidth={2.6} />}
              value={allValue(a?.listeningMinutes)}
              label={t('Minutos escuchando notas')}
              color='var(--ica-c)'
            />
            <StatTile
              icon={<Gamepad2Icon className='size-5' strokeWidth={2.6} />}
              value={allValue(a?.dailyGamesPlayed)}
              label={t('Retos del día jugados')}
              hint={a ? t('{n} sin ningún fallo', { n: a.dailyGamesPerfect }) : null}
              color='var(--ica-reto)'
            />
            <StatTile
              icon={<SwordsIcon className='size-5' strokeWidth={2.6} />}
              value={allValue(a?.challengesWon)}
              label={t('Desafíos ICA ganados')}
              hint={a ? t('De {n} jugados', { n: a.challengesPlayed }) : null}
              color='var(--ica-a)'
            />
            <StatTile
              icon={<TrophyIcon size={26} />}
              value={a?.bestRank ? `${a.bestRank}.º` : allTime.loading ? '…' : '–'}
              label={t('Mejor puesto en el ranking')}
              hint={t('En un mes cerrado')}
              color='var(--ica-gold-edge)'
            />
          </div>

          {wrappedYears.length > 0 ? (
            <div className='mt-6'>
              <h3 className='m-0 mb-2 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>
                {t('Tus Wrapped')}
              </h3>
              <div className='flex flex-wrap gap-2'>
                {wrappedYears.map((year) => (
                  <button
                    key={year}
                    type='button'
                    onClick={() => openIcaWrapped(year)}
                    className='flex items-center gap-2 rounded-2xl border-2 border-border px-3.5 py-2 text-sm font-extrabold transition-colors hover:bg-muted'
                  >
                    <GiftIcon className='size-4' strokeWidth={2.6} style={{ color: 'var(--ica-gold-edge)' }} aria-hidden='true' />
                    {t('Wrapped {year}', { year })}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
      <div className='mb-3 flex items-center justify-between gap-2'>
        <h3 className='m-0 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>
          {t('Tu mes')}
        </h3>
        <div className='flex items-center gap-1 rounded-full border-2 border-border p-0.5'>
          <button
            type='button'
            onClick={() => setSelectedMonth(previousMonth)}
            disabled={!hasPrevious}
            className='flex size-8 items-center justify-center rounded-full hover:bg-muted disabled:opacity-30'
            aria-label={t('Mes anterior')}
          >
            <ChevronLeftIcon className='size-4' />
          </button>
          <span className='min-w-32 text-center text-sm font-extrabold first-letter:uppercase'>
            {monthLabel(selectedMonth)} {selectedMonth.slice(0, 4)}
          </span>
          <button
            type='button'
            onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
            disabled={isCurrentMonth}
            className='flex size-8 items-center justify-center rounded-full hover:bg-muted disabled:opacity-30'
            aria-label={t('Mes siguiente')}
          >
            <ChevronRightIcon className='size-4' />
          </button>
        </div>
      </div>

      {summary.error ? <p className='mb-3 text-sm text-destructive'>{summary.error}</p> : null}

      <div className='grid grid-cols-2 gap-3 lg:grid-cols-3'>
        <StatTile
          icon={<FlameIcon size={22} />}
          value={String(summary.cycleDays)}
          label={t('Días con el ciclo ICA')}
          hint={<Delta current={summary.cycleDays} previous={hasPrevious ? previous.cycleDays : null} previousName={prevName} />}
          color='var(--ica-fire)'
        />
        <StatTile
          icon={<span className='font-ica'>I</span>}
          value={k ? String(k.wordsAdded) : loadingValue}
          label={t('Palabras añadidas')}
          hint={k ? <Delta current={k.wordsAdded} previous={p?.wordsAdded} previousName={prevName} /> : null}
          color='var(--ica-i)'
        />
        <StatTile
          icon={<span className='font-ica'>C</span>}
          value={k ? String(k.phrasesCreated) : loadingValue}
          label='Frases creadas'
          hint={k ? <Delta current={k.phrasesCreated} previous={p?.phrasesCreated} previousName={prevName} /> : null}
          color='var(--ica-c)'
        />
        <StatTile
          icon={<span className='font-ica'>A</span>}
          value={k ? String(k.masterNotesClosed) : loadingValue}
          label='Notas maestras cerradas'
          hint={k ? <Delta current={k.masterNotesClosed} previous={p?.masterNotesClosed} previousName={prevName} /> : null}
          color='var(--ica-a)'
        />
        <StatTile
          icon={<CardsIcon size={24} />}
          value={k ? String(k.flashcardsCorrect) : loadingValue}
          label='Flashcards acertadas'
          hint={k ? <Delta current={k.flashcardsCorrect} previous={p?.flashcardsCorrect} previousName={prevName} /> : null}
          color='var(--primary)'
        />
        <StatTile
          icon={<HeadphonesIcon className='size-5' strokeWidth={2.6} />}
          value={k ? String(k.masterNotesListenedMinutes) : loadingValue}
          label='Minutos escuchando notas'
          hint={
            k ? (
              <Delta current={k.masterNotesListenedMinutes} previous={p?.masterNotesListenedMinutes} previousName={prevName} />
            ) : null
          }
          color='var(--ica-c)'
        />
        <StatTile
          icon={<TrophyIcon size={26} />}
          value={summary.rank !== null ? `${summary.rank}.º` : summary.loading ? '…' : '–'}
          label={t('Puesto en el ranking')}
          hint={isCurrentMonth ? t('Por ahora; se cierra el día 28') : t('Al cerrar el mes')}
          color='var(--ica-gold-edge)'
        />
        <StatTile
          icon={<PercentIcon className='size-5' strokeWidth={2.8} />}
          value={summary.efficacy !== null ? `${summary.efficacy} %` : summary.loading ? '…' : '–'}
          label='Eficacia'
          hint={t('Puntos del ranking conseguidos entre los posibles')}
          color='var(--ica-ok)'
        />
        <StatTile
          icon={<Gamepad2Icon className='size-5' strokeWidth={2.6} />}
          value={summary.dailyGameCorrect !== null ? String(summary.dailyGameCorrect) : summary.loading ? '…' : '–'}
          label={t('Aciertos en el reto del día')}
          hint={t('Primera partida de cada día, hasta el 28. Desde noviembre deshacen los empates del ranking.')}
          color='var(--ica-reto)'
        />
      </div>

      <Button
        type='button'
        size='xl'
        variant='gold'
        className='mt-5 w-full'
        onClick={() => openMonthlyRecap(selectedMonth)}
      >
        <SparklesIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
        {t('Ver recap de {month}', { month: monthLabel(selectedMonth) })}
      </Button>
      <p className='mt-2 text-center text-xs font-medium text-muted-foreground'>
        {t('Descárgalo y compártelo en la comunidad. Cada mes, el día 28, sale solo.')}
      </p>
        </>
      )}
    </section>
  )
}
