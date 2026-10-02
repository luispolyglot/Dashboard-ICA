import { forwardRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRightIcon, MicIcon, ZapIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/auth/AuthContext'
import { useDashboardContext } from '../context/DashboardContext'
import { DAY_NAMES, getTodayProgress } from '../constants'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { getStreak, shiftIsoDay, todayKey } from '../utils'
import { coinsText, fichasFormatter, hasDayBoost, useFichas, useHeldCoins } from './fichas'
import { HoverPanel } from './HoverPanel'
import { FichaIcon, FlameIcon, IceCubeIcon, SwordsIcon } from './icons'
import {
  DAY_BOOST_COST,
  EXTRA_CHALLENGE_COST,
  PREGUNTICA_EXTRA_COST,
  STREAK_MILESTONES,
} from './rules'
import { getIcaStreakState } from './streak'
import { t, tn } from '@/i18n'

/**
 * Arriba a la derecha: racha ICA e ICA Coins. Nada más.
 * La llama abre Rachas y la moneda abre ICA Coins. En el ordenador, al pasar el ratón por
 * encima sale un desplegable: la semana de tu racha, o en qué puedes gastar tus monedas hoy.
 * El ref va a la llama: ahí vuela el rayo al completar un objetivo del día.
 */
export const GameStatsBar = forwardRef<HTMLButtonElement>(function GameStatsBar(_props, flameRef) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    dailyProgress,
    creationDays,
    savedCreationDays,
    completedDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
  } = useDashboardContext()
  const { total: realTotal, entries } = useFichas(user?.id)
  // Las del cofre que aún no has recogido no se suman todavía.
  const held = useHeldCoins()
  const total = realTotal === null ? null : Math.max(0, realTotal - held)
  const streakState = getIcaStreakState({
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
    todayProgress: getTodayProgress(dailyProgress),
  })

  const statClass =
    'flex min-h-11 items-center gap-1 rounded-xl px-2 text-base font-bold tabular-nums transition-colors hover:bg-muted active:bg-muted'

  return (
    <div className='flex items-center gap-0.5'>
      <HoverPanel
        label={t('Tu racha ICA')}
        trigger={
          <button
            ref={flameRef}
            type='button'
            onClick={() => navigate(DASHBOARD_ROUTES.streaks)}
            className={statClass}
            style={{
              color: streakState.cycleDoneToday
                ? 'var(--ica-fire-ink)'
                : 'var(--muted-foreground)',
            }}
            aria-label={
              streakState.cycleDoneToday
                ? t('Racha ICA de {n} días, hoy ya está. Abrir rachas', { n: streakState.streak })
                : t('Racha ICA de {n} días, hoy aún no. Abrir rachas', { n: streakState.streak })
            }
          >
            <FlameIcon size={24} tone={streakState.cycleDoneToday ? 'fire' : 'off'} />
            <span>{streakState.streak}</span>
          </button>
        }
      >
        <StreakPanel
          streak={streakState.streak}
          cycleDoneToday={streakState.cycleDoneToday}
          frozenPending={streakState.frozenPending}
          creationDays={creationDays}
          savedCreationDays={savedCreationDays}
          flashStreak={getStreak(completedDays)}
          onOpen={() => navigate(DASHBOARD_ROUTES.streaks)}
        />
      </HoverPanel>
      <HoverPanel
        label={t('En qué gastar tus ICA Coins')}
        trigger={
          <button
            type='button'
            onClick={() => navigate(DASHBOARD_ROUTES.fichas)}
            className={statClass}
            style={{ color: 'var(--ica-gold-ink)' }}
            aria-label={t('{n} ICA Coins. Abrir ICA Coins', { n: total === null ? '' : fichasFormatter.format(total) })}
          >
            <span data-coin-target='' className='inline-flex'>
              <FichaIcon size={22} />
            </span>
            <span key={total ?? 'none'} className={held > 0 || total === null ? undefined : 'ica-pop'}>
              {total === null ? '–' : fichasFormatter.format(total)}
            </span>
          </button>
        }
      >
        <CoinsPanel
          total={total}
          boostedToday={hasDayBoost(entries)}
          onNavigate={(to) => navigate(to)}
        />
      </HoverPanel>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Desplegable de la racha: esta semana, el próximo hito y la racha de flashcards
// ---------------------------------------------------------------------------

type WeekDayStatus = 'done' | 'saved' | 'frozen' | 'today' | 'missed' | 'future'

/** Los 7 días de esta semana (de lunes a domingo) con lo que pasó en cada uno. */
function weekDays(input: {
  creationDays: string[]
  savedCreationDays: string[]
  cycleDoneToday: boolean
  frozenPending: boolean
}): Array<{ key: string; status: WeekDayStatus }> {
  const today = todayKey()
  const [year, month, day] = today.split('-').map(Number)
  const weekday = (new Date(year, month - 1, day).getDay() + 6) % 7 // lunes = 0
  const monday = shiftIsoDay(today, -weekday)
  const done = new Set(input.creationDays)
  if (input.cycleDoneToday) done.add(today)
  const saved = new Set(input.savedCreationDays)
  const yesterday = shiftIsoDay(today, -1)
  return Array.from({ length: 7 }, (_, index) => {
    const key = shiftIsoDay(monday, index)
    let status: WeekDayStatus
    if (done.has(key)) status = 'done'
    else if (saved.has(key)) status = 'saved'
    else if (input.frozenPending && key === yesterday) status = 'frozen'
    else if (key === today) status = 'today'
    else if (key > today) status = 'future'
    else status = 'missed'
    return { key, status }
  })
}

function StreakPanel({
  streak,
  cycleDoneToday,
  frozenPending,
  creationDays,
  savedCreationDays,
  flashStreak,
  onOpen,
}: {
  streak: number
  cycleDoneToday: boolean
  frozenPending: boolean
  creationDays: string[]
  savedCreationDays: string[]
  flashStreak: number
  onOpen: () => void
}) {
  const days = weekDays({ creationDays, savedCreationDays, cycleDoneToday, frozenPending })
  const today = todayKey()
  const next = STREAK_MILESTONES.find((milestone) => milestone.days > streak) ?? null
  const message = cycleDoneToday
    ? t('Hoy ya está. Vuelve mañana para seguir sumando.')
    : frozenPending
      ? t('Racha congelada: completa hoy el ciclo ICA para salvarla.')
      : streak > 0
        ? t('Completa hoy el ciclo ICA para no perderla.')
        : t('Completa hoy el ciclo ICA y empieza tu racha.')

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-start gap-3'>
        <div className='min-w-0 flex-1'>
          <p className='m-0 text-lg leading-tight font-black' style={{ color: streak > 0 ? 'var(--ica-fire-ink)' : undefined }}>
            {tn(streak, '{n} día de racha ICA', '{n} días de racha ICA')}
          </p>
          <p className='m-0 mt-1 text-sm font-semibold text-muted-foreground'>{message}</p>
        </div>
        <FlameIcon size={44} tone={cycleDoneToday ? 'fire' : 'off'} />
      </div>

      <div className='grid grid-cols-7 gap-1 rounded-2xl bg-muted/60 px-2 py-2.5'>
        {days.map((item, index) => {
          const isToday = item.key === today
          return (
            <div key={item.key} className='flex flex-col items-center gap-1'>
              <span
                className={cn('text-[11px] font-extrabold', isToday ? '' : 'text-muted-foreground')}
                style={isToday ? { color: 'var(--ica-fire-ink)' } : undefined}
              >
                {DAY_NAMES[index]}
              </span>
              <WeekDayDot status={item.status} isToday={isToday} />
            </div>
          )
        })}
      </div>

      {next ? (
        <p className='m-0 flex items-center gap-1.5 text-sm font-bold'>
          <span className='text-muted-foreground'>{t('Próximo hito:')}</span>
          {tn(next.days, '{n} día', '{n} días')}
          <span className='inline-flex items-center gap-0.5' style={{ color: 'var(--ica-gold-ink)' }}>
            · <FichaIcon size={15} />+{next.reward}
          </span>
        </p>
      ) : null}

      <p className='m-0 flex items-center gap-1.5 text-sm font-bold'>
        <FlameIcon size={18} tone={flashStreak > 0 ? 'flash' : 'off'} />
        <span style={{ color: flashStreak > 0 ? 'var(--ica-i-ink)' : 'var(--muted-foreground)' }}>
          {tn(flashStreak, 'Racha de flashcards: {n} día', 'Racha de flashcards: {n} días')}
        </span>
      </p>

      <button
        type='button'
        onClick={onOpen}
        className='ica-press flex h-11 items-center justify-center gap-1 rounded-2xl text-sm font-black text-white'
        style={{ background: 'var(--ica-fire)', boxShadow: '0 3px 0 var(--ica-fire-ink)' }}
      >
        {t('Ver mis rachas')}
      </button>
    </div>
  )
}

function WeekDayDot({ status, isToday }: { status: WeekDayStatus; isToday: boolean }) {
  if (status === 'done') {
    return (
      <span
        className='flex size-8 items-center justify-center rounded-full'
        style={{ background: 'var(--ica-fire-soft)', boxShadow: isToday ? '0 0 0 2px var(--ica-fire)' : undefined }}
      >
        <FlameIcon size={20} tone='fire' />
      </span>
    )
  }
  if (status === 'saved' || status === 'frozen') {
    return (
      <span
        className={cn('flex size-8 items-center justify-center rounded-full', status === 'frozen' && 'animate-pulse')}
        style={{ background: 'color-mix(in oklab, #0ea5e9 22%, var(--card))' }}
      >
        <IceCubeIcon size={18} />
      </span>
    )
  }
  return (
    <span
      className='size-8 rounded-full'
      style={{
        background: status === 'future' ? 'transparent' : 'var(--border)',
        border: status === 'future' ? '2px dashed var(--border)' : undefined,
        boxShadow: isToday ? '0 0 0 2px var(--ica-fire)' : undefined,
        opacity: status === 'missed' ? 0.7 : 1,
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Desplegable de las ICA Coins: en qué puedes gastarlas hoy (la tienda en pequeño)
// ---------------------------------------------------------------------------

function CoinsPanel({
  total,
  boostedToday,
  onNavigate,
}: {
  total: number | null
  boostedToday: boolean
  onNavigate: (to: string) => void
}) {
  const balance = total ?? 0
  const items: Array<{
    key: string
    icon: ReactNode
    tint: string
    title: string
    cost: number
    to: string
    doneLabel?: string
  }> = [
    {
      key: 'challenge',
      icon: <SwordsIcon size={22} />,
      tint: 'var(--ica-a-soft)',
      title: t('Desafío extra'),
      cost: EXTRA_CHALLENGE_COST,
      to: DASHBOARD_ROUTES.fichas,
    },
    {
      key: 'boost',
      icon: <ZapIcon className='size-5' strokeWidth={2.6} style={{ color: 'var(--ica-c-ink)' }} />,
      tint: 'var(--ica-c-soft)',
      title: t('Ampliar el día'),
      cost: DAY_BOOST_COST,
      to: DASHBOARD_ROUTES.fichas,
      doneLabel: boostedToday ? t('Activo hoy') : undefined,
    },
    {
      key: 'preguntica',
      icon: <MicIcon className='size-5' strokeWidth={2.6} style={{ color: 'var(--ica-a-ink)' }} />,
      tint: 'var(--ica-a-soft)',
      title: t('Intento extra de PreguntICA'),
      cost: PREGUNTICA_EXTRA_COST,
      to: `${DASHBOARD_ROUTES.preguntica}?extra=1`,
    },
  ]

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center gap-3'>
        <FichaIcon size={40} />
        <div className='min-w-0'>
          <p className='m-0 text-lg leading-tight font-black' style={{ color: 'var(--ica-gold-ink)' }}>
            {total === null ? t('ICA Coins') : `${fichasFormatter.format(balance)} ICA Coins`}
          </p>
          <p className='m-0 text-sm font-semibold text-muted-foreground'>{t('En qué puedes gastarlas hoy')}</p>
        </div>
      </div>

      <div className='flex flex-col gap-1'>
        {items.map((item) => {
          const missing = Math.max(0, item.cost - balance)
          const status = item.doneLabel
            ? { text: item.doneLabel, color: 'var(--ica-c-ink)' }
            : total === null
              ? null
              : missing === 0
                ? { text: t('Te alcanza'), color: 'var(--ica-ok-ink)' }
                : { text: t('Te faltan {n}', { n: missing }), color: 'var(--muted-foreground)' }
          return (
            <button
              key={item.key}
              type='button'
              onClick={() => onNavigate(item.to)}
              className='flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-muted'
            >
              <span className='flex size-10 shrink-0 items-center justify-center rounded-xl' style={{ background: item.tint }}>
                {item.icon}
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-sm font-extrabold'>{item.title}</span>
                {status ? (
                  <span className='block text-xs font-bold' style={{ color: status.color }}>
                    {status.text}
                  </span>
                ) : null}
              </span>
              <span
                className='inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-black tabular-nums'
                style={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }}
                aria-label={coinsText(item.cost)}
              >
                <FichaIcon size={14} />
                {item.cost}
              </span>
            </button>
          )
        })}
      </div>

      <button
        type='button'
        onClick={() => onNavigate(DASHBOARD_ROUTES.fichas)}
        className='ica-press flex h-11 items-center justify-center gap-1 rounded-2xl text-sm font-black'
        style={{ background: 'var(--ica-gold)', color: '#4a3200', boxShadow: '0 3px 0 var(--ica-gold-edge)' }}
      >
        {t('Ir a la tienda')}
        <ChevronRightIcon className='size-4' strokeWidth={3} aria-hidden='true' />
      </button>
    </div>
  )
}
