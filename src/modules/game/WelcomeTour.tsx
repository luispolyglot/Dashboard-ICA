import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthContext'
import { t } from '@/i18n'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { CHALLENGE_NOTE_MIN_CLOSED_NOTES, FLASHCARDS_MIN_ACTIVATED_WORDS } from './rules'

/**
 * WELCOME TOUR (Luis, 7 Oct): like the guide in Clash of Clans, a friendly character walks a new
 * icademer through the main things: the I·C·A cycle, the chest and the daily challenge, coins and
 * streak, the monthly ranking and the four ICA games. It dims the screen and lights up each part.
 *
 * - Shown once per account and device, only to accounts created in the last NEW_ACCOUNT_DAYS days.
 * - `?tour=1` in the address starts it for anyone (to try it or show it again).
 * - Each step lights up the elements marked with `data-tour` / `data-ica-step`; if a step's element
 *   is not on screen (for example a game switched off), that step is skipped.
 */

const SEEN_KEY = 'ica-welcome-tour-v1'
const NEW_ACCOUNT_DAYS = 14
const START_DELAY_MS = 900
const FIND_TIMEOUT_MS = 1500
const SPOT_PADDING = 10

type TourStep = {
  id: string
  route: string
  /** CSS selectors; the light covers all of the visible ones together. None = centred card. */
  targets?: string[]
  title: string
  body: string
}

function buildSteps(name: string): TourStep[] {
  const home = DASHBOARD_ROUTES.home
  const games = DASHBOARD_ROUTES.gamesIca
  return [
    {
      id: 'hello',
      route: home,
      title: name ? t('¡Hola, {name}! Te doy la bienvenida a ICA', { name }) : t('¡Hola! Te doy la bienvenida a ICA'),
      body: t('En un minuto te enseño lo más importante para que no te pierdas.'),
    },
    {
      id: 'cycle',
      route: home,
      targets: ['[data-ica-step="I"]', '[data-ica-step="C"]', '[data-ica-step="A"]'],
      title: t('Tu ciclo ICA de cada día'),
      body: t('Tres pasos, en orden: Inmersión (guarda 5 palabras nuevas), Creación (crea 1 frase con ellas) y Activación (grábala con tu voz). Cada día que lo completas, tu racha sube.'),
    },
    {
      id: 'rewards',
      route: home,
      targets: ['[data-ica-step="chest"]', '[data-ica-step="review"]'],
      title: t('Tus premios del día'),
      body: t('Al completar I·C·A se abren el cofre, con ICA Coins, y el reto del día: un minijuego con tus palabras ICA.'),
    },
    {
      id: 'wallet',
      route: home,
      targets: ['[data-tour="wallet"]'],
      title: t('Tu racha y tus ICA Coins'),
      body: t('Aquí arriba ves tu racha (los días seguidos que completas el ciclo) y tus ICA Coins. Las monedas se gastan en la tienda: intentos extra de PreguntICA, ampliar el día o la bandera de tu idioma.'),
    },
    {
      id: 'ranking',
      route: DASHBOARD_ROUTES.leaderboard,
      targets: ['[data-tour="nav-ranking"]'],
      title: t('El ranking del mes'),
      body: t('Todo lo que haces en ICA suma puntos. Aquí compites con los demás icademers: el ranking se cierra el día 28 y el mes siguiente vuelve a empezar.'),
    },
    {
      id: 'flashcards',
      route: games,
      targets: ['[data-tour="game-flashcards"]'],
      title: t('Juegos ICA: Flashcards'),
      body: t('Repasa tus palabras ICA para no olvidarlas. Se abren cuando tienes {n} palabras activadas.', { n: FLASHCARDS_MIN_ACTIVATED_WORDS }),
    },
    {
      id: 'challenges',
      route: games,
      targets: ['[data-tour="game-challenges"]'],
      title: t('Juegos ICA: Desafíos ICA'),
      body: t('Reta 1 contra 1 a otros icademers con tus palabras ICA y gana ICA Coins.'),
    },
    {
      id: 'preguntica',
      route: games,
      targets: ['[data-tour="game-preguntica"]'],
      title: t('Juegos ICA: PreguntICA'),
      body: t('Una pregunta cada semana que respondes grabando tu voz. Se abre al activar palabras esa semana y suma puntos al ranking.'),
    },
    {
      id: 'challenge-note',
      route: games,
      targets: ['[data-tour="game-challenge-note"]'],
      title: t('Juegos ICA: Nota desafiante'),
      body: t('Escuchas trozos de tus notas maestras en tu idioma y los dices de memoria en el idioma que aprendes. Se abre con {n} notas maestras terminadas.', { n: CHALLENGE_NOTE_MIN_CLOSED_NOTES }),
    },
    {
      id: 'start',
      route: home,
      targets: ['[data-ica-step="I"]'],
      title: t('¡Listo! Ya lo tienes'),
      body: t('Empieza hoy por Inmersión: guarda tus primeras 5 palabras.'),
    },
  ]
}

function seenKey(userId: string): string {
  return `${SEEN_KEY}:${userId}`
}

