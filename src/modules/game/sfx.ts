import { playBadgeFanfare, type BadgeTier } from './badgeSounds'

// Sonidos cortos del modo juego, generados en el navegador (sin archivos de audio).
// El alumno puede apagarlos; la preferencia se guarda solo en este dispositivo.

const SOUND_PREF_KEY = 'ica-game-sound'

let audioContext: AudioContext | null = null

// MÚSICA DE FONDO (Luis, 4 oct): en el iPhone, en cuanto la web suena, Safari paraba Spotify.
// Como en los juegos (Clash Royale), los efectos van en modo «ambient»: se mezclan con la música
// del alumno. Al rato sin efectos, el audio de efectos se duerme y Safari vuelve a su modo normal
// (así la voz y las notas maestras suenan como siempre).
type AudioSessionType = 'auto' | 'ambient' | 'playback' | 'transient' | 'transient-solo' | 'play-and-record'
const EFFECTS_IDLE_MS = 5000
let effectsIdleTimer: number | null = null

function setAudioSessionType(type: AudioSessionType): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: AudioSessionType } }).audioSession
    if (session && session.type !== type) session.type = type
  } catch {
    // Navegador sin Audio Session API (Android, ordenador): no hace falta.
  }
}

/** El contexto de los efectos, despierto y en modo «se mezcla con tu música». */
function effectsContext(): AudioContext | null {
  if (typeof window === 'undefined' || !isGameSoundEnabled()) return null
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtor) return null
  setAudioSessionType('ambient')
  audioContext = audioContext || new AudioCtor()
  if (audioContext.state === 'suspended') void audioContext.resume()
  if (effectsIdleTimer !== null) window.clearTimeout(effectsIdleTimer)
  effectsIdleTimer = window.setTimeout(() => {
    effectsIdleTimer = null
    const ctx = audioContext
    if (!ctx || ctx.state !== 'running') {
      setAudioSessionType('auto')
      return
    }
    void ctx
      .suspend()
      .catch(() => undefined)
      .finally(() => setAudioSessionType('auto'))
  }, EFFECTS_IDLE_MS)
  return audioContext
}

// SONIDO AL MOMENTO (Luis, 4 oct): el primer sonido (o el primero tras un rato sin sonar) tardaba,
// porque el audio del navegador estaba dormido y despertarlo lleva un momento. Ahora se despierta
// en cuanto el dedo toca la pantalla (pointerdown), antes del clic que hace sonar el efecto.
if (typeof window !== 'undefined') {
  const wake = () => {
    if (!isGameSoundEnabled()) return
    try {
      effectsContext()
    } catch {
      // Sin audio: no pasa nada.
    }
  }
  window.addEventListener('pointerdown', wake, { capture: true, passive: true })
  window.addEventListener('pointerdown', () => preloadSamples(), { capture: true, passive: true, once: true })
  window.addEventListener('keydown', wake, { capture: true })
}

// SOUND FILES (Luis, 5 Oct): the chest sounds are real recordings instead of synthesized tones.
// - chestUnlock: «B19» from the picker (react-sounds «success», MIT), shortened and quieter.
// - chestWaiting: «D04» (wood knocks from Kenney's City Builder starter kit, CC0).
// Each file is fetched and decoded once, then kept in memory.
const SAMPLE_URLS = {
  chestUnlock: '/sounds/cofre-abierto.mp3',
  chestWaiting: '/sounds/cofre-esperando.mp3',
} as const
type SampleName = keyof typeof SAMPLE_URLS
const sampleBuffers = new Map<SampleName, AudioBuffer>()
const sampleLoads = new Map<SampleName, Promise<AudioBuffer | null>>()

function loadSample(ctx: BaseAudioContext, name: SampleName): Promise<AudioBuffer | null> {
  const cached = sampleBuffers.get(name)
  if (cached) return Promise.resolve(cached)
  let load = sampleLoads.get(name)
  if (!load) {
    load = fetch(SAMPLE_URLS[name])
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        sampleBuffers.set(name, buffer)
        return buffer
      })
      .catch(() => {
        sampleLoads.delete(name)
        return null
      })
    sampleLoads.set(name, load)
  }
  return load
}

