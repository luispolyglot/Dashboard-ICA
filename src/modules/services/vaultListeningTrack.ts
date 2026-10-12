// ESCUCHAR MI BAÚL ICA CON EL MÓVIL BLOQUEADO (Luis, 11 Oct): like the master notes, the words are
// played as ONE audio file (word in your language, pause, word in the one you learn, pause…), built
// in the phone from the premium voice audios. A single file keeps playing with the screen off and
// when the student leaves the app; a chain of short audios with timers in between would stop.

export type TrackPhase = 'native' | 'target'
export type TrackSegment = { word: number; phase: TrackPhase; start: number; end: number }
export type ListeningTrack = { url: string; segments: TrackSegment[]; duration: number }

const SAMPLE_RATE = 24000

/**
 * Where each clip goes in the track (seconds): clip, pause, clip, pause… Clips come in pairs per
 * word (your language, then the one you learn).
 */
export function layoutTrack(clipSeconds: number[], pauseSeconds: number): { segments: TrackSegment[]; duration: number } {
  const segments: TrackSegment[] = []
  let cursor = 0
  clipSeconds.forEach((length, clip) => {
    segments.push({ word: Math.floor(clip / 2), phase: clip % 2 === 0 ? 'native' : 'target', start: cursor, end: cursor + length })
    cursor += length + pauseSeconds
  })
  return { segments, duration: cursor }
}

/** The segment playing at `time` (during a pause, the one just before it). */
export function segmentAt(segments: TrackSegment[], time: number): TrackSegment | null {
  let found: TrackSegment | null = null
  for (const segment of segments) {
    if (segment.start > time) break
    found = segment
  }
  return found
}

/** Mono 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/** A short silent audio, to unlock the player inside the tap (phones only allow sound after a tap). */
export function silentAudioUrl(): string {
  return URL.createObjectURL(encodeWav(new Float32Array(SAMPLE_RATE / 10), SAMPLE_RATE))
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext

function createContext(): AudioContext | null {
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  if (!Ctor) return null
  try {
    return new Ctor({ sampleRate: SAMPLE_RATE })
  } catch {
    // Older Safari: no sample rate option.
    return new Ctor()
  }
}

/**
 * Joins the clips (already prepared, as blob URLs; in pairs per word: your language, then the one
 * you learn) into one WAV with a pause after each. Null if the phone cannot decode them.
 */
export async function joinClips(clipUrls: string[], pauseMs: number): Promise<ListeningTrack | null> {
  if (clipUrls.length === 0) return null
  const context = createContext()
  if (!context) return null
  try {
    const decoded: Float32Array[] = []
    for (const url of clipUrls) {
      const bytes = await (await fetch(url)).arrayBuffer()
      const audio = await context.decodeAudioData(bytes)
      const mono = new Float32Array(audio.length)
      for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
        const data = audio.getChannelData(channel)
        for (let index = 0; index < data.length; index += 1) mono[index] += data[index] / audio.numberOfChannels
      }
      decoded.push(mono)
    }
    const rate = context.sampleRate
    const pauseSamples = Math.round((pauseMs / 1000) * rate)
    const { segments, duration } = layoutTrack(
      decoded.map((clip) => clip.length / rate),
      pauseSamples / rate,
    )
    const samples = new Float32Array(decoded.reduce((sum, clip) => sum + clip.length + pauseSamples, 0))
    let offset = 0
    for (const clip of decoded) {
      samples.set(clip, offset)
      offset += clip.length + pauseSamples
    }
    return { url: URL.createObjectURL(encodeWav(samples, rate)), segments, duration }
  } catch {
    return null
  } finally {
    void context.close().catch(() => undefined)
  }
}
