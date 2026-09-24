import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
const FLAG_KEY = (targetLang: string) => `ica.homeCoaching.${targetLang}`

export function expectsHomeCoaching(targetLang: string): boolean {
  if (cache && cache.key === targetLang) return Boolean(cache.data)
  try {
    return window.localStorage.getItem(FLAG_KEY(targetLang)) === '1'
  } catch {
    return false
  }
}

function rememberHomeCoaching(targetLang: string, available: boolean) {
  try {
    window.localStorage.setItem(FLAG_KEY(targetLang), available ? '1' : '0')
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/* Tras entregar un ejercicio o cambiar algo del coaching, la home debe pedirlo de nuevo. */
export function invalidateHomeCoachingCache() {
  cache = null
}

async function loadHomeCoaching(targetLang: string): Promise<HomeCoachingData | null> {
  if (cache && cache.key === targetLang && Date.now() - cache.at < CACHE_TTL_MS) {
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
  cache = { key: targetLang, at: Date.now(), data }
  return data
}

const PHASE_KEYS = [
  'phaseExplained',
  'phaseTrained',
  'phaseUnderstoodExplained',
  'phaseUsed',
] as const

type NextStep = {
  emoji: string
  text: string
  cta?: { label: string; to?: string; href?: string }
  urgent?: boolean
}

function formatClassDate(value: string): string {
  return new Date(value).toLocaleString('es-ES', {
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
    return { emoji: '🎯', text: 'Abre tu coaching para ver tu semana.' }
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
      emoji: '🔴',
      text: `Tu clase ${liveClass.classIndex} empieza ahora`,
      cta: { label: 'Entrar', href: joinUrl },
      urgent: true,
    }
  }

  const readyFocus = board.focuses.find((focus) => {
    if (focus.periodNumber !== period || focus.archivedAt) return false
    if (!focus.phaseExplained || focus.phaseTrained) return false
    const exercise = board.focusExercises.find((row) => row.focusId === focus.id)
    const attempted = board.focusExerciseAttempts.some((row) => row.focusId === focus.id)
    return exercise?.status === 'ready' && !attempted
  })
  if (readyFocus) {
    return {
      emoji: '💪',
      text: `Tu entrenamiento de «${readyFocus.focusTitle}» está listo`,
      cta: {
        label: 'Entrenar',
        to: getCoachingV2ExerciseRoute(membership.id, period, readyFocus.id),
      },
      urgent: true,
    }
  }

  const tasks = classes.flatMap((row) => [
    row.studentGuidelineResponse1,
    row.studentGuidelineResponse2,
    row.studentGuidelineResponse3,
  ])
  const pendingTasks = tasks.filter((value) => !value?.trim()).length
  if (tasks.length > 0 && pendingTasks > 0) {
    return {
      emoji: '📝',
      text: `Te ${pendingTasks === 1 ? 'falta 1 tarea' : `faltan ${pendingTasks} tareas`} de esta semana`,
    }
  }

  if (board.periodReport && (board.periodReport.reportImageUrl || board.periodReport.reportText)) {
    return { emoji: '📄', text: 'Tu reporte de la semana está listo' }
  }

  const nextClass = classes
    .filter((row) => row.scheduledAt && new Date(row.scheduledAt).getTime() > now)
    .sort((a, b) => new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime())[0]
  if (nextClass?.scheduledAt) {
    return { emoji: '📅', text: `Próxima clase: ${formatClassDate(nextClass.scheduledAt)}` }
  }

  return { emoji: '✅', text: 'Todo al día esta semana' }
}

type CoachingHomeCardProps = {
  targetLang: string
  className?: string
  /** Avisa al padre de si hay coaching activo (para colocar la tarjeta). */
  onAvailabilityChange?: (available: boolean) => void
}

export function CoachingHomeCard({
  targetLang,
  className,
  onAvailabilityChange,
}: CoachingHomeCardProps) {
  const navigate = useNavigate()
  const [data, setData] = useState<HomeCoachingData | null>(
    cache?.key === targetLang ? cache.data : null,
  )

  useEffect(() => {
    let active = true
    void loadHomeCoaching(targetLang)
      .then((result) => {
        if (!active) return
        setData(result)
        rememberHomeCoaching(targetLang, Boolean(result))
        onAvailabilityChange?.(Boolean(result))
      })
      .catch(() => {
        if (!active) return
        onAvailabilityChange?.(false)
      })
    return () => {
      active = false
    }
  }, [onAvailabilityChange, targetLang])

  if (!data) {
    // Mientras carga, si esperamos coaching, reservamos su hueco para que nada salte.
    return expectsHomeCoaching(targetLang) ? (
      <div
        aria-hidden='true'
        className={cn(
          'min-h-[230px] animate-pulse rounded-[20px] border border-sky-400/25 bg-sky-400/5',
          className,
        )}
      />
    ) : null
  }

  const { membership, board } = data
  const totalWeeks = board?.session.durationPeriods || membership.durationPeriods || 10
  const currentWeek = board?.periodNumber || 1
  const closedWeeks = new Set(
    (board?.periodActivations || []).filter((row) => row.endedAt).map((row) => row.periodNumber),
  )
  const activeFocuses = (board?.focuses || [])
    .filter((focus) => focus.periodNumber === currentWeek && !focus.archivedAt)
    .filter((focus) => !PHASE_KEYS.every((key) => focus[key]))
    .slice(0, 3)
  const step = getNextStep(data)
  const sessionRoute = getCoachingPersonalizedSessionRoute(membership.id)

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
        'relative flex w-full cursor-pointer flex-col overflow-hidden rounded-[20px] border border-sky-400/35 px-[25px] py-6 text-left transition-[transform,box-shadow] duration-250 hover:-translate-y-[2px] hover:shadow-[0_0_0_1px_rgba(96,165,250,0.5),0_0_24px_rgba(59,130,246,0.33)]',
        'bg-[linear-gradient(180deg,rgba(59,130,246,0.1),rgba(59,130,246,0.03)),linear-gradient(160deg,#ffffff,#eef3f9)] dark:bg-[linear-gradient(180deg,rgba(59,130,246,0.12),rgba(59,130,246,0.04)),linear-gradient(160deg,#0f172a,#0a0f1a)]',
        step.urgent && 'border-sky-400/80 shadow-[0_0_0_1px_rgba(96,165,250,0.45),0_0_22px_rgba(59,130,246,0.28)]',
        className,
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <div className='text-3xl'>🎯</div>
          <div>
            <h2 className='m-0 font-serif text-lg font-bold tracking-widest text-slate-700 dark:text-slate-100'>
              TU COACHING
            </h2>
            <p className='m-0 text-xs text-slate-500'>
              {membership.targetLang} · {membership.level}
            </p>
          </div>
        </div>
        <p className='m-0 text-right text-xs text-slate-500'>
          Semana{' '}
          <b className='font-serif text-2xl leading-none text-slate-700 dark:text-slate-100'>
            {currentWeek}
          </b>{' '}
          de {totalWeeks}
        </p>
      </div>

      {/* Recorrido de semanas */}
      <div
        className='mt-4 grid gap-1'
        style={{ gridTemplateColumns: `repeat(${totalWeeks}, minmax(0, 1fr))` }}
        aria-label={`Semana ${currentWeek} de ${totalWeeks}`}
      >
        {Array.from({ length: totalWeeks }, (_, idx) => {
          const week = idx + 1
          const done = closedWeeks.has(week) || week < currentWeek
          const current = week === currentWeek
          return (
            <span
              key={week}
              className={cn(
                'h-1.5 rounded-full',
                current
                  ? 'bg-[#3B82F6]'
                  : done
                    ? 'bg-amber-400'
                    : 'bg-slate-300/70 dark:bg-slate-700',
              )}
            />
          )
        })}
      </div>

      {/* Los focos de la semana */}
      <div className='mt-4 space-y-2'>
        {activeFocuses.length === 0 ? (
          <p className='m-0 text-xs text-slate-500'>
            Tu coach añadirá tus focos en la próxima clase.
          </p>
        ) : (
          activeFocuses.map((focus) => {
            const progress = PHASE_KEYS.filter((key) => focus[key]).length
            return (
              <div key={focus.id} className='flex items-center justify-between gap-3'>
                <span className='min-w-0 truncate text-sm font-medium text-slate-700 dark:text-slate-100'>
                  {focus.focusTitle}
                </span>
                <span className='flex shrink-0 items-center gap-1' aria-label={`${progress} de 4 fases`}>
                  {PHASE_KEYS.map((key, idx) => (
                    <span
                      key={key}
                      className={cn(
                        'h-1.5 w-4 rounded-full',
                        idx < progress ? 'bg-[#3B82F6]' : 'bg-slate-300/70 dark:bg-slate-700',
                      )}
                    />
                  ))}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Siguiente paso */}
      <div className='mt-4 flex items-center justify-between gap-3 border-t border-sky-400/20 pt-3'>
        <p className='m-0 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-300'>
          <span aria-hidden='true'>{step.emoji}</span>
          <span>{step.text}</span>
        </p>
        {step.cta ? (
          <button
            type='button'
            className='shrink-0 rounded-full bg-[#3B82F6] px-3 py-1 text-xs font-bold text-white transition hover:bg-[#2563eb]'
            onClick={(event) => {
              event.stopPropagation()
              if (step.cta?.href) {
                window.open(step.cta.href, '_blank', 'noopener,noreferrer')
                return
              }
              if (step.cta?.to) navigate(step.cta.to)
            }}
          >
            {step.cta.label}
          </button>
        ) : null}
      </div>
    </div>
  )
}