/** Downloads the sound files ahead of time (first touch), so the first play is not late. */
function preloadSamples(): void {
  if (typeof window === 'undefined' || !isGameSoundEnabled()) return
  try {
    const ctx = effectsContext()
    if (!ctx) return
    for (const name of Object.keys(SAMPLE_URLS) as SampleName[]) void loadSample(ctx, name)
  } catch {
    // No audio: nothing to preload.
  }
}

function playSample(name: SampleName, volume: number): void {
  try {
    const ctx = effectsContext()
    if (!ctx) return
    const play = (buffer: AudioBuffer | null) => {
      if (!buffer) return
      const source = ctx.createBufferSource()
      source.buffer = buffer
      const gain = ctx.createGain()
      gain.gain.value = volume
      source.connect(gain).connect(ctx.destination)
      source.start(ctx.currentTime + 0.005)
    }
    const cached = sampleBuffers.get(name)
    if (cached) play(cached)
    else void loadSample(ctx, name).then(play)
  } catch {
    // If the browser blocks audio, the game goes on silently.
  }
}

/** A single tone with a quick attack and a soft tail (same envelope as the sound picker). */
function shortTone(ctx: AudioContext, at: number, frequency: number, duration: number, type: OscillatorType, volume: number): void {
  const oscillator = ctx.createOscillator()
  oscillator.type = type
  oscillator.frequency.value = frequency
  const gain = ctx.createGain()
  const start = ctx.currentTime + at
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.05)
}

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
    if (!effectsContext() || !audioContext) return
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

/** Ruido corto filtrado (el «toc», el confeti…). */
function noiseBurst(ctx: AudioContext, at: number, duration: number, frequency: number, type: BiquadFilterType, volume: number): void {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  const gain = ctx.createGain()
  const start = ctx.currentTime + at
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start(start)
  source.stop(start + duration + 0.02)
}

/** Golpe sordo que baja de tono (el «toc» del paso bloqueado). */
function thump(ctx: AudioContext, at: number, from: number, to: number, duration: number, volume: number): void {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  const start = ctx.currentTime + at
  oscillator.frequency.setValueAtTime(from, start)
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.05)
}

function vibrate(pattern: number | number[]): void {
  try {
    if (navigator.vibrate?.(pattern)) return
  } catch {
    /* sigue con el truco del iPhone */
  }
  iosTick(Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1)
}

// iPhone: Safari no deja vibrar a las webs, pero desde iOS 18 tocar un interruptor
// (<input type="checkbox" switch>) da un toque suave. Se usa uno escondido.
let hiddenSwitch: HTMLLabelElement | null = null
function iosTick(times = 1): void {
  if (typeof document === 'undefined' || !/iP(hone|ad|od)/.test(navigator.userAgent)) return
  try {
    if (!hiddenSwitch) {
      const label = document.createElement('label')
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.setAttribute('switch', '')
      label.appendChild(input)
      label.setAttribute('aria-hidden', 'true')
      label.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none'
      document.body.appendChild(label)
      hiddenSwitch = label
    }
    const tick = hiddenSwitch
    tick.click()
    for (let index = 1; index < times; index += 1) window.setTimeout(() => tick.click(), index * 90)
  } catch {
    /* sin vibración */
  }
}

