import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { badgeWhooshPeak } from './badgeSounds'
import { gameSfx, LEGEND_STAR_FALL_MS, playBadgeSound, type BadgeSoundTier, type StopBadgeSound } from './sfx'
import { isLegend, legendStars, type MedalTier } from './medals'
import { t } from '@/i18n'

// INSIGNIA QUE GIRA: al abrirla (o al tocarla) da una vuelta completa sobre sí misma, como una
// moneda, y el whoosh suena justo cuando gira más rápido (el sonido es el aire que mueve).
// Termina de cara a la pantalla con un pequeño vaivén. Tiene grosor (unas capas oscuras entre
// la cara y el dorso), la luz cambia según hacia dónde mira y su sombra se estrecha de canto.

/** Cuánto dura la vuelta en cada rango (las más altas, algo más lenta y lucida). */
const SPIN_MS: Record<BadgeSoundTier, number> = {
  bronce: 900,
  plata: 950,
  oro: 1000,
  rubi: 1050,
  diamante: 1100,
  leyenda: 1200,
}
/** Grosor de la insignia en píxeles (cara y dorso a ±HALF, capas en medio). */
const HALF_DEPTH = 3
const EDGE_LAYERS = 5
const SAMPLES = 60

/** Curva de la vuelta: arranca suave, acelera, se pasa un poco y vuelve (como una moneda). */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (time: number) => ((ax * time + bx) * time + cx) * time
  const sampleY = (time: number) => ((ay * time + by) * time + cy) * time
  const slopeX = (time: number) => (3 * ax * time + 2 * bx) * time + cx
  return (x: number) => {
    let time = x
    for (let index = 0; index < 8; index += 1) {
      const error = sampleX(time) - x
      const slope = slopeX(time)
      if (Math.abs(error) < 1e-6 || Math.abs(slope) < 1e-6) break
      time -= error / slope
    }
    return sampleY(Math.min(1, Math.max(0, time)))
  }
}

const spinEase = cubicBezier(0.55, 0, 0.22, 1.1)

/** Momento (0-1) en el que la vuelta va más rápida: ahí cae el golpe del whoosh. */
const FASTEST_AT = (() => {
  let best = 0
  let bestSpeed = 0
  for (let index = 1; index < 400; index += 1) {
    const time = index / 400
    const speed = spinEase(time) - spinEase(time - 1 / 400)
    if (speed > bestSpeed) {
      bestSpeed = speed
      best = time
    }
  }
  return best
})()

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Insignia que gira con su sonido. Gira al aparecer y cada vez que cambia `spinKey`;
 * también al tocarla. `children` es la medalla (se repite para la cara, el dorso y el canto).
 */
