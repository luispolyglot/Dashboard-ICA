// SONIDOS DE LAS INSIGNIAS (sin archivos: se generan en el navegador con Web Audio).
//
// Pedido de Luis (1 oct 2026, noche): nada de melodías; un «whoosh» o «swish» muy suave,
// como el aire que hace la insignia al aparecer. Cada rango va un poco más lejos:
//   bronce: un swish corto · plata: un swish algo más largo y brillante · oro: un whoosh
//   con un brillo muy bajito al final · rubí: whoosh más largo con dos brillos · diamante:
//   whoosh de ida y vuelta con un acorde de brillo casi en susurro.
//
// Hay tres «packs» para escuchar en la página de sonidos; la app usa BADGE_SOUND_PACK.
// Este archivo no importa nada de la app: así también lo usa esa página.

export type BadgeTier = 'bronce' | 'plata' | 'oro' | 'rubi' | 'diamante'
export type BadgeSoundPack = 'whoosh' | 'aire' | 'swish'

/** Pack que suena en la app. */
export const BADGE_SOUND_PACK: BadgeSoundPack = 'whoosh'

const midi = (note: number) => 440 * Math.pow(2, (note - 69) / 12)

let noiseBuffer: AudioBuffer | null = null

/** Ruido «rosa» (más suave que el blanco): la materia del whoosh. */
function softNoise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer
  const length = Math.floor(ctx.sampleRate * 2)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
    b6 = white * 0.115926
  }
  noiseBuffer = buffer
  return buffer
}

/**
 * Un golpe de aire: ruido filtrado cuya frecuencia sube (o baja) mientras cruza de un lado a otro.
 * `from`/`to`: frecuencia del filtro en Hz. `peak`: dónde está lo más fuerte (0-1).
 */
function air(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  options: { duration: number; from: number; to: number; volume: number; peak?: number; pan?: [number, number]; q?: number },
) {
  const { duration, from, to, volume } = options
  const peak = options.peak ?? 0.6
  const source = ctx.createBufferSource()
  source.buffer = softNoise(ctx)
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = options.q ?? 0.9
  band.frequency.setValueAtTime(from, at)
  band.frequency.exponentialRampToValueAtTime(to, at + duration)
  const soft = ctx.createBiquadFilter()
  soft.type = 'lowpass'
  soft.frequency.value = 7000
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(volume, at + duration * peak)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  let chain: AudioNode = gain
  if (options.pan && 'createStereoPanner' in ctx) {
    const panner = ctx.createStereoPanner()
    panner.pan.setValueAtTime(options.pan[0], at)
    panner.pan.linearRampToValueAtTime(options.pan[1], at + duration)
    gain.connect(panner)
    chain = panner
  }
  source.connect(band).connect(soft).connect(gain)
  chain.connect(out)
  source.start(at, Math.random() * 0.8)
  source.stop(at + duration + 0.05)
}

/** Brillo casi en susurro: una nota aguda con ataque suave. */
function glint(ctx: BaseAudioContext, out: AudioNode, at: number, note: number, volume: number, decay = 0.9) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = midi(note)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03 + decay)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + decay + 0.1)
}

type Event =
  | { kind: 'air'; at: number; duration: number; from: number; to: number; volume: number; peak?: number; pan?: [number, number] }
  | { kind: 'glint'; at: number; note: number; volume: number; decay?: number }

/** Segundos desde que empieza el sonido hasta su golpe de aire más fuerte (pack «whoosh»). */
export function badgeWhooshPeak(tier: BadgeTier): number {
  const first = SCORES[tier].find((event) => event.kind === 'air')
  return first && first.kind === 'air' ? first.at + first.duration * (first.peak ?? 0.6) : 0
}

