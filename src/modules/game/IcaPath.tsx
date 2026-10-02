import useBreakpoints from '../hooks/useBreakpoints'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckIcon, Gamepad2Icon, LockIcon } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { CREATION_WORDS_GOAL, getTodayProgress } from '../constants'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { CYCLE_CELEBRATION_CLOSED_EVENT, openCycleCelebration } from './CycleCelebration'
import {
  claimCycleChest,
  claimReachedMilestones,
  coinsText,
  hasClaimedCycleChest,
  holdCoinsDisplay,
  todayChestCoins,
  useFichas,
} from './fichas'
import { ChestIcon } from './icons'
import { useDailyLimits } from './limits'
import { DAILY_GAME_MIN_WORDS, DAILY_GAME_PASS, isDailyGamePassed, useDailyGame } from './dailyGame'
import { CYCLE_CHEST_MAX, CYCLE_CHEST_MIN } from './rules'
import { gameSfx } from './sfx'
import { getIcaStreakState } from './streak'
import { PATH_FILL_DELAY_MS, PATH_FILL_MS, usePathFill } from './pathFill'
import type { PathFill } from './pathFill'
import { t, tn } from '@/i18n'

// EL CAMINO ICA DEL DÍA: Inmersión → Creación → Activación → cofre → reto del día.
// Se avanza en orden: cada paso se abre al terminar el anterior. Lo bloqueado se ve
// con su color apagado (para que apetezca) y un candado.
// Todo sale de tus datos reales del día (palabras, frase y activaciones).
//
// MARCA ICA (oct 2026): el camino va sobre el fondo de la app («sin recuadro»). Las letras por
// hacer son fichas celestes con borde blanco; al completarlas pasan a azul intenso con un brillo
// que las cruza (como las insignias de rubí y diamante) y un check arriba. Cofre y Reto del día
// son fichas claras con el dibujo en azul; al poder usarlos, el cofre se vuelve dorado y el reto
// morado (color de minijuego), cada uno con su aro.
//
// En el móvil, el nombre de cada paso va debajo de su ficha. Al volver a Inicio tras hacer un
// paso, el camino se rellena (una vez) hasta el siguiente, que se despierta (ver pathFill.ts).

type Phase = {
  letter: 'I' | 'C' | 'A'
  name: string
  color: string
  edge: string
  soft: string
  ink: string
}

// Las tres fases con los colores de la marca (iguales para I, C y A: lo que cambia es el estado).
const BRAND_PHASE = {
  color: 'var(--ica-brand-tile)',
  edge: '#0b84b5',
  soft: 'var(--ica-path-ring, rgba(255, 255, 255, 0.55))',
  ink: 'var(--ica-brand-ink)',
}
const PHASES: Record<'I' | 'C' | 'A', Phase> = {
  I: { letter: 'I', name: 'INMERSIÓN', ...BRAND_PHASE },
  C: { letter: 'C', name: 'CREACIÓN', ...BRAND_PHASE },
  A: { letter: 'A', name: 'ACTIVACIÓN', ...BRAND_PHASE },
}

/** Ficha de una fase según su estado: celeste con borde blanco; hecha, azul intenso con brillo. */
function brandTileStyle(state: NodeState): CSSProperties {
  if (state === 'done') {
    // Hecha: azul ICA intenso (el de la letra de antes) con la letra blanca y un brillo que la cruza.
    return {
      background: 'linear-gradient(160deg, #1597cc 0%, #0b84b5 45%, #08608a 100%)',
      border: '3px solid rgba(255, 255, 255, 0.9)',
      boxShadow: '0 5px 0 #064a6b',
      overflow: 'hidden',
    }
  }
  if (state === 'locked') {
    // Opaca: así la línea del camino no se ve a través de la letra.
    return { background: 'color-mix(in srgb, #ffffff 22%, var(--ica-tile-base, var(--ica-brand)))', border: '3px dashed var(--ica-path-line, rgba(255, 255, 255, 0.85))', boxShadow: 'none' }
  }
  return { background: 'var(--ica-brand-tile)', border: '4px solid #ffffff', boxShadow: '0 5px 0 #0b84b5' }
}

function brandLetterColor(state: NodeState): string {
  if (state === 'done') return '#ffffff'
  if (state === 'locked') return 'var(--ica-path-line, rgba(255, 255, 255, 0.85))'
  return '#ffffff'
}

/** Retraso del brillo de cada fase hecha: pasa por I, luego C, luego A, como una ola. */
const SHINE_DELAY: Record<string, string> = { I: '0s', C: '0.35s', A: '0.7s' }

/** Brillo de las fichas hechas (como las insignias de rubí y diamante): un destello que las cruza. */
function DoneShine({ letter }: { letter: string }) {
  return (
    <span className='pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]' aria-hidden='true'>
      <span
        className='ica-shine absolute inset-y-[-20%] left-0 w-[45%]'
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent)',
          transform: 'translateX(-120%) skewX(-18deg)',
          animationDelay: SHINE_DELAY[letter] ?? '0s',
        }}
      />
    </span>
  )
}

/** Color del dibujo del cofre y del Reto del día (sobre ficha clara, en los dos temas). */
const BONUS_DRAW = '#0b84b5'

/**
 * Cofre y Reto del día: fichas claras con el dibujo azul, para separarlas a simple vista de
 * I·C·A (fichas azules). Bloqueadas, más apagadas y con trazo discontinuo.
 */
