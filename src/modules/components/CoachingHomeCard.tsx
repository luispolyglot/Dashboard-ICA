import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClipboardListIcon,
  CrownIcon,
  DumbbellIcon,
  FileTextIcon,
  LoaderCircleIcon,
  MicIcon,
} from 'lucide-react'
import { TargetGlyph } from '../game/icons'
import { buildWeekRings, isTaskAnswered } from '../game/coachingRings'
import { CoachingWeekRingsMini } from './coaching/CoachingWeekRings'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'
import {
  fetchMyCoachingDashboard,
  fetchMyCoachingV2SessionBoard,
  type CoachingMembership,
  type CoachingV2SessionBoard,
} from '../services/coaching'
import {
  getCoachingPersonalizedSessionRoute,
  getCoachingV2ExerciseRoute,
} from '../routes/paths'
import { langName, t, tn, uiLocale } from '@/i18n'

/* ══════════════════════════════════════════════════════════════════════
   Tarjeta COACHING de la home (solo para alumnos con coaching activo).
   De un vistazo: semana del programa, sus tres focos y el siguiente paso.
   ══════════════════════════════════════════════════════════════════════ */

type HomeCoachingData = {
  membership: CoachingMembership
  board: CoachingV2SessionBoard | null
}

// Caché corta para no pedirlo otra vez cada vez que se vuelve a la home.
const CACHE_TTL_MS = 60_000
let cache: { key: string; at: number; data: HomeCoachingData | null } | null = null

/* Recordamos (en este navegador) si el alumno tiene coaching, para que la home
   pinte el hueco de la tarjeta desde el primer momento y no "salte". */
const cacheKey = (userId: string | undefined, targetLang: string) =>
  `${userId || 'anon'}:${targetLang.trim().toLowerCase()}`
const FLAG_KEY = (key: string) => `ica.homeCoaching.${key}`

export function expectsHomeCoaching(userId: string | undefined, targetLang: string): boolean {
  const key = cacheKey(userId, targetLang)
  if (cache && cache.key === key) return Boolean(cache.data)
  try {
    return window.localStorage.getItem(FLAG_KEY(key)) === '1'
  } catch {
    return false
  }
}