function readSeen(userId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(userId)) === '1'
  } catch {
    // Without storage we cannot remember it: better not to show it every time.
    return true
  }
}

function writeSeen(userId: string): void {
  try {
    window.localStorage.setItem(seenKey(userId), '1')
  } catch {
    /* nothing to do */
  }
}

function isNewAccount(createdAt: string | undefined): boolean {
  if (!createdAt) return false
  const created = Date.parse(createdAt)
  if (Number.isNaN(created)) return false
  return Date.now() - created < NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000
}

function wantsTourFromUrl(search: string): boolean {
  return new URLSearchParams(search).get('tour') === '1'
}

type Box = { top: number; left: number; width: number; height: number }

/** The visible elements of a step, or null if none is on screen yet. */
function findTargets(selectors: string[]): HTMLElement[] | null {
  const found: HTMLElement[] = []
  for (const selector of selectors) {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) found.push(element)
    })
  }
  return found.length > 0 ? found : null
}

function unionBox(elements: HTMLElement[]): Box {
  let top = Infinity
  let left = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const element of elements) {
    const rect = element.getBoundingClientRect()
    top = Math.min(top, rect.top)
    left = Math.min(left, rect.left)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
  }
  return {
    top: top - SPOT_PADDING,
    left: left - SPOT_PADDING,
    width: right - left + SPOT_PADDING * 2,
    height: bottom - top + SPOT_PADDING * 2,
  }
}