/** Toque suave al pulsar un botón (como Duolingo). Respeta el interruptor de sonido. */
export function hapticTap(): void {
  if (typeof window === 'undefined' || !isGameSoundEnabled()) return
  vibrate(12)
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
  /** The cycle chest unlocks (I·C·A finished): «something achieved» (B19). */
  chestUnlock() {
    playSample('chestUnlock', 0.8)
    vibrate([20, 30, 20])
  },
  /** The daily challenge unlocks, right after the chest: two beeps and a click (C3). */
  challengeUnlock() {
    const ctx = getAudioContext()
    if (!ctx) return
    noiseBurst(ctx, 0, 0.015, 3000, 'highpass', 0.2)
    shortTone(ctx, 0.02, 880, 0.08, 'square', 0.05)
    shortTone(ctx, 0.12, 1320, 0.14, 'square', 0.05)
  },
  /** The ready chest shakes while it waits to be opened: wooden knocks (D04). */
  chestWaiting() {
    playSample('chestWaiting', 1)
  },
  /** Una moneda llega al contador. */
  coin() {
    playTones([1319], 0.045, 'sine', 0.07)
  },
  /**
   * Pagar con ICA Coins en la tienda (Luis, 4 oct): unas monedas que caen y tintinean,
   * cada una un poco más baja y más flojita, con un «chas» de metal al principio.
   */
  spend() {
    const ctx = getAudioContext()
    if (!ctx) return
    vibrate([15, 40, 15])
    noiseBurst(ctx, 0, 0.05, 6500, 'highpass', 0.05)
    const clinks = [0, 0.07, 0.13, 0.2, 0.3]
    clinks.forEach((at, index) => {
      const start = ctx.currentTime + at + Math.random() * 0.015
      const base = 2400 - index * 140 + Math.random() * 80
      const volume = 0.09 * (1 - index * 0.14)
      // Dos parciales sin relación armónica: suena a metal, no a nota de piano.
      for (const [ratio, level, decay] of [[1, 1, 0.16], [2.76, 0.45, 0.08]] as const) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = base * ratio
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(volume * level, start + 0.003)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + decay)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start)
        osc.stop(start + decay + 0.02)
      }
    })
  },
  /** Confeti de una insignia nueva: un «pof» suave y crujidos muy bajitos. */
  confetti() {
    const ctx = getAudioContext()
    if (!ctx) return
    noiseBurst(ctx, 0, 0.09, 1400, 'bandpass', 0.1)
    for (let index = 0; index < 14; index += 1) {
      noiseBurst(ctx, 0.05 + Math.random() * 0.6, 0.018, 5000 + Math.random() * 3000, 'highpass', 0.02 + Math.random() * 0.025)
    }
  },
  /** Paso bloqueado (tocar Creación o Activación sin haber hecho lo anterior): «toc-toc» y vibra. */
  locked() {
    vibrate([30, 40, 30])
    const ctx = getAudioContext()
    if (!ctx) return
    noiseBurst(ctx, 0, 0.04, 900, 'bandpass', 0.25)
    thump(ctx, 0, 170, 85, 0.15, 0.45)
    noiseBurst(ctx, 0.14, 0.035, 800, 'bandpass', 0.18)
    thump(ctx, 0.14, 150, 80, 0.13, 0.3)
  },
  /**
   * Una estrella de la Leyenda cae sobre el aro: golpe seco y grave (todas igual).
   * `quiet`: en las que aún no tienes, más bajito. `last`: la última vibra un poco más.
   */
  legendStar(quiet = false, last = false) {
    const ctx = getAudioContext()
    if (!ctx) return
    playLegendStar(ctx, ctx.currentTime + 0.01, { quiet })
    if (!quiet) window.setTimeout(() => vibrate(last ? [35, 30, 60] : 30), LEGEND_STAR_FALL_MS)
  },
}


// ---------------------------------------------------------------------------
// Estrellas de la Leyenda: caen una a una sobre el aro
// ---------------------------------------------------------------------------

/** Lo que tarda una estrella en caer (la animación y el sonido van con este tiempo). */
export const LEGEND_STAR_FALL_MS = 220

/** Ruido blanco de la duración pedida (para el «fiuu» y el brillo). */
function noiseSource(ctx: BaseAudioContext, duration: number): AudioBufferSourceNode {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1
  const source = ctx.createBufferSource()
  source.buffer = buffer
  return source
}

