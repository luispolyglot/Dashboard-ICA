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
  const label = muted ? 'Activar sonidos' : 'Silenciar sonidos'
  return (
    <button
      type='button'
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition hover:bg-muted ${
        muted ? 'text-muted-foreground' : 'text-foreground'
      }`}
    >
      <Icon className='h-4 w-4' />
    </button>
  )
}

const WIN_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fb7185', '#fbbf24']

/** Confeti al ganar: una explosión en el centro y dos cañones a los lados. Devuelve cómo pararlo. */
export function launchWinConfetti(): () => void {
  const base = { colors: WIN_COLORS, zIndex: 1200, disableForReducedMotion: false, ticks: 260 }
  try {
    void confetti({ ...base, particleCount: 110, spread: 100, startVelocity: 42, origin: { x: 0.5, y: 0.32 } })
  } catch {
    return () => {}
  }
  let bursts = 0
  const intervalId = window.setInterval(() => {
    bursts += 1
    void confetti({ ...base, particleCount: 28, angle: 60, spread: 58, startVelocity: 52, origin: { x: 0, y: 0.72 } })
    void confetti({ ...base, particleCount: 28, angle: 120, spread: 58, startVelocity: 52, origin: { x: 1, y: 0.72 } })
    if (bursts >= 5) window.clearInterval(intervalId)
  }, 240)
  return () => window.clearInterval(intervalId)
}