function rememberHomeCoaching(key: string, available: boolean) {
  try {
    window.localStorage.setItem(FLAG_KEY(key), available ? '1' : '0')
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/* Tras entregar un ejercicio o cambiar algo del coaching, la home debe pedirlo de nuevo. */
export function invalidateHomeCoachingCache() {
  cache = null
}

async function loadHomeCoaching(
  userId: string | undefined,
  targetLang: string,
): Promise<HomeCoachingData | null> {
  const key = cacheKey(userId, targetLang)
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data
  }
  const memberships = await fetchMyCoachingDashboard(targetLang)
  const membership =
    memberships.find((row) => row.status === 'active' && row.programVersion === 'v2') ||
    memberships.find((row) => row.status === 'active') ||
    null
  let data: HomeCoachingData | null = null
  if (membership) {
    const board =
      membership.programVersion === 'v2'
        ? await fetchMyCoachingV2SessionBoard({ sessionId: membership.id }).catch(() => null)
        : null
    data = { membership, board }
  }
  cache = { key, at: Date.now(), data }
  return data
}

const PHASE_KEYS = [
  'phaseExplained',
  'phaseTrained',
  'phaseUnderstoodExplained',
  'phaseUsed',
] as const

type NextStep = {
  icon: ReactNode
  text: string
  cta?: { label: string; to?: string; href?: string }
  urgent?: boolean
}

function formatClassDate(value: string): string {
  return new Date(value).toLocaleString(uiLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getNextStep(data: HomeCoachingData): NextStep {
  const { membership, board } = data
  if (!board) {
    return { icon: <TargetGlyph size={14} />, text: t('Abre tu coaching para ver tu semana.') }
  }
  const period = board.periodNumber
  const now = Date.now()
  const classes = board.classes.filter((row) => row.periodNumber === period)
  const joinUrl = board.session.classJoinUrl?.trim() || membership.classJoinUrl?.trim() || ''

  const liveClass = classes.find((row) => {
    if (!row.scheduledAt) return false
    const ts = new Date(row.scheduledAt).getTime()
    return Math.abs(now - ts) <= 15 * 60 * 1000
  })
  if (liveClass && joinUrl) {
    return {
      icon: <span className='inline-block size-2.5 animate-pulse rounded-full bg-red-500' />,
      text: t('Tu clase {n} empieza ahora', { n: liveClass.classIndex }),
      cta: { label: t('Entrar'), href: joinUrl },
      urgent: true,
    }
  }

  const readyFocus = board.focuses.find((focus) => {
    if (focus.periodNumber !== period || focus.archivedAt) return false
    if (!focus.phaseExplained || focus.phaseTrained) return false
    const exercise = board.focusExercises.find((row) => row.focusId === focus.id)
    const latestAttempt = board.focusExerciseAttempts.find((row) => row.focusId === focus.id)
    return exercise?.status === 'ready' && !latestAttempt?.passed
  })
  if (readyFocus) {
    return {
      icon: <DumbbellIcon className='size-3.5' strokeWidth={2.4} />,
      text: t('Tu entrenamiento de «{focus}» está listo', { focus: readyFocus.focusTitle }),
      cta: {
        label: t('Entrenar'),
        to: getCoachingV2ExerciseRoute(membership.id, period, readyFocus.id),
      },
      urgent: true,
    }
  }

  // Feedback to an audio task from the last 2 days (Luis, 6 Oct).
  const recentFeedback = classes
    .flatMap((row) => row.audioAnswers || [])
    .some((answer) => answer.feedbackAt && now - new Date(answer.feedbackAt).getTime() < 48 * 3600 * 1000)
  if (recentFeedback) {
    return {
      icon: <MicIcon className='size-3.5' strokeWidth={2.4} />,
      text: t('Tu coach te ha respondido a tu audio'),
      cta: { label: t('Escuchar'), to: getCoachingPersonalizedSessionRoute(membership.id) },
      urgent: true,
    }
  }

  const tasks = classes.flatMap((row) => ([1, 2, 3] as const).map((task) => isTaskAnswered(row, task)))
  const pendingTasks = tasks.filter((answered) => !answered).length
  if (tasks.length > 0 && pendingTasks > 0) {
    return {
      icon: <ClipboardListIcon className='size-3.5' strokeWidth={2.4} />,
      text: tn(pendingTasks, t('Te falta {n} tarea de esta semana'), t('Te faltan {n} tareas de esta semana')),
    }
  }

  if (board.periodReport && (board.periodReport.reportImageUrl || board.periodReport.reportText)) {
    return { icon: <FileTextIcon className='size-3.5' strokeWidth={2.4} />, text: t('Tu reporte de la semana está listo') }
  }

  const nextClass = classes
    .filter((row) => row.scheduledAt && new Date(row.scheduledAt).getTime() > now)
    .sort((a, b) => new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime())[0]
  if (nextClass?.scheduledAt) {
    return { icon: <CalendarDaysIcon className='size-3.5' strokeWidth={2.4} />, text: t('Próxima clase: {date}', { date: formatClassDate(nextClass.scheduledAt) }) }
  }

  return { icon: <CheckCircle2Icon className='size-3.5' strokeWidth={2.4} />, text: t('Todo al día') }
}

type CoachingHomeCardProps = {
  targetLang: string
  className?: string
  /** Versión pequeña (móvil): solo «Tu coaching» y el siguiente paso, con «Entrenar» si toca. */
  compact?: boolean
  /** Avisa al padre de si hay coaching activo (para colocar la tarjeta). */
  onAvailabilityChange?: (available: boolean) => void
}

export function CoachingHomeCard({
  targetLang,
  className,
  compact = false,
  onAvailabilityChange,
}: CoachingHomeCardProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const key = cacheKey(user?.id, targetLang)
  const [data, setData] = useState<HomeCoachingData | null>(() =>
    cache?.key === key ? cache.data : null,
  )

  useEffect(() => {
    let active = true
    void loadHomeCoaching(user?.id, targetLang)
      .then((result) => {
        if (!active) return
        setData(result)
        rememberHomeCoaching(key, Boolean(result))
        onAvailabilityChange?.(Boolean(result))
      })
      .catch(() => {
        if (!active) return
        if (!cache || cache.key !== key) onAvailabilityChange?.(false)
      })
    return () => {
      active = false
    }
  }, [key, onAvailabilityChange, targetLang, user?.id])

  if (!data) {
    // Mientras carga, si esperamos coaching, se ve ya la tarjeta (sin datos) en su sitio:
    // nada salta y no aparece un bloque gris genérico.
    if (!expectsHomeCoaching(user?.id, targetLang)) return null
    return compact ? (
      <div
        role='status'
        aria-label={t('Cargando tu coaching')}
        className={cn('coaching-hero relative flex min-h-[64px] w-full items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5 text-white', className)}
      >
        <span
          className='flex size-10 shrink-0 items-center justify-center rounded-xl'
          style={{ background: 'var(--ica-gold)', boxShadow: '0 3px 0 var(--ica-gold-edge)' }}
          aria-hidden='true'
        >
          <CrownIcon className='size-5' strokeWidth={2.6} style={{ color: '#4a3200' }} />
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block text-sm leading-tight font-black'>{t('Tu coaching')}</span>
          <span className='mt-0.5 block text-xs font-bold text-white/70'>{t('Preparando tu semana...')}</span>
        </span>
        <LoaderCircleIcon className='size-4 shrink-0 animate-spin text-white/60' aria-hidden='true' />
      </div>
    ) : (
      <div
        role='status'
        aria-label={t('Cargando tu coaching')}
        className={cn('coaching-hero relative flex min-h-[230px] w-full flex-col overflow-hidden rounded-[28px] px-6 py-5 text-white', className)}
      >
        <span className='coaching-hero-glow pointer-events-none absolute -top-20 -right-16 size-64 rounded-full' aria-hidden='true' />
        <div className='relative flex items-start justify-between gap-3'>
          <div>
            <p
              className='m-0 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-black tracking-[0.14em] uppercase'
              style={{ color: 'var(--ica-gold)' }}
            >
              <CrownIcon className='size-3' strokeWidth={2.8} aria-hidden='true' />
              {t('Tu coaching')}
            </p>
            <p className='m-0 mt-2 text-xs font-bold text-white/70'>{t('Preparando tu semana...')}</p>
          </div>
          <LoaderCircleIcon className='mt-1 size-4 animate-spin text-white/60' aria-hidden='true' />
        </div>
        <div className='relative mt-5 flex items-center gap-1' aria-hidden='true'>
          <span className='h-2 w-14 rounded-full' style={{ background: 'var(--ica-gold)' }} />
          <span className='h-2 flex-1 rounded-full bg-white/15' />
        </div>
        <div className='relative mt-4 space-y-2.5' aria-hidden='true'>
          {['w-2/3', 'w-1/2', 'w-3/5'].map((width, row) => (
            <div key={row} className='flex items-center justify-between gap-4'>
              <span className={cn('h-3 animate-pulse rounded-full bg-white/15', width)} />
              <span className='flex gap-1'>
                {[0, 1, 2, 3].map((pip) => (
                  <span
                    key={pip}
                    className='h-2 w-4 animate-pulse rounded-full bg-white/15'
                    style={{ animationDelay: `${(row * 4 + pip) * 70}ms` }}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className='relative mt-auto border-t border-white/12 pt-3' aria-hidden='true'>
          <span className='inline-block h-3 w-3/4 animate-pulse rounded-full bg-white/15' />
        </div>
      </div>
    )
  }

  const { membership, board } = data
  const totalWeeks = board?.session.durationPeriods || membership.durationPeriods || 10
  const currentWeek = board?.periodNumber || 1
  const closedWeeks = new Set(
    (board?.periodActivations || []).filter((row) => row.endedAt).map((row) => row.periodNumber),
  )
  const rings = buildWeekRings({
    classes: board?.classes || [],
    durationPeriods: totalWeeks,
    activatedPeriods: new Set((board?.periodActivations || []).map((row) => row.periodNumber)),
    closedPeriods: closedWeeks,
  })
  const activeFocuses = (board?.focuses || [])
    .filter((focus) => focus.periodNumber === currentWeek && !focus.archivedAt)
    .filter((focus) => !PHASE_KEYS.every((key) => focus[key]))
    .slice(0, 3)
  const step = getNextStep(data)
  const sessionRoute = getCoachingPersonalizedSessionRoute(membership.id)

  const runCta = () => {
    if (step.cta?.href) {
      window.open(step.cta.href, '_blank', 'noopener,noreferrer')
      return
    }
    if (step.cta?.to) navigate(step.cta.to)
  }

  if (compact) {
    return (
      <div
        role='button'
        tabIndex={0}
        onClick={() => navigate(sessionRoute)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            navigate(sessionRoute)
          }
        }}
        className={cn(
          'coaching-hero relative flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5 text-left text-white active:translate-y-[2px]',
          className,
        )}
      >
        <span
          className='flex size-10 shrink-0 items-center justify-center rounded-xl'
          style={{ background: 'var(--ica-gold)', boxShadow: '0 3px 0 var(--ica-gold-edge)' }}
        >
          <CrownIcon className='size-5' strokeWidth={2.6} style={{ color: '#4a3200' }} aria-hidden='true' />
        </span>
        <span className='min-w-0 flex-1'>
          <span className='flex items-center gap-1.5 text-sm leading-tight font-black whitespace-nowrap'>
            {t('Tu coaching')}
            <span className='rounded-full bg-white/12 px-1.5 py-px text-[11px] font-black' style={{ color: 'var(--ica-gold)' }}>
              {t('Semana {n}/{total}', { n: currentWeek, total: totalWeeks })}
            </span>
          </span>
          <span className='mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-bold text-white/75'>
            <span className='flex shrink-0 items-center' aria-hidden='true'>{step.icon}</span>
            <span className='truncate'>{step.text}</span>
          </span>
        </span>
        {step.cta ? (
          <button
            type='button'
            className='shrink-0 rounded-xl px-3 py-2 text-xs font-black active:translate-y-0.5'
            style={{ background: 'var(--ica-gold)', color: '#4a3200', boxShadow: '0 3px 0 var(--ica-gold-edge)' }}
            onClick={(event) => {
              event.stopPropagation()
              runCta()
            }}
          >
            {step.cta.label}
          </button>
        ) : (
          <ChevronRightIcon className='size-5 shrink-0 text-white/70' aria-hidden='true' />
        )}
      </div>
    )
  }

  return (
    <div
      role='button'
      tabIndex={0}
      onClick={() => navigate(sessionRoute)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          navigate(sessionRoute)
        }
      }}
      className={cn(
        // Aspecto premium: el mismo azul noche y oro que la zona de coaching.
        'coaching-hero group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-[28px] px-6 py-5 text-left text-white transition-transform duration-200 hover:-translate-y-[2px]',
        className,
      )}
    >
      <span className='coaching-hero-glow pointer-events-none absolute -top-20 -right-16 size-64 rounded-full' aria-hidden='true' />
      <div className='relative flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p
            className='m-0 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-black tracking-[0.14em] uppercase'
            style={{ color: 'var(--ica-gold)' }}
          >
            <CrownIcon className='size-3' strokeWidth={2.8} aria-hidden='true' />
            {t('Tu coaching')}
          </p>
          {/* Level and coach sit small next to the language, to save a line (Luis, 6 Oct). */}
          <h2 className='m-0 mt-2 flex flex-wrap items-baseline gap-x-2 font-display text-2xl leading-none font-black tracking-tight'>
            {langName(membership.targetLang)}
            <span className='font-sans text-xs font-bold tracking-normal text-white/70'>
              {membership.level} · {(() => {
                const second = (membership.coachDisplayName || '').trim()
                return second && second.toLowerCase() !== 'luis' ? t('con Luis y {name}', { name: second }) : t('con Luis')
              })()}
            </span>
          </h2>
        </div>
        <p className='m-0 shrink-0 text-right text-xs font-bold text-white/70'>
          {t('Semana')}
          <b className='block font-display text-3xl leading-none font-black text-white'>
            {currentWeek}
            <span className='text-sm font-bold text-white/50'>/{totalWeeks}</span>
          </b>
        </p>
      </div>

      {/* Recorrido: un anillo por semana, se llena con las 6 tareas (Luis, 6 oct). */}
      <div className='relative mt-4'>
        <CoachingWeekRingsMini rings={rings} currentPeriod={currentWeek} />
      </div>

      {/* The week's focuses side by side in one row, so the card keeps its height with 1, 2 or 3
          and your level and ICA games stay in view (Luis, 6 Oct). */}
      <div className='relative mt-4'>
        {activeFocuses.length === 0 ? (
          <p className='m-0 text-xs font-semibold text-white/70'>{t('Tu coach añadirá tus focos en la próxima clase.')}</p>
        ) : (
          <div className='grid grid-cols-3 gap-2'>
            {activeFocuses.map((focus) => {
              const progress = PHASE_KEYS.filter((key) => focus[key]).length
              return (
                <div key={focus.id} className='min-w-0 rounded-xl bg-white/8 px-2.5 py-2'>
                  <span className='block truncate text-[13px] leading-tight font-bold'>{focus.focusTitle}</span>
                  <span className='mt-1.5 flex items-center gap-1' aria-label={t('{n} de 4 fases', { n: progress })}>
                    {PHASE_KEYS.map((key, idx) => (
                      <span
                        key={key}
                        className='h-1.5 flex-1 rounded-full'
                        style={{ background: idx < progress ? 'var(--ica-gold)' : 'rgba(255,255,255,0.18)' }}
                      />
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Siguiente paso */}
      <div className='relative mt-4 flex items-center justify-between gap-3 border-t border-white/12 pt-3'>
        <p className='m-0 flex items-center gap-1.5 text-xs font-bold text-white/80'>
          <span className='flex items-center' aria-hidden='true'>{step.icon}</span>
          <span>{step.text}</span>
        </p>
        {step.cta ? (
          <button
            type='button'
            className='shrink-0 rounded-xl px-3 py-1.5 text-xs font-black active:translate-y-0.5'
            style={{ background: 'var(--ica-gold)', color: '#4a3200', boxShadow: '0 3px 0 var(--ica-gold-edge)' }}
            onClick={(event) => {
              event.stopPropagation()
              runCta()
            }}
          >
            {step.cta.label}
          </button>
        ) : null}
      </div>
    </div>
  )
}
