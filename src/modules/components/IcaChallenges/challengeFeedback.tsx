/**
 * Sonidos y celebración de Desafíos ICA:
 *  - botón para silenciar (se recuerda en este dispositivo),
 *  - acierto corto y suave, fallo grave,
 *  - confeti al ganar.
 * El audio de las preguntas de Escucha NO se silencia: es la propia pregunta.
 */
import { useCallback, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { Volume2Icon, VolumeXIcon } from 'lucide-react'
import { t } from '@/i18n'
import { playBeep, playFailTone, playSoftCorrect } from '../NotaDesafiante/challengeEngine'

const MUTE_STORAGE_KEY = 'ica-challenges-muted'

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeMuted(muted: boolean): void {
  try {
    if (muted) window.localStorage.setItem(MUTE_STORAGE_KEY, '1')
    else window.localStorage.removeItem(MUTE_STORAGE_KEY)
  } catch {
    // Sin almacenamiento (modo privado): vale solo para esta partida.
  }
}

export function useChallengeSounds() {
  const [muted, setMuted] = useState(readMuted)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  const toggleMuted = useCallback(() => {
    const next = !mutedRef.current
    mutedRef.current = next
    writeMuted(next)
    setMuted(next)
  }, [])

  /** Por turnos: "tin-tin" suave al acertar, dos notas graves al fallar. */
  const playAnswer = useCallback((isCorrect: boolean) => {
    if (mutedRef.current) return
    void (isCorrect ? playSoftCorrect() : playFailTone())
  }, [])

  /** Cuenta atrás: lo mismo, pero el fallo es un pitido cortito para no frenar. */
  const playQuickAnswer = useCallback((isCorrect: boolean) => {
    if (mutedRef.current) return
    void (isCorrect ? playSoftCorrect() : playBeep(262, 140))
  }, [])

  return { muted, toggleMuted, playAnswer, playQuickAnswer }
}

export function SoundToggleButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  const Icon = muted ? VolumeXIcon : Volume2Icon
  const label = muted ? t('Activar sonidos') : t('Silenciar sonidos')
  return (
    <button
      type='button'
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition hover:bg-muted ${
        muted ? 'text-muted-foreground' : 'text-foreground'
      }`}
    >
      <Icon className='h-4 w-4' />
    </button>
  )
}

const WIN_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fb7185', '#fbbf24']

/**
 * Fuegos artificiales al ganar: tres explosiones pequeñas y rápidas (menos de un segundo),
 * de puntitos redondos. Devuelve cómo pararlo.
 */
export function launchWinConfetti(): () => void {
  const base = {
    colors: WIN_COLORS,
    zIndex: 1200,
    disableForReducedMotion: false,
    shapes: ['circle' as const],
    particleCount: 26,
    spread: 360,
    startVelocity: 22,
    gravity: 0.9,
    decay: 0.9,
    scalar: 0.7,
    ticks: 90,
  }
  const bursts = [
    { x: 0.5, y: 0.28 },
    { x: 0.25, y: 0.38 },
    { x: 0.75, y: 0.36 },
  ]
  const timers: number[] = []
  try {
    bursts.forEach((origin, index) => {
      timers.push(window.setTimeout(() => void confetti({ ...base, origin }), index * 220))
    })
  } catch {
    return () => {}
  }
  return () => timers.forEach((id) => window.clearTimeout(id))
}
