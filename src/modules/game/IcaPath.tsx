import useBreakpoints from '../hooks/useBreakpoints'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
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
//
// MOBILE (Luis, 5 Oct, mix of mockups B3 + B6): I, C and A in a row joined by the dashed road;
// below, the road forks into the cycle chest and the daily challenge, which unlock TOGETHER
// when the cycle is done. The ready chest rattles every couple of seconds to ask to be opened.

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

// Paradas del camino, en orden (el relleno del camino va de una a la siguiente).
const STEP_ORDER: StepKey[] = ['I', 'C', 'A', 'chest', 'review']

/** CSS position relative to a horizontal anchor (`cx`, e.g. '18%'), in px. */
const at = (cx: string, offset: number): string => `calc(${cx} + ${offset}px)`

/** Cuánto se separa la S del centro, a un lado y a otro (px). */
const S_SWING = 95

/**
 * Camino que pasa por el centro de cada ficha. Entre dos fichas en la misma columna hace una S
 * (una vez sale por la derecha, la siguiente por la izquierda); si no, una curva suave.
 * `firstIndex` es la parada en la que empieza (para que los tramos parciales sigan la misma S).
 */
function pathD(centers: Array<[number, number]>, firstIndex = 0): string {
  let d = `M${centers[0][0]} ${centers[0][1]}`
  for (let index = 1; index < centers.length; index += 1) {
    const [x1, y1] = centers[index - 1]
    const [x2, y2] = centers[index]
    if (Math.abs(x1 - x2) < 1) {
      const side = (firstIndex + index - 1) % 2 === 0 ? 1 : -1
      const bend = (y2 - y1) / 3
      d += ` C ${x1 + side * S_SWING} ${y1 + bend}, ${x2 + side * S_SWING} ${y2 - bend}, ${x2} ${y2}`
    } else {
      const mid = (x1 + x2) / 2
      d += ` C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
    }
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
  const fillRoad = fill ? pathD(centers.slice(fill.from, fill.to + 1), fill.from) : null
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

/** Al tocar algo bloqueado: tiembla, suena «toc-toc» y el móvil vibra, para que se note que no se puede. */
function shakeLocked(event: MouseEvent<HTMLElement>): void {
  const element = event.currentTarget
  element.classList.remove('ica-shake')
  void element.offsetWidth
  element.classList.add('ica-shake')
  // «toc-toc» y vibración (Luis, 3 oct: el sonido del paso bloqueado).
  gameSfx.locked()
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
  top,
  cx = '50%',
  maxWidth = 168,
  children,
}: {
  /** Altura a la que empieza (justo debajo de su ficha). */
  top: number
  /** Horizontal center (the center of its tile). */
  cx?: string
  maxWidth?: number
  children: ReactNode
}) {
  // Centrado debajo de su ficha.
  const style: CSSProperties = { left: cx, top, transform: 'translateX(-50%)', maxWidth }
  // Solo tapa el camino donde está el texto (así el camino se ve entero alrededor).
  return (
    <div
      className='pointer-events-none absolute flex w-max flex-col items-center gap-0.5 rounded-xl px-2 py-0.5 text-center'
      style={{ ...style, background: 'var(--ica-label-bg, var(--ica-brand))' }}
    >
      {children}
    </div>
  )
}

function PhaseTile({
  phase,
  state,
  onClick,
  onLockedClick,
  ariaLabel,
  top,
  cx = '50%',
}: {
  phase: Phase
  state: NodeState
  onClick: () => void
  onLockedClick: (event: MouseEvent<HTMLElement>) => void
  ariaLabel: string
  top: number
  /** Horizontal center of the tile. */
  cx?: string
}) {
  const locked = state === 'locked'
  return (
    <>
      {state === 'next' ? (
        <span
          className='pointer-events-none absolute rounded-[32px] border-[6px]'
          style={{ left: at(cx, -50), top: top - 8, width: 100, height: 100, borderColor: phase.soft }}
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
          left: at(cx, -42),
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
      {state === 'done' ? <DoneBadge style={{ left: at(cx, 22), top: top - 6 }} /> : null}
      {locked ? <LockBadge style={{ left: at(cx, 22), top: top - 6 }} /> : null}
    </>
  )
}

export function IcaPath() {
  const navigate = useNavigate()
  const { isLg } = useBreakpoints()
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
  const {
    entries,
    today: coinDay,
    chestOpened: serverChestOpened,
    chestCoins: serverChestCoins,
    chestRolled,
    refresh: refreshCoins,
  } = useFichas(user?.id)
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
  const chestOpened = serverChestOpened || hasClaimedCycleChest(entries, coinDay)
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

  // Orden obligatorio: C tras I, A tras C; al acabar el ciclo se abren a la vez el cofre y el reto del día.
  const cLocked = !iDone || cards.length < CREATION_WORDS_GOAL || held === 'C'
  const aLocked = !cDone || held === 'A'
  const chestReady = cycleDone && !chestOpened && held !== 'chest'
  // Un cofre ya abierto hoy se queda abierto aunque luego se borre la C o la A (las monedas ya se cobraron).
  const chestLocked = (!cycleDone && !chestOpened) || held === 'chest'
  const reviewNeedsWords = cards.length < DAILY_GAME_MIN_WORDS
  const reviewLocked = (!reviewDone && ((!cycleDone && !chestOpened) || reviewNeedsWords)) || held === 'review'

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

  const openChest = async () => {
    if (chestLocked) return
    if (chestReady) {
      try {
        const chest = await claimCycleChest(user?.id)
        const milestoneFichas = await claimReachedMilestones(user?.id, streakState.streak)
        await refreshCoins()
        holdCoinsDisplay(chest.coins + milestoneFichas)
        setCelebrationOpen(true)
        openCycleCelebration({
          chestFichas: chest.coins,
          milestoneFichas,
          fresh: !chest.alreadyOpened,
          walletFull: chest.coins < chest.rolled,
        })
      } catch (error) {
        toast.error(error instanceof Error && error.message.includes('ICA_CYCLE_INCOMPLETE')
          ? t('Completa el ciclo ICA para abrir el cofre.')
          : t('No se pudo abrir el cofre. Inténtalo de nuevo.'))
      }
      return
    }
    if (chestOpened) {
      const todayChest = entries.find((entry) => entry.type === 'cycle_chest' && entry.day === coinDay)
      openCycleCelebration({
        chestFichas: todayChest ? todayChestCoins(entries, coinDay) : serverChestCoins,
        milestoneFichas: 0,
        walletFull: Boolean((todayChest?.rolled ?? chestRolled) && (todayChest?.rolled ?? chestRolled)! > (todayChest?.delta ?? serverChestCoins)),
      })
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
              : t('Reto del día: se abre al completar I·C·A')
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

  // MÓVIL (Luis, 5 oct, mezcla de B3 y B6): I·C·A en fila dentro de su recuadro y, debajo, el
  // cofre y el reto del día en dos recuadros (como las casillas de Clash Royale), que se abren a
  // la vez al acabar el ciclo. Todo cabe en la pantalla sin bajar.
  // Horizontal centers (as % of the width) and vertical positions in px.
  const SLOT_GAP = 12
  const X = {
    I: '18%',
    C: '50%',
    A: '82%',
    chest: `calc(25% - ${SLOT_GAP / 4}px)`,
    review: `calc(75% + ${SLOT_GAP / 4}px)`,
  } as const
  const XN = { I: 18, C: 50, A: 82, chest: 25, review: 75 }
  const ROW_TOP = 22
  const rowLabelTop = ROW_TOP + 96
  const rowNext = next === 'I' || next === 'C' || next === 'A' ? next : null
  // Help line of the step to do, centered under the whole row.
  const rowHelp =
    rowNext === 'I'
      ? t('{n} de {goal} palabras', { n: today.wordsAdded, goal: CREATION_WORDS_GOAL })
      : rowNext === 'C'
        ? t('Crea 1 frase con tus palabras')
        : rowNext === 'A'
          ? t('Graba 1 nota con tu voz')
          : null
  const panelBottom = rowLabelTop + (rowNext ? 84 : 40)
  const slotTop = panelBottom + 34
  const bonusTop = slotTop + 24
  const bonusLabelTop = bonusTop + 96
  const chestHelp = chestOpened
    ? t('Abierto: +{coins}', { coins: coinsText(todayChestCoins(entries)) })
    : chestReady
      ? t('Gana de {min} a {max} ICA Coins', { min: CYCLE_CHEST_MIN, max: CYCLE_CHEST_MAX })
      : null
  const reviewHelpText = reviewDone
    ? t('{correct} de {total} · {mode}', {
        correct: gameResult?.correct ?? 0,
        total: gameResult?.total ?? 0,
        mode: t(gameMode.name),
      })
    : reviewLocked && reviewNeedsWords
      ? t('Con {n} palabras en tu baúl', { n: DAILY_GAME_MIN_WORDS })
      : !reviewLocked
        ? t('Mínimo {n} correctas', { n: DAILY_GAME_PASS })
        : null
  const slotBottom = bonusLabelTop + (next === 'chest' || next === 'review' ? 86 : 58)
  const mobileHeight = slotBottom + 6
  const rowCenterY = ROW_TOP + 42
  // The road in the row only covers I → C → A; the fork below the box lights up once the cycle is done.
  const rowFill = fill && fill.to <= 2 ? fill : null
  const forkDone = roadReached >= 3
  const forkStroke = forkDone ? 'var(--ica-road-done)' : 'var(--ica-road-todo)'
  const forkY = panelBottom + 14
  const forkD = [
    `M${XN.C} ${panelBottom} V${forkY}`,
    `M${XN.C} ${forkY} C${XN.C} ${forkY + 10}, ${XN.chest} ${forkY + 4}, ${XN.chest} ${slotTop}`,
    `M${XN.C} ${forkY} C${XN.C} ${forkY + 10}, ${XN.review} ${forkY + 4}, ${XN.review} ${slotTop}`,
  ].join(' ')
  // Labels sit on the boxes: their backing color is the box color, so they blend in.
  const boxVars = { '--ica-label-bg': 'var(--card)', '--ica-brand': 'var(--card)' } as CSSProperties
  return (
    <>
    <div className='ica-path-skin pt-1 pb-1'>
    <div ref={pathRef} className='relative mx-auto w-full max-w-[420px]' style={{ height: mobileHeight, ...boxVars }}>
      {/* Recuadros (estilo casillas): el del ciclo I·C·A y los del cofre y el reto. */}
      <div className='ica-panel pointer-events-none absolute inset-x-0' style={{ top: 0, height: panelBottom }} aria-hidden='true' />
      <div
        className='ica-panel pointer-events-none absolute'
        style={{ left: 0, width: `calc(50% - ${SLOT_GAP / 2}px)`, top: slotTop, height: slotBottom - slotTop }}
        aria-hidden='true'
      />
      <div
        className='ica-panel pointer-events-none absolute'
        style={{ right: 0, width: `calc(50% - ${SLOT_GAP / 2}px)`, top: slotTop, height: slotBottom - slotTop }}
        aria-hidden='true'
      />
      <svg viewBox={`0 0 100 ${mobileHeight}`} preserveAspectRatio='none' className='absolute inset-0 h-full w-full' aria-hidden='true'>
        <path
          d={forkD}
          fill='none'
          stroke={forkStroke}
          strokeLinecap='round'
          strokeWidth={6}
          strokeDasharray='3 13'
          vectorEffect='non-scaling-stroke'
        />
      </svg>
      <Road
        centers={[
          [XN.I, rowCenterY],
          [XN.C, rowCenterY],
          [XN.A, rowCenterY],
        ]}
        reached={Math.min(roadReached, 2)}
        width={100}
        height={mobileHeight}
        fill={rowFill}
      />

      {/* I */}
      <PhaseTile
        onLockedClick={tapLocked}
        phase={PHASES.I}
        top={ROW_TOP}
        cx={X.I}
        state={phaseState('I', iDone)}
        onClick={() => navigate(DASHBOARD_ROUTES.newIcaWords)}
        ariaLabel={t('Inmersión: {n} de {goal} palabras', {
          n: Math.min(today.wordsAdded, CREATION_WORDS_GOAL),
          goal: CREATION_WORDS_GOAL,
        })}
      />
      <Label top={rowLabelTop} cx={X.I} maxWidth={116}>
        <span className='text-[14px] font-extrabold tracking-[0.04em]' style={{ color: PHASES.I.ink }}>{t('INMERSIÓN')}</span>
      </Label>

      {/* C */}
      <PhaseTile
        onLockedClick={tapLocked}
        phase={PHASES.C}
        top={ROW_TOP}
        cx={X.C}
        state={phaseState('C', cDone, cLocked)}
        onClick={() => navigate(DASHBOARD_ROUTES.activationPhrase)}
        ariaLabel={
          cDone
            ? t('Creación: frase creada')
            : cLocked
              ? t('Creación: bloqueada hasta terminar Inmersión')
              : t('Creación: crea una frase con tus palabras')
        }
      />
      <Label top={rowLabelTop} cx={X.C} maxWidth={116}>
        <span className='text-[14px] font-extrabold tracking-[0.04em]' style={{ color: PHASES.C.ink }}>{t('CREACIÓN')}</span>
      </Label>

      {/* A */}
      <PhaseTile
        onLockedClick={tapLocked}
        phase={PHASES.A}
        top={ROW_TOP}
        cx={X.A}
        state={phaseState('A', aDone, aLocked)}
        onClick={() => navigate(DASHBOARD_ROUTES.masterNotes)}
        ariaLabel={
          aDone
            ? t('Activación: hecha')
            : aLocked
              ? t('Activación: bloqueada hasta terminar Creación')
              : t('Activación: graba una nota con tu voz')
        }
      />
      <Label top={rowLabelTop} cx={X.A} maxWidth={116}>
        <span className='text-[14px] font-extrabold tracking-[0.04em]' style={{ color: PHASES.A.ink }}>{t('ACTIVACIÓN')}</span>
      </Label>

      {/* Chip and help text of the step to do, centered under the row (keeps the three names aligned). */}
      {rowHelp ? (
        <Label top={rowLabelTop + 30} maxWidth={300}>
          <StartChip label={rowNext === 'I' ? 'EMPIEZA AQUÍ' : 'SIGUE AQUÍ'} color='#ffffff' textColor='#0b84b5' />
          <span className='text-[13px] font-semibold text-balance' style={{ color: 'var(--ica-brand-sub)' }}>{rowHelp}</span>
        </Label>
      ) : null}

      {/* Cofre */}
      {chestReady ? (
        <span
          className='ica-glow-pulse pointer-events-none absolute rounded-full'
          style={{
            left: at(X.chest, -60),
            top: bonusTop - 18,
            width: 120,
            height: 104,
            background: 'radial-gradient(closest-side, #ffd54acc, #ffd54a55 55%, transparent)',
          }}
          aria-hidden='true'
        />
      ) : null}
      {chestReady ? (
        <span
          className='pointer-events-none absolute rounded-[32px] border-[6px]'
          style={{ left: at(X.chest, -52), top: bonusTop - 16, width: 104, height: 96, borderColor: CHEST_RING }}
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
        className={`absolute flex items-center justify-center ${chestReady ? 'ica-chest-ready' : ''} ${chestLocked ? 'cursor-not-allowed' : 'active:scale-95'}`}
        style={{
          left: at(X.chest, -44),
          top: bonusTop - 8,
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
      {chestOpened ? <DoneBadge style={{ left: at(X.chest, 24), top: bonusTop - 14 }} /> : null}
      {chestReady ? (
        <>
          <Sparkle style={{ left: at(X.chest, 36), top: bonusTop - 14 }} delay='0s' size={14} />
          <Sparkle style={{ left: at(X.chest, -49), top: bonusTop + 6 }} delay='0.6s' size={11} />
          <Sparkle style={{ left: at(X.chest, 22), top: bonusTop + 62 }} delay='1.1s' size={10} />
        </>
      ) : null}
      {chestLocked ? <LockBadge style={{ left: at(X.chest, 24), top: bonusTop - 14 }} /> : null}
      <Label top={bonusLabelTop} cx={X.chest} maxWidth={164}>
        {next === 'chest' ? <StartChip label={t('¡ÁBRELO!')} color='#a16207' /> : null}
        <span className='text-[13px] font-extrabold tracking-[0.04em] whitespace-nowrap' style={{ color: 'var(--ica-brand-ink)' }}>
          {t('COFRE DEL CICLO')}
        </span>
        {chestHelp ? (
          <span className='text-[12px] font-semibold text-balance' style={{ color: 'var(--ica-brand-sub)' }}>{chestHelp}</span>
        ) : null}
      </Label>

      {/* Reto del día (minijuego con tus palabras) */}
      {next === 'review' ? (
        <span
          className='pointer-events-none absolute rounded-[32px] border-[6px]'
          style={{ left: at(X.review, -50), top: bonusTop - 8, width: 100, height: 100, borderColor: RETO_RING }}
          aria-hidden='true'
        />
      ) : null}
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
                : t('Reto del día: se abre al completar I·C·A')
              : t('Reto del día: tu minijuego con palabras ICA')
        }
        className={`absolute flex items-center justify-center rounded-[26px] transition-transform ${next === 'review' ? 'ica-bob' : ''} ${reviewLocked ? 'cursor-not-allowed' : 'active:scale-95'}`}
        style={{
          left: at(X.review, -42),
          top: bonusTop,
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
      {reviewDone ? <DoneBadge style={{ left: at(X.review, 22), top: bonusTop - 6 }} /> : null}
      {reviewLocked ? <LockBadge style={{ left: at(X.review, 22), top: bonusTop - 6 }} /> : null}
      <Label top={bonusLabelTop} cx={X.review} maxWidth={164}>
        {next === 'review' ? <StartChip label='TERMINA AQUÍ' color='var(--ica-reto-edge)' /> : null}
        <span className='text-[13px] font-extrabold tracking-[0.04em] whitespace-nowrap' style={{ color: 'var(--ica-brand-ink)' }}>{t('RETO DEL DÍA')}</span>
        {reviewHelpText ? (
          <span className='text-[12px] font-semibold text-balance' style={{ color: 'var(--ica-brand-sub)' }}>{reviewHelpText}</span>
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
                  className={`relative flex items-center justify-center transition-transform ${locked ? 'cursor-not-allowed' : 'hover:-translate-y-0.5 active:scale-95'} ${state === 'next' ? (step.bare ? 'ica-chest-ready' : 'ica-bob') : ''}`}
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