export function WelcomeTour() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const firstName = String(user?.user_metadata?.display_name || '').trim().split(/\s+/)[0] ?? ''
  const steps = useMemo(() => buildSteps(firstName), [firstName])
  const [index, setIndex] = useState<number | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [ready, setReady] = useState(false)
  const targetsRef = useRef<HTMLElement[] | null>(null)
  const nextRef = useRef<HTMLButtonElement | null>(null)
  const forced = wantsTourFromUrl(location.search)

  // Start: new account on Home, once; or ?tour=1.
  useEffect(() => {
    if (!user?.id || index !== null) return
    if (location.pathname !== DASHBOARD_ROUTES.home) return
    if (!forced && (readSeen(user.id) || !isNewAccount((user as { created_at?: string }).created_at))) return
    const timer = window.setTimeout(() => setIndex(0), START_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [forced, index, location.pathname, user])

  const step = index !== null ? steps[index] : null

  const finish = useCallback(
    (goHome: boolean) => {
      if (user?.id) writeSeen(user.id)
      setIndex(null)
      setBox(null)
      targetsRef.current = null
      if (goHome && location.pathname !== DASHBOARD_ROUTES.home) navigate(DASHBOARD_ROUTES.home)
    },
    [location.pathname, navigate, user?.id],
  )

  // Go to the step's screen, then wait for its elements (skip the step if they never show up).
  useEffect(() => {
    if (!step) return
    setReady(false)
    setBox(null)
    targetsRef.current = null
    if (location.pathname !== step.route) {
      navigate(step.route)
      return
    }
    if (!step.targets) {
      setReady(true)
      return
    }
    const started = performance.now()
    let frame = 0
    const look = () => {
      const found = findTargets(step.targets ?? [])
      if (found) {
        targetsRef.current = found
        found[0].scrollIntoView({ block: 'center', behavior: 'smooth' })
        // Let the smooth scroll settle before lighting it up.
        window.setTimeout(() => {
          if (targetsRef.current === found) {
            setBox(unionBox(found))
            setReady(true)
          }
        }, 380)
        return
      }
      if (performance.now() - started > FIND_TIMEOUT_MS) {
        // Not on screen (for example a game that is switched off): skip this step.
        if (index !== null && index + 1 < steps.length) setIndex(index + 1)
        else finish(true)
        return
      }
      frame = window.requestAnimationFrame(look)
    }
    frame = window.requestAnimationFrame(look)
    return () => window.cancelAnimationFrame(frame)
    // finish and index are read when the step changes; re-running on their change would restart the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, navigate, step, steps.length])

  // Keep the light on its elements while the page scrolls or the window changes size.
  useLayoutEffect(() => {
    if (!step?.targets) return
    const update = () => {
      if (targetsRef.current) setBox(unionBox(targetsRef.current))
    }
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [step])

  useEffect(() => {
    if (ready) nextRef.current?.focus({ preventScroll: true })
  }, [ready, index])

  useEffect(() => {
    if (index === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish, index])

  if (index === null || !step || typeof document === 'undefined') return null

  const isLast = index === steps.length - 1
  const goNext = () => {
    if (!isLast) {
      setIndex(index + 1)
      return
    }
    // Last step: straight to Inmersión, where the day starts.
    finish(false)
    navigate(DASHBOARD_ROUTES.newIcaWords)
  }

  // The card goes where there is more room: under the light, or above it.
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800
  const cardAtTop = box ? box.top + box.height / 2 > viewportHeight * 0.55 : false
  const titleId = `ica-tour-title-${step.id}`

  return createPortal(
    <div className='fixed inset-0 z-[70]' role='dialog' aria-modal='true' aria-labelledby={titleId}>
      {/* Dim everything; the light is a hole made with a huge shadow. Clicks never go through. */}
      {box ? (
        <div
          className='pointer-events-none absolute rounded-[22px] transition-[top,left,width,height] duration-300 ease-out'
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            boxShadow: '0 0 0 9999px rgba(6, 14, 24, 0.66)',
          }}
        >
          <span className='ica-tour-ring absolute inset-0 rounded-[22px] border-[3px]' style={{ borderColor: 'var(--ica-gold, #ffd54a)' }} />
        </div>
      ) : (
        <div className='absolute inset-0' style={{ background: 'rgba(6, 14, 24, 0.66)' }} />
      )}

      {ready ? (
        <div
          className={`pointer-events-none absolute inset-x-0 flex justify-center px-3 ${
            box
              ? cardAtTop
                ? 'top-[max(env(safe-area-inset-top),0.75rem)]'
                : 'bottom-[max(calc(env(safe-area-inset-bottom)+0.75rem),0.75rem)]'
              : 'inset-y-0 items-center'
          }`}
        >
          <div key={step.id} className='ica-pop pointer-events-auto flex w-full max-w-md items-end gap-2'>
            <TourGuide className='w-[72px] shrink-0 sm:w-[84px]' />
            <div className='relative min-w-0 flex-1 rounded-3xl border-2 border-border bg-card p-4 text-card-foreground shadow-xl'>
              {/* Speech bubble tail towards the guide */}
              <span
                className='absolute bottom-5 -left-[9px] size-4 rotate-45 border-b-2 border-l-2 border-border bg-card'
                aria-hidden='true'
              />
              <p className='m-0 text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase tabular-nums'>
                {t('{n} de {total}', { n: index + 1, total: steps.length })}
              </p>
              <h2 id={titleId} className='m-0 mt-0.5 font-display text-lg leading-tight font-extrabold tracking-tight'>
                {step.title}
              </h2>
              <p className='m-0 mt-1.5 text-sm leading-snug font-semibold text-muted-foreground'>{step.body}</p>
              <div className='mt-3 flex items-center justify-between gap-2'>
                {isLast ? (
                  <span />
                ) : (
                  <button
                    type='button'
                    onClick={() => finish(true)}
                    className='rounded-xl px-2 py-1.5 text-sm font-extrabold text-muted-foreground transition-colors hover:text-foreground'
                  >
                    {t('Saltar guía')}
                  </button>
                )}
                <Button ref={nextRef} type='button' onClick={goNext} className='min-w-28'>
                  {index === 0 ? t('Empezar') : isLast ? t('¡A por ello!') : t('Siguiente')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

/**
 * The guide: a round, smiling ICA character with the mortarboard of the logo. Drawn here so it
 * matches the app (no emojis, no outside images).
 */
export function TourGuide({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 120 132' className={`ica-bob ${className ?? ''}`} aria-hidden='true'>
      <defs>
        <linearGradient id='ica-guide-body' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#38c6f4' />
          <stop offset='1' stopColor='#0b84b5' />
        </linearGradient>
      </defs>
      {/* Shadow */}
      <ellipse cx='60' cy='126' rx='34' ry='5' fill='rgba(0,0,0,0.22)' />
      {/* Body */}
      <rect x='16' y='34' width='88' height='88' rx='40' fill='url(#ica-guide-body)' stroke='#ffffff' strokeWidth='5' />
      {/* Cheeks */}
      <ellipse cx='34' cy='88' rx='8' ry='5' fill='#ff8fb1' opacity='0.75' />
      <ellipse cx='86' cy='88' rx='8' ry='5' fill='#ff8fb1' opacity='0.75' />
      {/* Eyes */}
      <ellipse cx='44' cy='74' rx='8' ry='10' fill='#ffffff' />
      <ellipse cx='76' cy='74' rx='8' ry='10' fill='#ffffff' />
      <circle cx='46' cy='76' r='5' fill='#0d2a3d' />
      <circle cx='78' cy='76' r='5' fill='#0d2a3d' />
      <circle cx='48' cy='73' r='1.8' fill='#ffffff' />
      <circle cx='80' cy='73' r='1.8' fill='#ffffff' />
      {/* Smile */}
      <path d='M48 94 Q60 106 72 94' fill='none' stroke='#0d2a3d' strokeWidth='4.5' strokeLinecap='round' />
      {/* Mortarboard */}
      <path d='M30 34 Q60 46 90 34 L90 26 Q60 36 30 26 Z' fill='#0a5f86' />
      <path d='M60 4 L108 22 L60 40 L12 22 Z' fill='#0b6f9c' stroke='#ffffff' strokeWidth='3' strokeLinejoin='round' />
      <circle cx='60' cy='22' r='3.5' fill='#ffd54a' />
      <path d='M60 22 Q86 26 94 30 L94 50' fill='none' stroke='#ffd54a' strokeWidth='3.5' strokeLinecap='round' />
      <rect x='90' y='48' width='8' height='12' rx='3' fill='#ffd54a' />
    </svg>
  )
}
