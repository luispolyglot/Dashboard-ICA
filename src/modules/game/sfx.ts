import { playBadgeFanfare, type BadgeTier } from './badgeSounds'

// Sonidos cortos del modo juego, generados en el navegador (sin archivos de audio).
// El alumno puede apagarlos; la preferencia se guarda solo en este dispositivo.

const SOUND_PREF_KEY = 'ica-game-sound'

let audioContext: AudioContext | null = null

export function isGameSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setGameSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? 'on' : 'off')
  } catch {
    // Sin almacenamiento: se queda como estaba hasta recargar.
  }
}

function playTones(frequencies: number[], step = 0.11, type: OscillatorType = 'sine', volume = 0.15): void {
  if (typeof window === 'undefined' || !isGameSoundEnabled()) return
  try {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return
    audioContext = audioContext || new AudioCtor()
    if (audioContext.state === 'suspended') void audioContext.resume()
    const start = audioContext.currentTime
    frequencies.forEach((frequency, index) => {
      if (!audioContext) return
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      const at = start + index * step
      oscillator.type = type
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(volume, at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, at + step * 1.6)
      oscillator.connect(gain).connect(audioContext.destination)
      oscillator.start(at)
      oscillator.stop(at + step * 1.7)
    })
  } catch {
    // Si el navegador no deja reproducir audio, el juego sigue sin sonido.
  }
}

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // iPhone no vibra desde la web; no pasa nada.
  }
}

export const gameSfx = {
  correct() {
    playTones([660, 990])
    vibrate(20)
  },
  wrong() {
    playTones([330, 247], 0.14, 'triangle')
    vibrate([40, 40, 40])
  },
  celebrate() {
    playTones([523, 659, 784, 1047], 0.12)
    vibrate([30, 40, 60])
  },
  tap() {
    playTones([520], 0.05)
  },
  /** Racha del día: dos notas suaves y rápidas. */
  streak() {
    playTones([784, 1175], 0.07, 'sine', 0.1)
    vibrate(20)
  },
  /** El cofre se abre. */
  chest() {
    playTones([392, 587, 880], 0.06, 'triangle', 0.12)
    vibrate([20, 30, 20])
  },
  /** Una moneda llega al contador. */
  coin() {
    playTones([1319], 0.045, 'sine', 0.07)
  },
}

// ---------------------------------------------------------------------------
// Sonido de las insignias (al verlas en el perfil o al tocar la de alguien en el ranking)
// ---------------------------------------------------------------------------
// Los sonidos están en badgeSounds.ts (estudio, rangos y packs de timbre).

export type BadgeSoundTier = BadgeTier

/** Para el sonido (con un pequeño fundido). Se puede llamar varias veces. */
export type StopBadgeSound = () => void

const noop: StopBadgeSound = () => undefined

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !isGameSoundEnabled()) return null
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtor) return null
  audioContext = audioContext || new AudioCtor()
  if (audioContext.state === 'suspended') void audioContext.resume()
  return audioContext
}

/**
 * Suena la insignia que aparece (corto y alegre, más fiesta cuanto más alto el rango).
 * Devuelve una función para cortarlo. Respeta el interruptor de sonido.
 */
export function playBadgeSound(tier: BadgeSoundTier, options: { locked?: boolean; delay?: number } = {}): StopBadgeSound {
  try {
    const ctx = getAudioContext()
    if (!ctx) return noop
    if (!options.locked) vibrate(tier === 'diamante' || tier === 'rubi' ? [20, 40, 20, 40, 60] : tier === 'oro' ? [30, 40, 50] : 25)
    return playBadgeFanfare(ctx, tier, { locked: options.locked, delay: options.delay })
  } catch {
    return noop
  }
}
