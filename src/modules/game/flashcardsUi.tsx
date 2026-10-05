import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { SquareIcon, TurtleIcon, Volume2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getImportance } from '../constants'
import { prefetchSpeech, speakNatural, stopTTS } from '../services/tts'
import type { ImportanceKey, ReviewMode } from '../types'

/**
 * Piezas propias de las flashcards (elegir modo y partida): colores de cada frecuencia,
 * el icono de barras y el botón grande de voz.
 */

/** Barras llenas de cada frecuencia: vital 5 … irrelevante 1. */
const FREQUENCY_BARS: Record<ImportanceKey, number> = {
  vital: 5,
  frequent: 4,
  occasional: 3,
  rare: 2,
  irrelevant: 1,
}

export type ModeColors = { solid: string; soft: string; ink: string; edge: string }

/** Colores de una frecuencia (o del modo aleatorio), listos para modo claro y oscuro. */
export function modeColors(mode: ReviewMode): ModeColors {
  const solid = mode === 'mixed' ? 'var(--primary)' : getImportance(mode).color
  return {
    solid,
    soft: `color-mix(in oklab, ${solid} 15%, var(--card))`,
    ink: `color-mix(in oklab, ${solid} 66%, var(--foreground))`,
    edge: `color-mix(in oklab, ${solid} 72%, black)`,
  }
}

/** Icono de barras de señal: cuántas se llenan dice lo frecuente que es la palabra. */
export function FrequencyGlyph({
  importance,
  size = 28,
  color,
  className,
}: {
  importance: ImportanceKey
  size?: number
  color?: string
  className?: string
}) {
  const filled = FREQUENCY_BARS[importance]
  const fill = color ?? getImportance(importance).color
  return (
    <svg viewBox='0 0 24 24' width={size} height={size} className={className} aria-hidden='true' style={{ flexShrink: 0 }}>
      {[0, 1, 2, 3, 4].map((index) => {
        const height = 5 + index * 3.6
        return (
          <rect
            key={index}
            x={1.6 + index * 4.4}
            y={21.5 - height}
            width={3.4}
            height={height}
            rx={1.5}
            style={{ fill: index < filled ? fill : 'var(--border-strong)' }}
          />
        )
      })}
    </svg>
  )
}

/** Punto de color de una frecuencia. */
export function FrequencyDot({ importance, className }: { importance: ImportanceKey; className?: string }) {
  return (
    <span
      aria-hidden='true'
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ background: getImportance(importance).color }}
    />
  )
}

/**
 * Botón grande de voz (el altavoz) y, al lado, la tortuga para oírlo despacio.
 * Normal = x1, tortuga = x0.75.
 */
export function SpeakWordButton({
  text,
  langName,
  size = 'lg',
  className,
}: {
  text: string
  langName: string
  size?: 'lg' | 'sm'
  className?: string
}) {
  const [playing, setPlaying] = useState<null | 1 | 0.75>(null)

  // Si cambia la palabra, se corta el audio que sonaba.
  useEffect(() => {
    setPlaying(null)
  }, [text])

  // The voice of the card on screen is prepared right away: tapping it later is instant.
  useEffect(() => {
    void prefetchSpeech(text, langName)
  }, [text, langName])

  const play = (event: MouseEvent<HTMLButtonElement>, rate: 1 | 0.75) => {
    event.stopPropagation()
    if (playing === rate) {
      stopTTS()
      setPlaying(null)
      return
    }
    setPlaying(rate)
    speakNatural(text, langName, () => setPlaying(null), rate)
  }

  const big = size === 'lg'
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <button
        type='button'
        onClick={(event) => play(event, 1)}
        aria-label={playing === 1 ? 'Parar audio' : `Escuchar en ${langName.toLowerCase()}`}
        className={cn(
          'ica-press flex items-center justify-center bg-primary text-primary-foreground',
          big ? 'size-16 rounded-2xl' : 'size-11 rounded-xl',
        )}
        style={{ boxShadow: '0 4px 0 var(--primary-edge)' }}
      >
        {playing === 1 ? (
          <SquareIcon className={big ? 'size-6' : 'size-4'} strokeWidth={2.6} fill='currentColor' />
        ) : (
          <Volume2Icon className={big ? 'size-8' : 'size-5'} strokeWidth={2.5} />
        )}
      </button>
      <button
        type='button'
        onClick={(event) => play(event, 0.75)}
        aria-label={playing === 0.75 ? 'Parar audio' : 'Escuchar despacio'}
        className={cn(
          'ica-press flex items-center justify-center border-2 border-border bg-card text-primary',
          big ? 'size-12 rounded-2xl' : 'size-11 rounded-xl',
        )}
        style={{ boxShadow: '0 3px 0 var(--border)' }}
      >
        {playing === 0.75 ? (
          <SquareIcon className='size-4' strokeWidth={2.6} fill='currentColor' />
        ) : (
          <TurtleIcon className={big ? 'size-6' : 'size-5'} strokeWidth={2.4} />
        )}
      </button>
    </span>
  )
}