/**
 * Salida de las estrellas: pasa por un limitador suave para que el golpe grave y el metal
 * juntos nunca saturen el altavoz. Uno por contexto.
 */
const starBuses = new WeakMap<BaseAudioContext, AudioNode>()
function starBus(ctx: BaseAudioContext): AudioNode {
  const existing = starBuses.get(ctx)
  if (existing) return existing
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -12
  limiter.knee.value = 6
  limiter.ratio.value = 12
  limiter.attack.value = 0.002
  limiter.release.value = 0.2
  limiter.connect(ctx.destination)
  starBuses.set(ctx, limiter)
  return limiter
}

/**
 * Sonido de una estrella de la Leyenda que empieza a caer en `start` (segundos del contexto).
 * Elegido por Luis (3 oct, opción «Caída con aire»): un soplo de aire que baja mientras cae y,
 * al tocar el aro, un golpe suave y grave con un clic corto. Igual en las tres estrellas.
 * Funciona con el audio normal y con OfflineAudioContext (para las muestras).
 */
export function playLegendStar(ctx: BaseAudioContext, start: number, { quiet = false }: { quiet?: boolean } = {}): void {
  const volume = quiet ? 0.4 : 1
  const land = start + LEGEND_STAR_FALL_MS / 1000
  const out = starBus(ctx)

  // La caída: aire que barre de agudo a grave y crece hasta el golpe.
  const air = noiseSource(ctx, LEGEND_STAR_FALL_MS / 1000 + 0.12)
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 1.3
  const from = land - 0.2
  band.frequency.setValueAtTime(3000, from)
  band.frequency.exponentialRampToValueAtTime(700, land)
  const airGain = ctx.createGain()
  airGain.gain.setValueAtTime(0.0001, from)
  airGain.gain.exponentialRampToValueAtTime(0.12 * volume, land - 0.01)
  airGain.gain.exponentialRampToValueAtTime(0.0001, land + 0.03)
  air.connect(band).connect(airGain).connect(out)
  air.start(from)
  air.stop(land + 0.08)

  // El golpe: grave y suave, con un pequeño bajón de tono.
  const body = ctx.createOscillator()
  const bodyGain = ctx.createGain()
  body.frequency.setValueAtTime(120, land)
  body.frequency.exponentialRampToValueAtTime(60, land + 0.15)
  bodyGain.gain.setValueAtTime(0.0001, land)
  bodyGain.gain.exponentialRampToValueAtTime(0.5 * volume, land + 0.003)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, land + 0.2)
  body.connect(bodyGain).connect(out)
  body.start(land)
  body.stop(land + 0.25)

  // El clic corto del choque (se oye en el altavoz del móvil).
  const click = noiseSource(ctx, 0.05)
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 1800
  const clickGain = ctx.createGain()
  clickGain.gain.setValueAtTime(0.0001, land)
  clickGain.gain.exponentialRampToValueAtTime(0.2 * volume, land + 0.002)
  clickGain.gain.exponentialRampToValueAtTime(0.0001, land + 0.02)
  click.connect(low).connect(clickGain).connect(out)
  click.start(land)
  click.stop(land + 0.05)
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
  return effectsContext()
}

/**
 * Suena la insignia que aparece (corto y alegre, más fiesta cuanto más alto el rango).
 * Devuelve una función para cortarlo. Respeta el interruptor de sonido.
 */
export function playBadgeSound(tier: BadgeSoundTier, options: { locked?: boolean; delay?: number } = {}): StopBadgeSound {
  try {
    const ctx = getAudioContext()
    if (!ctx) return noop
    if (!options.locked) vibrate(tier === 'leyenda' ? [20, 40, 20, 40, 90] : tier === 'diamante' || tier === 'rubi' ? [20, 40, 20, 40, 60] : tier === 'oro' ? [30, 40, 50] : 25)
    return playBadgeFanfare(ctx, tier, { locked: options.locked, delay: options.delay })
  } catch {
    return noop
  }
}