function bonusTileStyle(state: NodeState): CSSProperties {
  if (state === 'locked') {
    return { background: 'color-mix(in srgb, #ffffff 62%, var(--ica-tile-base, var(--ica-brand)))', border: '3px dashed var(--ica-path-line, rgba(255, 255, 255, 0.85))', boxShadow: 'none' }
  }
  return { background: '#ffffff', border: 'var(--ica-white-tile-border, none)', boxShadow: '0 5px 0 color-mix(in oklab, #0b84b5 35%, #ffffff)' }
}

/**
 * Cofre del ciclo: bloqueado, ficha clara con el cofre en azul; en cuanto se puede abrir se
 * vuelve dorado (y abierto se queda con su madera y sus monedas, sobre blanco).
 */
function chestTileStyle(state: NodeState): CSSProperties {
  if (state === 'locked') return bonusTileStyle('locked')
  // Abierto: dorado claro con el borde blanco fino, como las fases hechas.
  if (state === 'done') {
    return {
      background: 'linear-gradient(160deg, #fff0bd 0%, #ffd768 100%)',
      border: '3px solid rgba(255, 255, 255, 0.9)',
      boxShadow: '0 5px 0 color-mix(in oklab, var(--ica-gold-edge) 85%, #ffffff)',
    }
  }
  return {
    background: 'radial-gradient(circle at 50% 40%, #fff3c4, #ffd34d 72%)',
    border: '4px solid #ffffff',
    boxShadow: '0 5px 0 var(--ica-gold-edge)',
  }
}

/** Reto del día: bloqueado, ficha clara en azul; disponible y hecho, morado (su color de minijuego); hecho, con borde fino. */
const CHEST_RING = 'rgb(255 199 44 / 0.45)'
const RETO_RING = 'rgb(162 89 240 / 0.35)'
function retoTileStyle(state: NodeState): CSSProperties {
  if (state === 'locked') return bonusTileStyle(state)
  // Hecho: sigue morado (no se invierte), con el borde blanco más fino, como las fases hechas.
  if (state === 'done') return { background: 'var(--ica-reto)', border: '3px solid rgba(255, 255, 255, 0.9)', boxShadow: '0 5px 0 var(--ica-reto-edge)' }
  return { background: 'var(--ica-reto)', border: '4px solid #ffffff', boxShadow: '0 5px 0 var(--ica-reto-edge)' }
}
function retoIconStyle(state: NodeState): CSSProperties {
  if (state === 'locked') return { color: BONUS_DRAW, opacity: 0.6 }
  return { color: '#ffffff' }
}

type NodeState = 'done' | 'next' | 'pending' | 'locked'
type StepKey = 'I' | 'C' | 'A' | 'chest' | 'review'

// Posiciones del camino (en píxeles). En el móvil va apretado; en ordenador hay sitio
// y las fases se separan más (más recorrido entre la I, la C y la A).
type Geometry = { width: number; height: number; tops: Record<StepKey, number>; centers: Array<[number, number]> }

// Paradas del camino, en orden (el relleno del camino va de una a la siguiente).
const STEP_ORDER: StepKey[] = ['I', 'C', 'A', 'chest', 'review']

/** Centro de las fichas del móvil, medido desde su borde (izquierdo o derecho). */
const TILE_CENTER = 66

function geometry(wide: boolean): Geometry {
  // En el móvil el camino es algo más estrecho que la pantalla: así el nombre de cada paso,
  // centrado debajo de su ficha, cabe aunque sea largo («COFRE DEL CICLO»).
  const width = wide ? 420 : 322
  const step = wide ? 150 : 100
  const tops: Record<StepKey, number> = { I: 4, C: 4 + step, A: 4 + step * 2, chest: 4 + step * 3, review: 4 + step * 3 + (wide ? 130 : 92) }
  const right = width - 66
  const centers: Array<[number, number]> = [
    [66, tops.I + 42],
    [right, tops.C + 42],
    [66, tops.A + 42],
    [right, tops.chest + 34],
    [66, tops.review + 38],
  ]
  // En el móvil, debajo del Reto del día va su nombre (y el texto de ayuda si toca).
  return { width, height: tops.review + (wide ? 86 : 176), tops, centers }
}

const MOBILE_GEOMETRY = geometry(false)
export const PATH_HEIGHT = MOBILE_GEOMETRY.height
const DESKTOP_GEOMETRY = geometry(true)