export function SpinningMedal({
  tier,
  locked = false,
  spinKey,
  enter = false,
  className,
  children,
}: {
  tier: MedalTier
  locked?: boolean
  /** Cada vez que cambia, vuelve a girar (p. ej. al elegir otro rango). */
  spinKey?: string | number
  /** La primera vuelta entra desde pequeña (al abrir la ventana). */
  enter?: boolean
  className?: string
  children: ReactNode
}) {
  const wrapperRef = useRef<HTMLButtonElement>(null)
  const rotorRef = useRef<HTMLDivElement>(null)
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLSpanElement>(null)
  const stopSoundRef = useRef<StopBadgeSound | null>(null)
  const mountedAtRef = useRef(0)

  const starTimersRef = useRef<number[]>([])

  const spin = useCallback(() => {
    // Solo la vuelta del principio entra desde pequeña.
    const entering = enter && performance.now() - mountedAtRef.current < 200
    stopSoundRef.current?.()
    // La Leyenda tiene su propio sonido (más grave, con golpe hondo); luego caen sus estrellas.
    const soundTier: BadgeSoundTier = isLegend(tier) ? 'leyenda' : (tier as BadgeSoundTier)
    const duration = SPIN_MS[soundTier]
    starTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    starTimersRef.current = []
    if (prefersReducedMotion() || !rotorRef.current) {
      stopSoundRef.current = playBadgeSound(soundTier, { locked })
      return
    }
    // El golpe de aire cae cuando la insignia gira más rápido.
    const delay = Math.max(0, (FASTEST_AT * duration) / 1000 - badgeWhooshPeak(soundTier))
    stopSoundRef.current = playBadgeSound(soundTier, { locked, delay })

    // Leyenda: sale sin estrellas y, al acabar la vuelta, caen una a una sobre el aro
    // (desde arriba, cada una con un golpe seco y grave).
    const stars = legendStars(tier)
    if (stars > 0) {
      const all = Array.from(rotorRef.current.querySelectorAll<SVGGElement>('.ica-legend-star'))
      for (const star of all) {
        star.style.transformBox = 'fill-box'
        star.style.transformOrigin = 'center'
        star.style.opacity = '0'
      }
      const fallMs = LEGEND_STAR_FALL_MS
      const totalMs = Math.round(fallMs / 0.62)
      for (let index = 0; index < stars; index += 1) {
        starTimersRef.current.push(
          window.setTimeout(() => {
            for (const star of all.filter((item) => item.dataset.star === String(index))) {
              star.style.opacity = ''
              star.animate(
                [
                  { transform: 'translate(0px, -46px) scale(1.7) rotate(-30deg)', opacity: 0, easing: 'cubic-bezier(.55,0,.95,.5)' },
                  { opacity: 1, offset: 0.3 },
                  { transform: 'translate(0px, 0px) scale(0.86) rotate(0deg)', offset: 0.62, easing: 'ease-out' },
                  { transform: 'translate(0px, -3px) scale(1.2)', offset: 0.8, easing: 'ease-in-out' },
                  { transform: 'translate(0px, 0px) scale(1)' },
                ],
                { duration: totalMs },
              )
            }
            // También en las que aún no tienes (más bajito), para oír cómo serán.
            gameSfx.legendStar(locked, index === stars - 1)
          }, duration + 120 + index * 400),
        )
      }
    }

    const rotor: Keyframe[] = []
    const front: Keyframe[] = []
    const back: Keyframe[] = []
    const shadow: Keyframe[] = []
    for (let index = 0; index <= SAMPLES; index += 1) {
      const time = index / SAMPLES
      const angle = 360 * spinEase(time)
      const facing = Math.cos((angle * Math.PI) / 180)
      // Un pequeño «salto» hacia la pantalla mientras gira; al abrir, entra desde pequeña.
      const lift = 1 + 0.07 * Math.sin(Math.PI * time)
      const grow = entering ? 0.55 + 0.45 * Math.min(1, spinEase(Math.min(1, time / 0.55))) : 1
      // Ojo: nada de opacity ni filter en la pieza que gira (aplanaría el 3D y el canto
      // oscuro se pintaría encima de la cara). El fundido de entrada va en el envoltorio.
      rotor.push({ transform: `rotateY(${angle.toFixed(2)}deg) scale(${(lift * grow).toFixed(4)})` })
      // Luz: la cara brilla de frente y se oscurece de canto; el dorso es algo más oscuro.
      front.push({ filter: `brightness(${(0.72 + 0.28 * Math.max(0, facing)).toFixed(3)})` })
      back.push({ filter: `brightness(${(0.6 + 0.22 * Math.max(0, -facing)).toFixed(3)})` })
      shadow.push({
        transform: `scaleX(${(0.3 + 0.7 * Math.abs(facing)).toFixed(3)})`,
        opacity: 0.35 + 0.25 * Math.abs(facing),
      })
    }
    const timing: KeyframeAnimationOptions = { duration, easing: 'linear', fill: 'none' }
    for (const element of [wrapperRef.current, rotorRef.current, frontRef.current, backRef.current, shadowRef.current]) {
      element?.getAnimations().forEach((animation) => animation.cancel())
    }
    rotorRef.current.animate(rotor, timing)
    frontRef.current?.animate(front, timing)
    backRef.current?.animate(back, timing)
    shadowRef.current?.animate(shadow, timing)
    if (entering) wrapperRef.current?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 1 }], timing)
  }, [tier, locked, enter])

  useEffect(() => {
    if (!mountedAtRef.current) mountedAtRef.current = performance.now()
    spin()
    // Gira al aparecer y al cambiar spinKey (no al cambiar `spin`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey])

  useEffect(
    () => () => {
      stopSoundRef.current?.()
      starTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    },
    [],
  )

  const face = 'absolute inset-0 [backface-visibility:hidden]'
  return (
    <button
      ref={wrapperRef}
      type='button'
      onClick={spin}
      aria-label={t('Girar la insignia')}
      className={`relative block w-full cursor-pointer rounded-full [perspective:800px] focus-visible:outline-none ${className ?? ''}`}
    >
      <span
        ref={shadowRef}
        aria-hidden='true'
        className='pointer-events-none absolute right-[14%] -bottom-2 left-[14%] h-3 rounded-[50%] opacity-60 blur-[5px]'
        style={{ background: 'rgb(0 0 0 / 0.35)' }}
      />
      <div ref={rotorRef} className='relative [transform-style:preserve-3d]'>
        {/* Cara (en el flujo: da el tamaño) */}
        <div ref={frontRef} className='relative [backface-visibility:hidden]' style={{ transform: `translateZ(${HALF_DEPTH}px)` }}>
          {children}
        </div>
        {/* Canto: copias oscuras entre la cara y el dorso */}
        {Array.from({ length: EDGE_LAYERS }, (_, index) => {
          const z = HALF_DEPTH - ((index + 1) * (2 * HALF_DEPTH)) / (EDGE_LAYERS + 1)
          return (
            <div
              key={index}
              aria-hidden='true'
              className='pointer-events-none absolute inset-0'
              style={{ transform: `translateZ(${z.toFixed(2)}px)`, filter: 'brightness(0.45) saturate(0.8)' }}
            >
              {children}
            </div>
          )
        })}
        {/* Dorso */}
        <div
          ref={backRef}
          aria-hidden='true'
          className={`pointer-events-none ${face}`}
          style={{ transform: `rotateY(180deg) translateZ(${HALF_DEPTH}px)`, filter: 'brightness(0.6)' }}
        >
          {children}
        </div>
      </div>
    </button>
  )
}
