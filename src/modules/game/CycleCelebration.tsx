import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import confetti from 'canvas-confetti'
import { CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDashboardContext } from '../context/DashboardContext'
import { getTodayProgress } from '../constants'
import { fichasFormatter, releaseCoinsDisplay } from './fichas'
import { ChestIcon, FichaIcon, FlameIcon } from './icons'
import { getIcaStreakState } from './streak'
import { t, tn } from '@/i18n'

const OPEN_EVENT = 'ica:open-cycle-celebration'
/** Se lanza al cerrar la celebración (el camino de Inicio espera a esto para rellenarse). */
export const CYCLE_CELEBRATION_CLOSED_EVENT = 'ica:cycle-celebration-closed'

function notifyClosed(): void {
  window.dispatchEvent(new Event(CYCLE_CELEBRATION_CLOSED_EVENT))
}

type CelebrationDetail = {
  chestFichas: number
  milestoneFichas: number
  /** Cofre recién abierto: animación de apertura y «Recoger mis ICA Coins». */
  fresh?: boolean
}

/** Abre la pantalla de "ciclo ICA completado" (la escucha CycleCelebration). */
export function openCycleCelebration(detail: CelebrationDetail): void {
  window.dispatchEvent(new CustomEvent<CelebrationDetail>(OPEN_EVENT, { detail }))
}

// Las tres fases con sus azules (los mismos de «Tus límites de hoy» en ICA Coins).
const LETTERS = [
  { letter: 'I', name: t('Inmersión'), color: 'var(--ica-i)', edge: 'var(--ica-i-edge)' },
  { letter: 'C', name: t('Creación'), color: 'var(--ica-c)', edge: 'var(--ica-c-edge)' },
  { letter: 'A', name: t('Activación'), color: 'var(--ica-a)', edge: 'var(--ica-a-edge)' },
] as const

type Phase = 'shaking' | 'open'
type Flyer = { id: number; x: number; y: number; dx: number; dy: number; delay: number }

const FLY_MS = 750
const FLY_STAGGER_MS = 110

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Dirección de cada moneda que sale del cofre (en abanico hacia arriba). */
function burstOffset(index: number, count: number): { bx: string; by: string } {
  const spread = Math.min(150, 34 * (count - 1))
  const x = count === 1 ? 0 : -spread / 2 + (spread * index) / (count - 1)
  const y = -58 - (count > 2 ? 18 * Math.cos(((index / (count - 1)) * 2 - 1) * (Math.PI / 2)) : 10)
  return { bx: `${Math.round(x)}px`, by: `${Math.round(y)}px` }
}

/**
 * Al abrir el cofre del ciclo: el cofre tiembla, se abre de golpe y salen las ICA Coins.
 * Debajo, el ciclo completado y la racha. El botón «Recoger mis ICA Coins» las manda
 * volando al contador de arriba, que las suma.
 */