/** Lo que suena en cada rango, en el pack «whoosh» (los otros packs lo transforman). */
const SCORES: Record<BadgeTier, Event[]> = {
  bronce: [{ kind: 'air', at: 0, duration: 0.22, from: 900, to: 2600, volume: 0.5, pan: [-0.3, 0.3] }],
  plata: [{ kind: 'air', at: 0, duration: 0.3, from: 1100, to: 3800, volume: 0.55, pan: [-0.4, 0.4] }],
  oro: [
    { kind: 'air', at: 0, duration: 0.45, from: 500, to: 3200, volume: 0.6, peak: 0.7, pan: [-0.5, 0.5] },
    { kind: 'glint', at: 0.34, note: 96, volume: 0.035 },
  ],
  rubi: [
    { kind: 'air', at: 0, duration: 0.6, from: 400, to: 3600, volume: 0.6, peak: 0.7, pan: [-0.6, 0.6] },
    { kind: 'glint', at: 0.46, note: 96, volume: 0.035 },
    { kind: 'glint', at: 0.56, note: 100, volume: 0.03 },
  ],
  diamante: [
    { kind: 'air', at: 0, duration: 0.5, from: 350, to: 3000, volume: 0.55, peak: 0.75, pan: [-0.6, 0.4] },
    { kind: 'air', at: 0.42, duration: 0.35, from: 4200, to: 1500, volume: 0.35, peak: 0.25, pan: [0.4, -0.2] },
    { kind: 'glint', at: 0.4, note: 96, volume: 0.03, decay: 1.2 },
    { kind: 'glint', at: 0.48, note: 100, volume: 0.028, decay: 1.2 },
    { kind: 'glint', at: 0.56, note: 103, volume: 0.026, decay: 1.3 },
  ],
}

function transform(events: Event[], pack: BadgeSoundPack): Event[] {
  if (pack === 'aire') return events.filter((event) => event.kind === 'air')
  if (pack === 'swish') {
    // Más corto y más agudo: un «fiu» rápido; sin brillos.
    return events
      .filter((event) => event.kind === 'air')
      .map((event) =>
        event.kind === 'air'
          ? { ...event, at: event.at * 0.7, duration: event.duration * 0.6, from: event.from * 1.8, to: event.to * 1.6, peak: 0.45 }
          : event,
      )
  }
  return events
}

let reverbBuffer: AudioBuffer | null = null
function reverb(ctx: BaseAudioContext): AudioBuffer {
  if (reverbBuffer && reverbBuffer.sampleRate === ctx.sampleRate) return reverbBuffer
  const length = Math.floor(ctx.sampleRate * 1.4)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4)
  }
  reverbBuffer = buffer
  return buffer
}

/**
 * Hace sonar la insignia. `locked`: las que aún no tienes suenan más bajo y apagadas.
 * Devuelve una función para cortarlo (con un fundido corto).
 */
export function playBadgeFanfare(
  ctx: BaseAudioContext,
  tier: BadgeTier,
  /** `delay`: segundos hasta que empieza (para cuadrarlo con el giro de la insignia). */
  options: { pack?: BadgeSoundPack; locked?: boolean; volume?: number; delay?: number } = {},
): () => void {
  const pack = options.pack ?? BADGE_SOUND_PACK
  const locked = Boolean(options.locked)
  const master = ctx.createGain()
  // 1.8 ≈ picos de -18 dB: suave, pero se oye en el altavoz del móvil (con 0.6 apenas se oía).
  master.gain.value = (options.volume ?? 1.8) * (locked ? 0.5 : 1)
  master.connect(ctx.destination)
  let head: AudioNode = master
  if (locked) {
    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 1500
    lowpass.connect(master)
    head = lowpass
  }
  const bus = ctx.createGain()
  bus.connect(head)
  const send = ctx.createGain()
  send.gain.value = 0.22
  const convolver = ctx.createConvolver()
  convolver.buffer = reverb(ctx)
  bus.connect(send).connect(convolver).connect(head)

  const start = ctx.currentTime + 0.02 + Math.max(0, options.delay ?? 0)
  for (const event of transform(SCORES[tier], pack)) {
    if (event.kind === 'air') air(ctx, bus, start + event.at, event)
    else if (!locked) glint(ctx, bus, start + event.at, event.note, event.volume, event.decay)
  }

  return () => {
    try {
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(0, now + 0.15)
    } catch {
      // Ya había terminado.
    }
  }
}