function pathD(centers: Array<[number, number]>): string {
  let d = `M${centers[0][0]} ${centers[0][1]}`
  for (let index = 1; index < centers.length; index += 1) {
    const [x1, y1] = centers[index - 1]
    const [x2, y2] = centers[index]
    const mid = (x1 + x2) / 2
    d += ` C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
  }
  return d
}

/**
 * Camino entre las fases (el mismo en el móvil y en el ordenador): una línea discontinua
 * de trazos redondeados. El tramo que ya has hecho va con los colores I·C·A.
 */
function Road({
  centers,
  reached,
  width,
  height,
  fill = null,
}: {
  centers: Array<[number, number]>
  /** Índice de la última parada a la que has llegado (0 = ninguna hecha). */
  reached: number
  width: number
  height: number
  /** Tramo que se está rellenando ahora (se pinta poco a poco con una máscara). */
  fill?: PathFill | null
}) {
  const maskId = `ica-road-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const road = pathD(centers)
  const painted = fill ? fill.from : reached
  const doneRoad = painted > 0 ? pathD(centers.slice(0, painted + 1)) : null
  const fillRoad = fill ? pathD(centers.slice(fill.from, fill.to + 1)) : null
  const dashed = {
    fill: 'none',
    strokeLinecap: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
    strokeWidth: 6,
    strokeDasharray: '3 13',
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio='none' className='absolute inset-0 h-full w-full' aria-hidden='true'>
      <path d={road} {...dashed} stroke='var(--ica-road-todo)' />
      {doneRoad ? <path d={doneRoad} {...dashed} stroke='var(--ica-road-done)' /> : null}
      {fillRoad ? (
        <>
          <mask id={maskId} maskUnits='userSpaceOnUse' x={0} y={0} width={width} height={height}>
            <path
              d={fillRoad}
              fill='none'
              stroke='#ffffff'
              strokeWidth={16}
              strokeLinecap='round'
              pathLength={1}
              className='ica-road-fill'
              style={{ animationDelay: `${PATH_FILL_DELAY_MS}ms`, animationDuration: `${PATH_FILL_MS}ms` }}
            />
          </mask>
          <path d={fillRoad} {...dashed} stroke='var(--ica-road-done)' mask={`url(#${maskId})`} />
        </>
      ) : null}
    </svg>
  )
}

/** Al tocar algo bloqueado: tiembla un poco (y el móvil vibra), para que se note que no se puede. */
function shakeLocked(event: MouseEvent<HTMLElement>): void {
  const element = event.currentTarget
  element.classList.remove('ica-shake')
  void element.offsetWidth
  element.classList.add('ica-shake')
  try {
    navigator.vibrate?.(35)
  } catch {
    /* sin vibración */
  }
}

/**
 * Al tocar un paso bloqueado, el paso que toca hacer ahora da un salto (y brilla) para
 * decir «estoy aquí, empieza por mí».
 */
function nudgeStep(event: MouseEvent<HTMLElement>, step: StepKey | null): void {
  shakeLocked(event)
  if (!step) return
  const target = event.currentTarget.closest('.ica-path-skin')?.querySelector<HTMLElement>(`[data-ica-step="${step}"]`)
  if (!target) return
  target.classList.remove('ica-nudge')
  void target.offsetWidth
  target.classList.add('ica-nudge')
  target.addEventListener('animationend', () => target.classList.remove('ica-nudge'), { once: true })
}

function StartChip({
  label = 'EMPIEZA AQUÍ',
  color,
  textColor = '#ffffff',
}: {
  label?: string
  color: string
  textColor?: string
}) {
  return (
    <span
      className='mb-1 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-extrabold tracking-[0.08em]'
      style={{ background: color === '#ffffff' ? 'var(--ica-chip-bg, #ffffff)' : color, color: color === '#ffffff' ? 'var(--ica-chip-ink, #0b84b5)' : textColor }}
    >
      {t(label)}
    </span>
  )
}

function DoneBadge({ style }: { style: CSSProperties }) {
  return (
    <span
      className='pointer-events-none absolute flex size-7 items-center justify-center rounded-full border-[3px]'
      style={{ background: '#0b84b5', borderColor: 'var(--ica-brand)', ...style }}
      aria-hidden='true'
    >
      <CheckIcon className='size-4' strokeWidth={3.6} style={{ color: '#ffffff' }} />
    </span>
  )
}

function LockBadge({ style }: { style: CSSProperties }) {
  return (
    <span
      className='pointer-events-none absolute flex size-7 items-center justify-center rounded-full border-2'
      style={{ background: '#ffffff', borderColor: 'var(--ica-badge-ring, var(--ica-brand))', color: '#0b84b5', ...style }}
      aria-hidden='true'
    >
      <LockIcon className='size-3.5' strokeWidth={2.6} />
    </span>
  )
}

function Sparkle({ style, delay, size }: { style: CSSProperties; delay: string; size: number }) {
  return (
    <svg
      viewBox='0 0 10 10'
      width={size}
      height={size}
      className='ica-twinkle pointer-events-none absolute'
      style={{ ...style, animationDelay: delay }}
      aria-hidden='true'
    >
      <path d='M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2z' fill='#FFC72C' />
    </svg>
  )
}

function Label({
  side,
  top,
  children,
}: {
  side: 'left' | 'right'
  /** Altura a la que empieza (justo debajo de su ficha). */
  top: number
  children: ReactNode
}) {
  // Centrado debajo de su ficha. Puede salirse un poco del camino para que quepa.
  const style: CSSProperties =
    side === 'left'
      ? { left: TILE_CENTER, top, transform: 'translateX(-50%)' }
      : { right: TILE_CENTER, top, transform: 'translateX(50%)' }
  // Solo tapa el camino donde está el texto (así el camino se ve entero alrededor).
  return (
    <div
      className='pointer-events-none absolute flex w-max max-w-[168px] flex-col items-center gap-0.5 rounded-xl px-2 py-0.5 text-center'
      style={{ ...style, background: 'var(--ica-label-bg, var(--ica-brand))' }}
    >
      {children}
    </div>
  )
}

function PhaseTile({
  phase,
  state,
  side,
  onClick,
  onLockedClick,
  ariaLabel,
  top,
}: {
  phase: Phase
  state: NodeState
  side: 'left' | 'right'
  onClick: () => void
  onLockedClick: (event: MouseEvent<HTMLElement>) => void
  ariaLabel: string
  top: number
}) {
  const locked = state === 'locked'
  return (
    <>
      {state === 'next' ? (
        <span
          className='pointer-events-none absolute rounded-[32px] border-[6px]'
          style={{ [side]: 16, top: top - 8, width: 100, height: 100, borderColor: phase.soft }}
          aria-hidden='true'
        />
      ) : null}
      <button
        type='button'
        onClick={locked ? onLockedClick : onClick}
        data-ica-step={phase.letter}
        aria-disabled={locked || undefined}
        aria-label={ariaLabel}
        className={`absolute flex items-center justify-center rounded-[26px] transition-transform ${locked ? 'cursor-not-allowed' : 'active:scale-95'} ${state === 'next' ? 'ica-bob' : ''}`}
        style={{
          [side]: 24,
          top,
          width: 84,
          height: 84,
          ...brandTileStyle(state),
        }}
      >
        <span
          className='font-ica text-[46px] leading-none font-extrabold'
          style={{
            color: brandLetterColor(state),
            marginTop: -4,
          }}
        >
          {phase.letter}
        </span>
        {state === 'done' ? <DoneShine letter={phase.letter} /> : null}
      </button>
      {/* El check y el candado sobresalen lo mismo (8 px) en todas las fichas, a los dos lados. */}
      {state === 'done' ? <DoneBadge style={{ [side]: side === 'left' ? 88 : 16, top: top - 6 }} /> : null}
      {locked ? <LockBadge style={{ [side]: side === 'left' ? 88 : 16, top: top - 6 }} /> : null}
    </>
  )
}

export function IcaPath() {
  const navigate = useNavigate()
  const { isLg } = useBreakpoints()
  const geo = isLg ? DESKTOP_GEOMETRY : MOBILE_GEOMETRY
  const { user } = useAuth()
  const {
    config,
    cards,
    dailyProgress,
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
    loading,
  } = useDashboardContext()
  const { entries } = useFichas(user?.id)
  const { limits } = useDailyLimits()
  const { mode: gameMode, result: gameResult } = useDailyGame(user?.id, cards, config?.targetLang)
  const today = getTodayProgress(dailyProgress)
  const streakState = getIcaStreakState({
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
    todayProgress: today,
  })

  const iDone = today.wordsAdded >= CREATION_WORDS_GOAL
  const cDone = today.phraseGenerated
  const aDone = today.voiceActivationsCount > 0
  const cycleDone = streakState.cycleDoneToday
  const chestOpened = hasClaimedCycleChest(entries)
  // El reto cuenta como hecho con 5 aciertos o más (la mitad).
  const reviewDone = isDailyGamePassed(gameResult)
  // Hasta dónde llega el tramo de colores del camino (I, C, A, cofre, reto).
  const mobileDoneFlags = [iDone, cDone, aDone, chestOpened, reviewDone]
  const firstPending = mobileDoneFlags.findIndex((done) => !done)
  const mobileReached = firstPending === -1 ? mobileDoneFlags.length - 1 : firstPending

  // Relleno del camino al avanzar: la parada nueva sigue «dormida» hasta que llega el relleno.
  // Con la celebración del cofre encima se espera a que se cierre.
  const [celebrationOpen, setCelebrationOpen] = useState(false)
  useEffect(() => {
    const onClosed = () => setCelebrationOpen(false)
    window.addEventListener(CYCLE_CELEBRATION_CLOSED_EVENT, onClosed)
    return () => window.removeEventListener(CYCLE_CELEBRATION_CLOSED_EVENT, onClosed)
  }, [])
  const pathRef = useRef<HTMLDivElement>(null)
  const onArrive = useCallback((stop: number) => {
    // La parada a la que llega el camino da un salto y suena.
    const target = pathRef.current?.querySelector<HTMLElement>(`[data-ica-step="${STEP_ORDER[stop]}"]`)
    gameSfx.streak()
    if (!target) return
    target.classList.remove('ica-nudge')
    void target.offsetWidth
    target.classList.add('ica-nudge')
    target.addEventListener('animationend', () => target.classList.remove('ica-nudge'), { once: true })
  }, [])
  const { fill, holdStop } = usePathFill({
    userId: user?.id,
    reached: mobileReached,
    ready: !loading,
    paused: celebrationOpen,
    onArrive,
  })
  const held = holdStop === null ? null : STEP_ORDER[holdStop]
  // Esperando a rellenar: el tramo de colores llega solo hasta la parada anterior.
  const roadReached = holdStop !== null && !fill ? holdStop - 1 : mobileReached

  // Orden obligatorio: C tras I, A tras C, cofre tras el ciclo, reto del día tras el cofre.
  const cLocked = !iDone || cards.length < CREATION_WORDS_GOAL || held === 'C'
  const aLocked = !cDone || held === 'A'
  const chestReady = cycleDone && !chestOpened && held !== 'chest'
  // Un cofre ya abierto hoy se queda abierto aunque luego se borre la C o la A (las monedas ya se cobraron).
  const chestLocked = (!cycleDone && !chestOpened) || held === 'chest'
  const reviewNeedsWords = cards.length < DAILY_GAME_MIN_WORDS
  const reviewLocked = (!reviewDone && (!chestOpened || reviewNeedsWords)) || held === 'review'

  const next: StepKey | null = !iDone
    ? 'I'
    : !cDone && !cLocked
      ? 'C'
      : !aDone && !aLocked
        ? 'A'
        : chestReady
          ? 'chest'
          : !reviewDone && !reviewLocked
            ? 'review'
            : null

  // Tocar algo bloqueado: tiembla y el paso que toca hacer salta para llamar la atención.
  const tapLocked = (event: MouseEvent<HTMLElement>) => nudgeStep(event, next)

  const phaseState = (key: 'I' | 'C' | 'A', done: boolean, locked = false): NodeState =>
    done ? 'done' : locked ? 'locked' : next === key ? 'next' : 'pending'

  const openChest = () => {
    if (chestLocked) return
    if (chestReady) {
      const chestFichas = claimCycleChest(user?.id)
      const milestoneFichas = claimReachedMilestones(user?.id, streakState.streak)
      // Las monedas no se suman en el marcador hasta que se recogen (vuelan a la cartera).
      holdCoinsDisplay(chestFichas + milestoneFichas)
      setCelebrationOpen(true)
      openCycleCelebration({ chestFichas, milestoneFichas, fresh: true })
      return
    }
    if (chestOpened) {
      openCycleCelebration({ chestFichas: todayChestCoins(entries), milestoneFichas: 0 })
    }
  }

  // ORDENADOR: el camino va en horizontal, como una línea con 5 estaciones bien separadas.
  if (isLg) {
    const chestText = chestOpened
      ? t('Abierto: +{coins}', { coins: coinsText(todayChestCoins(entries)) })
      : chestReady
        ? t('Gana de {min} a {max} ICA Coins', { min: CYCLE_CHEST_MIN, max: CYCLE_CHEST_MAX })
        : t('Consigue hasta {max} ICA Coins', { max: CYCLE_CHEST_MAX })
    const reviewText = reviewDone
      ? t('{correct} de {total} · {mode}', {
          correct: gameResult?.correct ?? 0,
          total: gameResult?.total ?? 0,
          mode: t(gameMode.name),
        })
      : reviewLocked && reviewNeedsWords
        ? t('Con {n} palabras en tu baúl', { n: DAILY_GAME_MIN_WORDS })
        : t('Mínimo {n} correctas', { n: DAILY_GAME_PASS })
    const steps: JourneyStep[] = [
      {
        key: 'I',
        title: t('Inmersión'),
        text: iDone
          ? t('{n} palabras hoy · máx. {max}', { n: today.wordsAdded, max: limits.words })
          : t('{n} de {goal} palabras', { n: today.wordsAdded, goal: CREATION_WORDS_GOAL }),
        state: phaseState('I', iDone),
        colors: PHASES.I,
        content: 'I',
        chip: t('EMPIEZA AQUÍ'),
        onClick: () => navigate(DASHBOARD_ROUTES.newIcaWords),
        ariaLabel: t('Inmersión: {n} de {goal} palabras', {
          n: Math.min(today.wordsAdded, CREATION_WORDS_GOAL),
          goal: CREATION_WORDS_GOAL,
        }),
      },
      {
        key: 'C',
        title: t('Creación'),
        text: cDone ? t('Frase creada · máx. {max} hoy', { max: limits.phrases }) : t('Crea 1 frase con tus palabras'),
        state: phaseState('C', cDone, cLocked),
        colors: PHASES.C,
        content: 'C',
        chip: t('SIGUE AQUÍ'),
        onClick: () => navigate(DASHBOARD_ROUTES.activationPhrase),
        ariaLabel: cDone
          ? t('Creación: frase creada')
          : cLocked
            ? t('Creación: bloqueada hasta terminar Inmersión')
            : t('Creación: crea una frase con tus palabras'),
      },
      {
        key: 'A',
        title: t('Activación'),
        text: aDone
          ? tn(today.voiceActivationsCount, t('{n} nota grabada · máx. {max}'), t('{n} notas grabadas · máx. {max}'), {
              max: limits.activations,
            })
          : t('Graba 1 nota con tu voz'),
        state: phaseState('A', aDone, aLocked),
        colors: PHASES.A,
        content: 'A',
        chip: t('SIGUE AQUÍ'),
        onClick: () => navigate(DASHBOARD_ROUTES.masterNotes),
        ariaLabel: aDone
          ? t('Activación: hecha')
          : aLocked
            ? t('Activación: bloqueada hasta terminar Creación')
            : t('Activación: graba una nota con tu voz'),
      },
      {
        key: 'chest',
        title: t('Cofre del ciclo'),
        text: chestText,
        state: chestOpened ? 'done' : chestReady ? 'next' : 'locked',
        colors: { letter: 'I', name: '', color: '#ffffff', edge: '#ffffff', soft: 'var(--ica-path-ring, rgba(255, 255, 255, 0.55))', ink: 'var(--ica-brand-ink)' },
        content: (
          <ChestIcon
            size={84}
            tone={chestReady || chestOpened ? 'wood' : 'brand'}
            state={chestOpened ? 'open' : chestReady ? 'ready' : 'locked'}
            className={chestReady || chestOpened ? undefined : 'opacity-60'}
          />
        ),
        chip: t('¡ÁBRELO!'),
        bare: true,
        onClick: openChest,
        ariaLabel: chestOpened
          ? t('Cofre del ciclo: abierto')
          : chestReady
            ? t('Cofre del ciclo: listo para abrir, de {min} a {max} ICA Coins', { min: CYCLE_CHEST_MIN, max: CYCLE_CHEST_MAX })
            : t('Cofre del ciclo: se abre al completar I·C·A'),
      },
      {
        key: 'review',
        title: t('Reto del día'),
        text: reviewText,
        state: reviewDone ? 'done' : reviewLocked ? 'locked' : next === 'review' ? 'next' : 'pending',
        colors: { letter: 'I', name: '', color: 'var(--ica-reto)', edge: 'var(--ica-reto-edge)', soft: RETO_RING, ink: 'var(--ica-brand-ink)' },
        content: (
          <Gamepad2Icon
            className='size-12'
            strokeWidth={2.4}
            style={retoIconStyle(reviewDone ? 'done' : reviewLocked ? 'locked' : 'pending')}
          />
        ),
        chip: t('TERMINA AQUÍ'),
        onClick: () => navigate(DASHBOARD_ROUTES.dailyGame),
        ariaLabel: reviewDone
          ? t('Reto del día hecho: {correct} de {total}', { correct: gameResult?.correct ?? 0, total: gameResult?.total ?? 0 })
          : reviewLocked
            ? reviewNeedsWords
              ? t('Reto del día: necesitas {n} palabras en tu Baúl ICA', { n: DAILY_GAME_MIN_WORDS })
              : t('Reto del día: se abre después del cofre')
            : t('Reto del día: tu minijuego con palabras ICA'),
      },
    ]
    return (
      <>
        <div ref={pathRef}>
          <IcaJourney steps={steps} chestReady={chestReady} onLockedTap={tapLocked} fill={fill} reached={roadReached} />
        </div>
      </>
    )
  }

  // Debajo del Reto del día solo hace falta sitio para el chip y el texto de ayuda cuando salen;
  // si no, el camino acaba justo bajo «RETO DEL DÍA» (sin hueco hasta lo siguiente).
  const reviewHelp = next === 'review' || (reviewLocked && reviewNeedsWords)
  const mobileHeight = reviewHelp ? geo.height : geo.tops.review + 124
  return (
    <>
    <div className='ica-path-skin rounded-[28px] pt-5 pb-1'>
    <div ref={pathRef} className='relative mx-auto w-full' style={{ height: mobileHeight, maxWidth: geo.width }}>
      <Road
        centers={geo.centers}
        reached={roadReached}
        width={geo.width}
        height={mobileHeight}
        fill={fill}
      />

      {/* I */}
      <PhaseTile
        onLockedClick={tapLocked}
        phase={PHASES.I}
        top={geo.tops.I}
        state={phaseState('I', iDone)}
        side='left'
        onClick={() => navigate(DASHBOARD_ROUTES.newIcaWords)}
        ariaLabel={t('Inmersión: {n} de {goal} palabras', {
          n: Math.min(today.wordsAdded, CREATION_WORDS_GOAL),
          goal: CREATION_WORDS_GOAL,
        })}
      />
      <Label side='left' top={geo.tops.I + 96}>
        {next === 'I' ? <StartChip color='#ffffff' textColor='#0b84b5' /> : null}
        <span className='text-[15px] font-extrabold tracking-[0.06em]' style={{ color: PHASES.I.ink }}>{t('INMERSIÓN')}</span>
        {/* El texto de ayuda solo en el paso que toca (en los demás no aporta). */}
        {next === 'I' ? (
          <span className='text-[13px] font-semibold text-balance' style={{ color: 'var(--ica-brand-sub)' }}>
            {iDone
              ? t('{n} palabras hoy · máx. {max}', { n: today.wordsAdded, max: limits.words })
              : t('{n} de {goal} palabras', { n: today.wordsAdded, goal: CREATION_WORDS_GOAL })}
          </span>
        ) : null}
      </Label>

      {/* C */}
      <PhaseTile
        onLockedClick={tapLocked}
        phase={PHASES.C}
        top={geo.tops.C}
        state={phaseState('C', cDone, cLocked)}
        side='right'
        onClick={() => navigate(DASHBOARD_ROUTES.activationPhrase)}
        ariaLabel={
          cDone
            ? t('Creación: frase creada')
            : cLocked
              ? t('Creación: bloqueada hasta terminar Inmersión')
              : t('Creación: crea una frase con tus palabras')
        }
      />
      <Label side='right' top={geo.tops.C + 96}>
        {next === 'C' ? <StartChip label='SIGUE AQUÍ' color='#ffffff' textColor='#0b84b5' /> : null}
        <span className='text-[15px] font-extrabold tracking-[0.06em]' style={{ color: PHASES.C.ink }}>{t('CREACIÓN')}</span>
        {next === 'C' ? (
          <span className='text-[13px] font-semibold text-balance' style={{ color: 'var(--ica-brand-sub)' }}>
            {cDone
              ? t('Frase creada · máx. {max} hoy', { max: limits.phrases })
              : t('Crea 1 frase con tus palabras')}
          </span>
        ) : null}
      </Label>

      {/* A */}
      <PhaseTile
        onLockedClick={tapLocked}
        phase={PHASES.A}
        top={geo.tops.A}
        state={phaseState('A', aDone, aLocked)}
        side='left'
        onClick={() => navigate(DASHBOARD_ROUTES.masterNotes)}
        ariaLabel={
          aDone
            ? t('Activación: hecha')
            : aLocked
              ? t('Activación: bloqueada hasta terminar Creación')
              : t('Activación: graba una nota con tu voz')
        }
      />
      <Label side='left' top={geo.tops.A + 96}>
        {next === 'A' ? <StartChip label='SIGUE AQUÍ' color='#ffffff' textColor='#0b84b5' /> : null}
        <span className='text-[15px] font-extrabold tracking-[0.06em]' style={{ color: PHASES.A.ink }}>{t('ACTIVACIÓN')}</span>
        {next === 'A' ? (
          <span className='text-[13px] font-semibold text-balance' style={{ color: 'var(--ica-brand-sub)' }}>
            {aDone
              ? tn(today.voiceActivationsCount, t('{n} nota grabada · máx. {max}'), t('{n} notas grabadas · máx. {max}'), {
                  max: limits.activations,
                })
              : t('Graba 1 nota con tu voz')}
          </span>
        ) : null}
      </Label>

      {/* Cofre */}
      {chestReady ? (
        <span
          className='ica-glow-pulse pointer-events-none absolute rounded-full'
          style={{
            right: 6,
            top: geo.tops.chest - 18,
            width: 120,
            height: 104,
            background: 'radial-gradient(closest-side, #ffd54acc, #ffd54a55 55%, transparent)',
          }}
          aria-hidden='true'
        />
      ) : null}
      {chestReady ? (
        // Aro como el de las fichas que tocan (I·C·A y Reto del día), en dorado.
        <span
          className='pointer-events-none absolute rounded-[32px] border-[6px]'
          style={{ right: 14, top: geo.tops.chest - 16, width: 104, height: 96, borderColor: CHEST_RING }}
          aria-hidden='true'
        />
      ) : null}
      <button
        type='button'
        onClick={chestLocked ? tapLocked : openChest}
        data-ica-step='chest'
        aria-disabled={chestLocked || undefined}
        aria-label={
          chestOpened
            ? t('Cofre del ciclo: abierto')
            : chestReady
              ? t('Cofre del ciclo: listo para abrir, de {min} a {max} ICA Coins', { min: CYCLE_CHEST_MIN, max: CYCLE_CHEST_MAX })
              : t('Cofre del ciclo: se abre al completar I·C·A')
        }
        className={`absolute flex items-center justify-center ${chestReady ? 'ica-wiggle' : ''} ${chestLocked ? 'cursor-not-allowed' : 'active:scale-95'}`}
        style={{
          right: 22,
          top: geo.tops.chest - 8,
          width: 88,
          height: 80,
          borderRadius: 26,
          ...chestTileStyle(chestOpened ? 'done' : chestReady ? 'next' : 'locked'),
        }}
      >
        <ChestIcon
          size={66}
          tone={chestLocked ? 'brand' : 'wood'}
          state={chestOpened ? 'open' : chestReady ? 'ready' : 'locked'}
          className={chestLocked ? 'opacity-60' : undefined}
        />
      </button>
      {chestOpened ? <DoneBadge style={{ right: 14, top: geo.tops.chest - 14 }} /> : null}
      {chestReady ? (
        <>
          <Sparkle style={{ right: 16, top: geo.tops.chest - 14 }} delay='0s' size={14} />
          <Sparkle style={{ right: 104, top: geo.tops.chest + 6 }} delay='0.6s' size={11} />
          <Sparkle style={{ right: 34, top: geo.tops.chest + 62 }} delay='1.1s' size={10} />
        </>
      ) : null}
      {chestLocked ? <LockBadge style={{ right: 14, top: geo.tops.chest - 14 }} /> : null}
      <Label side='right' top={geo.tops.chest + 86}>
        {next === 'chest' ? <StartChip label={t('¡ÁBRELO!')} color='#a16207' /> : null}
        <span className='text-[15px] font-extrabold tracking-[0.06em]' style={{ color: 'var(--ica-brand-ink)' }}>
          {t('COFRE DEL CICLO')}
        </span>
        {next === 'chest' ? (
          <span className='text-[13px] font-semibold text-balance' style={{ color: 'var(--ica-brand-sub)' }}>
            {chestOpened
              ? t('Abierto: +{coins}', { coins: coinsText(todayChestCoins(entries)) })
              : chestReady
                ? t('Gana de {min} a {max} ICA Coins', { min: CYCLE_CHEST_MIN, max: CYCLE_CHEST_MAX })
                : t('Consigue hasta {max} ICA Coins', { max: CYCLE_CHEST_MAX })}
          </span>
        ) : null}
      </Label>

      {/* Reto del día (minijuego con tus palabras) */}
      <button
        type='button'
        onClick={reviewLocked ? tapLocked : () => navigate(DASHBOARD_ROUTES.dailyGame)}
        data-ica-step='review'
        aria-disabled={reviewLocked || undefined}
        aria-label={
          reviewDone
            ? t('Reto del día hecho: {correct} de {total}', {
                correct: gameResult?.correct ?? 0,
                total: gameResult?.total ?? 0,
              })
            : reviewLocked
              ? reviewNeedsWords
                ? t('Reto del día: necesitas {n} palabras en tu Baúl ICA', { n: DAILY_GAME_MIN_WORDS })
                : t('Reto del día: se abre después del cofre')
              : t('Reto del día: tu minijuego con palabras ICA')
        }
        className={`absolute flex items-center justify-center rounded-[26px] transition-transform ${next === 'review' ? 'ica-bob' : ''} ${reviewLocked ? 'cursor-not-allowed' : 'active:scale-95'}`}
        style={{
          left: 24,
          top: geo.tops.review,
          width: 84,
          height: 84,
          ...retoTileStyle(reviewDone ? 'done' : reviewLocked ? 'locked' : 'pending'),
        }}
      >
        <Gamepad2Icon
          className='size-11'
          strokeWidth={2.4}
          style={retoIconStyle(reviewDone ? 'done' : reviewLocked ? 'locked' : 'pending')}
        />
      </button>
      {reviewDone ? <DoneBadge style={{ left: 88, top: geo.tops.review - 6 }} /> : null}
      {next === 'review' ? (
        <span
          className='pointer-events-none absolute rounded-[32px] border-[6px]'
          style={{ left: 16, top: geo.tops.review - 8, width: 100, height: 100, borderColor: RETO_RING }}
          aria-hidden='true'
        />
      ) : null}
      {reviewLocked ? <LockBadge style={{ left: 88, top: geo.tops.review - 6 }} /> : null}
      <Label side='left' top={geo.tops.review + 96}>
        {next === 'review' ? (
          <StartChip label='TERMINA AQUÍ' color='var(--ica-reto-edge)' />
        ) : null}
        <span className='text-[15px] font-extrabold tracking-[0.06em]' style={{ color: 'var(--ica-brand-ink)' }}>{t('RETO DEL DÍA')}</span>
        {reviewHelp ? (
          <span className='text-[13px] font-semibold text-balance' style={{ color: 'var(--ica-brand-sub)' }}>
            {reviewDone
              ? t('{correct} de {total} · {mode}', {
                  correct: gameResult?.correct ?? 0,
                  total: gameResult?.total ?? 0,
                  mode: t(gameMode.name),
                })
              : reviewLocked && reviewNeedsWords
                ? t('Con {n} palabras en tu baúl', { n: DAILY_GAME_MIN_WORDS })
                : t('Mínimo {n} correctas', { n: DAILY_GAME_PASS })}
          </span>
        ) : null}
      </Label>
    </div>
    </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Camino en horizontal (ordenador)
// ---------------------------------------------------------------------------

type JourneyStep = {
  key: StepKey
  title: string
  text: string
  state: NodeState
  colors: Phase
  content: ReactNode
  chip: string
  /** Sin cuadrado de color (el cofre ya es un dibujo). */
  bare?: boolean
  onClick: () => void
  ariaLabel: string
}

function IcaJourney({
  steps,
  chestReady,
  onLockedTap,
  fill,
  reached,
}: {
  steps: JourneyStep[]
  chestReady: boolean
  onLockedTap: (event: MouseEvent<HTMLElement>) => void
  fill: PathFill | null
  /** Hasta qué parada va pintado el camino. */
  reached: number
}) {
  // Un caminito que sube y baja entre las estaciones (como un tablero de juego).
  // El tramo que ya has hecho se pinta de colores.
  const HEIGHT = 400
  const W = 1000
  const xs = steps.map((_, index) => 9 + (index * 82) / (steps.length - 1))
  const tops = steps.map((_, index) => (index % 2 === 0 ? 18 : 150))
  const sizes = steps.map((step) => (typeof step.content === 'string' ? 120 : 100))
  const centers = steps.map((_, index) => [xs[index] * (W / 100), tops[index] + sizes[index] / 2] as [number, number])

  return (
    <div className='ica-path-skin relative overflow-hidden rounded-[32px] px-4 pt-4 pb-2 xl:px-6'>
      <div className='relative w-full' style={{ height: HEIGHT }}>
        <Road centers={centers} reached={reached} width={W} height={HEIGHT} fill={fill} />

        {steps.map((step, index) => {
          const { colors, state } = step
          const locked = state === 'locked'
          const isLetter = typeof step.content === 'string'
          const size = sizes[index]
          return (
            <div
              key={step.key}
              className='absolute flex w-[180px] -translate-x-1/2 flex-col items-center text-center'
              style={{ left: `${xs[index]}%`, top: tops[index] }}
            >
              <div className='relative flex items-center justify-center' style={{ width: size + 24, height: size }}>
                {state === 'next' && !step.bare ? (
                  <span
                    className='pointer-events-none absolute rounded-[40px] border-[6px]'
                    style={{ width: size + 22, height: size + 22, borderColor: colors.soft }}
                    aria-hidden='true'
                  />
                ) : null}
                {step.bare && chestReady ? (
                  <span
                    className='pointer-events-none absolute rounded-[36px] border-[6px]'
                    style={{ width: size + 30, height: size + 22, borderColor: CHEST_RING }}
                    aria-hidden='true'
                  />
                ) : null}
                {step.bare && chestReady ? (
                  <span
                    className='ica-glow-pulse pointer-events-none absolute rounded-full'
                    style={{ width: 150, height: 130, background: 'radial-gradient(closest-side, #ffd54acc, #ffd54a55 55%, transparent)' }}
                    aria-hidden='true'
                  />
                ) : null}
                <button
                  type='button'
                  onClick={locked ? onLockedTap : step.onClick}
                  data-ica-step={step.key}
                  aria-disabled={locked || undefined}
                  aria-label={step.ariaLabel}
                  className={`relative flex items-center justify-center transition-transform ${locked ? 'cursor-not-allowed' : 'hover:-translate-y-0.5 active:scale-95'} ${state === 'next' ? (step.bare ? 'ica-wiggle' : 'ica-bob') : ''}`}
                  style={
                    step.bare
                      ? { width: size + 8, height: size, borderRadius: 28, ...chestTileStyle(state) }
                      : isLetter
                        ? { width: size, height: size, borderRadius: 34, ...brandTileStyle(state), color: brandLetterColor(state) }
                        : {
                            width: size,
                            height: size,
                            borderRadius: 28,
                            ...retoTileStyle(state),
                          }
                  }
                >
                  {isLetter ? (
                    <>
                      <span className='font-ica text-[64px] leading-none font-extrabold' style={{ marginTop: -6 }}>
                        {step.content}
                      </span>
                      {state === 'done' ? <DoneShine letter={String(step.content)} /> : null}
                    </>
                  ) : (
                    step.content
                  )}
                </button>
                {/* Mismo sitio en todas: 8 px fuera de la esquina de su ficha (el cofre es 8 px más ancho). */}
                {state === 'done' ? (
                  <DoneBadge style={{ top: -6, right: step.bare ? 0 : 4 }} />
                ) : locked ? (
                  <LockBadge style={{ top: -6, right: step.bare ? 0 : 4 }} />
                ) : null}
              </div>
              <div className='mt-3 flex min-h-6 items-center'>
                {state === 'next' ? (
                  <StartChip
                    label={step.chip}
                    color={isLetter ? '#ffffff' : step.bare ? '#a16207' : 'var(--ica-reto-edge)'}
                    textColor={isLetter ? '#0b84b5' : '#ffffff'}
                  />
                ) : null}
              </div>
              <span
                className='mt-0.5 rounded-lg px-1.5 text-lg leading-tight font-black'
                style={{ color: 'var(--ica-brand-ink)', background: 'var(--ica-label-bg, var(--ica-brand))', opacity: locked ? 0.75 : 1 }}
              >
                {step.title}
              </span>
              {state === 'next' ? (
                // El texto de ayuda solo en el paso que toca.
                <span className='mt-0.5 rounded-lg px-1.5 text-sm font-semibold text-balance' style={{ color: 'var(--ica-brand-sub)', background: 'var(--ica-label-bg, var(--ica-brand))' }}>
                  {step.text}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