export function CycleCelebration() {
  const {
    dailyProgress,
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
  } = useDashboardContext()
  const [detail, setDetail] = useState<CelebrationDetail | null>(null)
  const [phase, setPhase] = useState<Phase>('open')
  const [flyers, setFlyers] = useState<Flyer[]>([])
  const coinsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onOpen = (event: Event) => {
      const next = (event as CustomEvent<CelebrationDetail>).detail
      setDetail(next)
      const animate = Boolean(next.fresh) && !prefersReducedMotion()
      setPhase(animate ? 'shaking' : 'open')
      // Sin sonidos en el cofre (Luis, 2 oct): ni al abrirlo ni al recoger las monedas.
      if (!animate) return
      window.setTimeout(() => {
        setPhase('open')
        try {
          void confetti({ particleCount: 60, spread: 70, startVelocity: 30, origin: { y: 0.3 }, zIndex: 120 })
        } catch {
          // Sin confeti no pasa nada.
        }
      }, 850)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  const totalFichas = detail ? detail.chestFichas + detail.milestoneFichas : 0

  // «Recoger mis ICA Coins»: las monedas vuelan al contador de arriba y se suman.
  const collect = () => {
    if (!detail) return
    const source = coinsRef.current?.getBoundingClientRect()
    const target = Array.from(document.querySelectorAll<HTMLElement>('[data-coin-target]'))
      .map((element) => element.getBoundingClientRect())
      .find((rect) => rect.width > 0 && rect.height > 0)
    setDetail(null)
    notifyClosed()
    if (!source || !target || prefersReducedMotion() || totalFichas <= 0) {
      releaseCoinsDisplay(0)
      return
    }
    const count = Math.max(1, Math.min(totalFichas, 8))
    const startX = source.left + source.width / 2 - 14
    const startY = source.top + source.height / 2 - 14
    const endX = target.left + target.width / 2 - 14
    const endY = target.top + target.height / 2 - 14
    setFlyers(
      Array.from({ length: count }, (_, index) => ({
        id: Date.now() + index,
        x: startX + (index - (count - 1) / 2) * 12,
        y: startY,
        dx: endX - (startX + (index - (count - 1) / 2) * 12),
        dy: endY - startY,
        delay: index * FLY_STAGGER_MS,
      })),
    )
    // Al final el contador suma lo que faltaba (sin sonido).
    window.setTimeout(() => releaseCoinsDisplay(60), FLY_MS)
    window.setTimeout(() => setFlyers([]), FLY_MS + count * FLY_STAGGER_MS + 100)
  }

  const flyerLayer =
    flyers.length > 0 ? (
      <div className='pointer-events-none fixed inset-0 z-[140]' aria-hidden='true'>
        {flyers.map((flyer) => (
          <span
            key={flyer.id}
            className='ica-coin-fly absolute'
            style={
              {
                left: flyer.x,
                top: flyer.y,
                animationDelay: `${flyer.delay}ms`,
                '--dx': `${flyer.dx}px`,
                '--dy': `${flyer.dy}px`,
              } as CSSProperties
            }
          >
            <FichaIcon size={28} />
          </span>
        ))}
      </div>
    ) : null

  if (!detail) return flyerLayer

  const streakState = getIcaStreakState({
    creationDays,
    savedCreationDays,
    creationSavesUsedThisMonth,
    creationSavesLimit,
    todayProgress: getTodayProgress(dailyProgress),
  })
  const close = () => {
    setDetail(null)
    notifyClosed()
    releaseCoinsDisplay(0)
  }
  const opened = phase === 'open'
  // Tocar fuera de la tarjeta (la parte oscura de arriba) también sale: si el cofre es
  // nuevo, recoge las monedas igual que el botón.
  const dismiss = () => {
    if (!opened) return
    if (detail.fresh) collect()
    else close()
  }
  const burstCount = Math.max(1, Math.min(totalFichas, 5))

  return (
    <div
      className='fixed inset-0 z-[110] flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center'
      role='dialog'
      aria-modal='true'
      aria-label={t('Cofre del ciclo ICA')}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss()
      }}
    >
      <div className='ica-sheet-up max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-background px-5 pt-7 pb-[max(env(safe-area-inset-bottom),1.25rem)] text-center shadow-2xl sm:rounded-[28px]'>
        <div className='relative mx-auto size-36'>
          <span
            className={opened ? 'ica-glow-pulse absolute inset-0 rounded-full' : 'absolute inset-0 rounded-full'}
            style={{ background: 'var(--ica-gold-soft)' }}
            aria-hidden='true'
          />
          <div
            key={phase}
            className={`relative flex size-36 items-center justify-center ${opened ? 'ica-pop' : 'ica-chest-shake'}`}
          >
            <ChestIcon size={100} state={opened ? 'open' : 'ready'} />
          </div>
          {/* Las monedas que salen del cofre */}
          {opened && detail.fresh ? (
            <div ref={coinsRef} className='pointer-events-none absolute top-[38%] left-1/2 -translate-x-1/2' aria-hidden='true'>
              {Array.from({ length: burstCount }, (_, index) => {
                const { bx, by } = burstOffset(index, burstCount)
                return (
                  <span
                    key={index}
                    className='ica-coin-burst absolute -translate-x-1/2'
                    style={{ '--bx': bx, '--by': by, animationDelay: `${index * 70}ms` } as CSSProperties}
                  >
                    <FichaIcon size={30} />
                  </span>
                )
              })}
            </div>
          ) : (
            <div ref={coinsRef} className='absolute top-1/3 left-1/2 size-1' aria-hidden='true' />
          )}
        </div>

        <div className={opened ? 'ica-fade-up' : 'invisible'}>
          <p
            className='mt-3 flex items-center justify-center gap-2 text-4xl leading-none font-black tabular-nums'
            style={{ color: 'var(--ica-gold-ink)' }}
          >
            <FichaIcon size={34} />+{fichasFormatter.format(totalFichas)}
          </p>
          <p className='mt-1 text-sm font-bold' style={{ color: 'var(--ica-gold-ink)' }}>
            {totalFichas === 1 ? 'ICA Coin' : 'ICA Coins'}
            {detail.milestoneFichas > 0
              ? t(' ({chest} del cofre + {milestone} por hito de racha)', {
                  chest: fichasFormatter.format(detail.chestFichas),
                  milestone: fichasFormatter.format(detail.milestoneFichas),
                })
              : ''}
          </p>

          <h2 className='mt-4 font-display text-2xl font-extrabold tracking-tight'>{t('Ciclo ICA completado')}</h2>
          <div className='mt-3 flex justify-center gap-2'>
            {LETTERS.map((item) => (
              <span key={item.letter} className='flex flex-col items-center gap-1'>
                <span
                  className='relative flex size-12 items-center justify-center rounded-2xl font-ica text-2xl font-extrabold'
                  style={{
                    background: item.color,
                    color: '#ffffff',
                    boxShadow: `0 4px 0 ${item.edge}`,
                  }}
                >
                  {item.letter}
                  <span
                    className='absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full border-2 border-background'
                    style={{ background: '#0b84b5' }}
                    aria-hidden='true'
                  >
                    <CheckIcon className='size-3' strokeWidth={3.4} style={{ color: '#ffffff' }} />
                  </span>
                </span>
                <span className='text-[11px] font-semibold text-muted-foreground'>{t(item.name)}</span>
              </span>
            ))}
          </div>

          <div className='mt-4 flex items-center gap-3 rounded-2xl border-2 border-border p-3 text-left'>
            <FlameIcon size={30} />
            <div className='min-w-0 flex-1'>
              <p className='text-sm font-extrabold'>
                {tn(streakState.streak, t('Racha ICA: {n} día'), t('Racha ICA: {n} días'))}
              </p>
            </div>
          </div>

          {detail.fresh ? (
            <Button type='button' size='xl' variant='gold' className='mt-5 w-full' onClick={collect}>
              <FichaIcon size={24} />
              {t('Recoger mis ICA Coins')}
            </Button>
          ) : (
            <Button type='button' size='xl' variant='outline' className='mt-5 w-full' onClick={close}>
              {t('Cerrar')}
            </Button>
          )}
        </div>
      </div>
      {flyerLayer}
    </div>
  )
}
