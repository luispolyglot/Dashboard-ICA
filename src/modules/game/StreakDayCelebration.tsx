import { DASHBOARD_ROUTES } from '../routes/paths'
import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { CheckIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { t, tn, uiLocale } from '@/i18n'
import { useDashboardContext } from '../context/DashboardContext'
import { GOAL, getTodayProgress } from '../constants'
import { getStreak, shiftIsoDay, todayKey } from '../utils'
import { CardsIcon, FlameIcon } from './icons'
import { gameSfx } from './sfx'
import { getIcaStreakState } from './streak'

type Kind = 'ica' | 'flashcards'

type Detail = {
  kind: Kind
  streak: number
  days: string[]
}

const SHOWN_KEY = 'ica-streak-day-shown-v1'

function shownKey(userId: string | undefined, kind: Kind, day: string): string {
  return `${SHOWN_KEY}:${userId ?? 'anon'}:${kind}:${day}`
}

function wasShown(userId: string | undefined, kind: Kind, day: string): boolean {
  try {
    return window.localStorage.getItem(shownKey(userId, kind, day)) === '1'
  } catch {
    return false
  }
}

function markShown(userId: string | undefined, kind: Kind, day: string): void {
  try {
    window.localStorage.setItem(shownKey(userId, kind, day), '1')
  } catch {
    /* sin almacenamiento no pasa nada */
  }
}

/** Lunes a domingo de esta semana (en formato AAAA-MM-DD). */
function thisWeek(today: string): string[] {
  const [y, m, d] = today.split('-').map(Number)
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7 // 0 = lunes
  const monday = shiftIsoDay(today, -weekday)
  return Array.from({ length: 7 }, (_, i) => shiftIsoDay(monday, i))
}

function weekdayLetter(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(uiLocale(), { weekday: 'narrow' }).toUpperCase()
}

/**
 * Pantalla grande de "Racha diaria completada".
 * Sale sola, una vez al día, en el momento en que se completa:
 * - el ciclo I·C·A del día (5 palabras + 1 frase + 1 activación), o
 * - la meta de 10 flashcards acertadas.
 */
export function StreakDayCelebrationHost() {
  const { user } = useAuth()
  const {
    dailyProgress,
    completedDays,
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
  } = useDashboardContext()
  const [detail, setDetail] = useState<Detail | null>(null)
  const navigate = useNavigate()
  const today = todayKey()
  const progress = getTodayProgress(dailyProgress)
  const icaState = getIcaStreakState({
    creationDays: creationDays || [],
    savedCreationDays: savedCreationDays || [],
    creationSavesUsedThisMonth: creationSavesUsedThisMonth || 0,
    creationSavesLimit: creationSavesLimit || 0,
    todayProgress: progress,
  })
  const icaDone = icaState.cycleDoneToday
  const flashDone = progress.reviewCorrect >= GOAL

  // Solo celebramos el CAMBIO (de no hecho a hecho) mientras la app está abierta.
  const prev = useRef<{ ica: boolean; flash: boolean } | null>(null)

  useEffect(() => {
    const before = prev.current
    prev.current = { ica: icaDone, flash: flashDone }
    if (!before) return

    let next: Detail | null = null
    if (icaDone && !before.ica && !wasShown(user?.id, 'ica', today)) {
      const days = [...(creationDays || []), ...(savedCreationDays || [])]
      if (!days.includes(today)) days.push(today)
      next = { kind: 'ica', streak: Math.max(1, icaState.streak), days }
      markShown(user?.id, 'ica', today)
    } else if (flashDone && !before.flash && !wasShown(user?.id, 'flashcards', today)) {
      const days = [...(completedDays || [])]
      if (!days.includes(today)) days.push(today)
      next = { kind: 'flashcards', streak: Math.max(1, getStreak(days)), days }
      markShown(user?.id, 'flashcards', today)
    }
    if (!next) return

    setDetail(next)
    gameSfx.streak()
    try {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const colors = next.kind === 'ica' ? ['#ff7a1a', '#ffc21a', '#ff4d4d'] : ['#3b82f6', '#ffc21a', '#22c55e']
        window.setTimeout(() => {
          void confetti({ particleCount: 70, spread: 80, startVelocity: 38, origin: { y: 0.42 }, colors, zIndex: 130 })
        }, 900)
      }
    } catch {
      /* sin confeti no pasa nada */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [icaDone, flashDone])

  if (!detail) return null
  return (
    <StreakDayCelebration
      detail={detail}
      onClose={() => {
        setDetail(null)
        // Racha ICA hecha: a Inicio, donde espera el cofre del ciclo.
        if (detail.kind === 'ica') navigate(DASHBOARD_ROUTES.home)
      }}
    />
  )
}

/** La pantalla en sí (también se usa en las pruebas visuales). */
export function StreakDayCelebration({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  const isIca = detail.kind === 'ica'
  const color = isIca ? 'var(--ica-fire)' : 'var(--ica-i)'
  const ink = isIca ? 'var(--ica-fire-ink)' : 'var(--ica-i-ink)'
  const soft = isIca ? 'var(--ica-fire-soft)' : 'var(--ica-i-soft)'
  const today = todayKey()
  const week = thisWeek(today)
  const done = new Set(detail.days)

  return (
    <div
      className='fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-background/95 px-5 py-8 backdrop-blur-sm'
      role='dialog'
      aria-modal='true'
      aria-label={t('Racha diaria completada')}
    >
      {/* Luz de fondo */}
      <div
        className='pointer-events-none absolute inset-0'
        style={{ background: `radial-gradient(60% 45% at 50% 32%, color-mix(in oklab, ${color} 22%, transparent), transparent 70%)` }}
        aria-hidden='true'
      />

      <div className='relative flex w-full max-w-sm flex-col items-center text-center'>
        <span
          className='ica-fade-up inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black tracking-[0.12em] uppercase'
          style={{ background: soft, color: ink }}
        >
          {isIca ? (
            <span className='font-ica tracking-normal'>I·C·A</span>
          ) : (
            <>
              <CardsIcon size={16} />
              {t('Flashcards')}
            </>
          )}
        </span>

        {/* Llama con anillos */}
        <div className='relative mt-6 flex size-48 items-center justify-center'>
          <span className='ica-streak-ring absolute inset-6 rounded-full border-4' style={{ borderColor: color }} aria-hidden='true' />
          <span
            className='ica-streak-ring absolute inset-6 rounded-full border-4'
            style={{ borderColor: color, animationDelay: '0.8s' }}
            aria-hidden='true'
          />
          <span className='absolute inset-8 rounded-full' style={{ background: soft }} aria-hidden='true' />
          <span className='ica-badge-reveal relative'>
            <FlameIcon size={128} tone={isIca ? 'fire' : 'flash'} />
          </span>
        </div>

        {/* Número de días: el de ayer sube y entra el de hoy */}
        <div className='relative mt-1 h-[84px] w-full overflow-hidden' aria-live='polite'>
          {detail.streak > 1 ? (
            <span
              className='ica-streak-old absolute inset-x-0 top-0 font-display text-[80px] leading-none font-black tabular-nums'
              style={{ color: ink }}
              aria-hidden='true'
            >
              {detail.streak - 1}
            </span>
          ) : null}
          <span
            className='ica-streak-new absolute inset-x-0 top-0 font-display text-[80px] leading-none font-black tabular-nums'
            style={{ color: ink }}
          >
            {detail.streak}
          </span>
        </div>
        <p className='ica-fade-up m-0 text-base font-extrabold' style={{ color: ink, animationDelay: '0.3s' }}>
          {tn(detail.streak, 'día de racha', 'días de racha')}
        </p>

        <h2
          className='ica-fade-up m-0 mt-4 font-display text-3xl leading-tight font-black tracking-tight'
          style={{ animationDelay: '0.45s' }}
        >
          {t('¡Racha diaria completada!')}
        </h2>
        <p className='ica-fade-up m-0 mt-2 text-sm font-semibold text-muted-foreground' style={{ animationDelay: '0.55s' }}>
          {isIca
            ? t('Has aplicado I·C·A hoy. Vuelve mañana para que siga creciendo.')
            : t('Has acertado {n} flashcards hoy. Vuelve mañana para que siga creciendo.', { n: GOAL })}
        </p>

        {/* Semana */}
        <div
          className='ica-fade-up mt-6 flex w-full justify-between rounded-3xl border-2 border-border bg-card px-3 py-3'
          style={{ animationDelay: '0.65s' }}
        >
          {week.map((day) => {
            const isToday = day === today
            const isDone = done.has(day)
            return (
              <span key={day} className='flex flex-col items-center gap-1.5'>
                <span className={`text-[11px] font-black ${isToday ? '' : 'text-muted-foreground'}`} style={isToday ? { color: ink } : undefined}>
                  {weekdayLetter(day)}
                </span>
                <span
                  className={`flex size-8 items-center justify-center rounded-full ${isToday ? 'ica-streak-day' : ''}`}
                  style={
                    isDone
                      ? { background: color, color: '#fff' }
                      : { background: 'var(--muted)', border: '2px solid var(--border)' }
                  }
                >
                  {isDone ? <CheckIcon className='size-4' strokeWidth={3.4} aria-hidden='true' /> : null}
                </span>
              </span>
            )
          })}
        </div>

        <Button
          type='button'
          size='xl'
          variant={isIca ? 'fire' : 'i'}
          className='ica-fade-up mt-6 w-full'
          style={{ animationDelay: '0.75s' }}
          onClick={onClose}
        >
          {t('¡Seguimos!')}
        </Button>
      </div>
    </div>
  )
}
