// SOUND SESSION ON IPHONE (Luis, 11 Oct). Safari has `navigator.audioSession.type`:
//  - «ambient»: mixes with the student's music, but stops when the phone locks or the app is left;
//  - «playback»: normal media, keeps playing locked and in the background.
// The game effects switch to «ambient» on every tap (so Spotify keeps playing). While «Escuchar mis
// palabras» plays, the session is held on «playback» and nobody may change it, so the words keep
// sounding with the phone locked or outside the app. Other browsers have no such API: no effect.

type AudioSessionType = 'auto' | 'ambient' | 'playback' | 'transient' | 'transient-solo' | 'play-and-record'
type AudioSessionLike = { type: AudioSessionType }

const HOLD_KEY = '__icaMediaSessionHolds'
const MIC_KEY = '__icaMicrophoneUses'
const store = globalThis as typeof globalThis & { [HOLD_KEY]?: number; [MIC_KEY]?: number }

function session(): AudioSessionLike | undefined {
  try {
    return (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession
  } catch {
    return undefined
  }
}

/** Whether a long audio (Escuchar mis palabras) holds the session on «playback». */
export function mediaSessionHeld(): boolean {
  return (store[HOLD_KEY] ?? 0) > 0
}

/** Whether the microphone is in use (recording or voice recognition). */
export function micInUse(): boolean {
  return (store[MIC_KEY] ?? 0) > 0
}

/**
 * MICROPHONE ON IPHONE (Luis, 12 Oct, launch): with the session on «ambient» (set by every tap of
 * the game effects) or «playback», Safari refuses to open the microphone: «No se pudo iniciar la
 * grabación» when activating a phrase. While the microphone is in use the session stays on «auto»
 * (what production always had) and nobody may change it. Call it before opening the microphone and
 * call the returned function (once is enough) when it closes.
 */
export function beginMicUse(): () => void {
  store[MIC_KEY] = (store[MIC_KEY] ?? 0) + 1
  const current = session()
  try {
    if (current && current.type !== 'auto') current.type = 'auto'
  } catch {
    // Not allowed here: nothing to do.
  }
  let released = false
  return () => {
    if (released) return
    released = true
    store[MIC_KEY] = Math.max(0, (store[MIC_KEY] ?? 1) - 1)
    if (!micInUse() && mediaSessionHeld()) {
      const now = session()
      try {
        if (now) now.type = 'playback'
      } catch {
        // Not allowed here: nothing to do.
      }
    }
  }
}

/** Changes the session type, unless a long audio or the microphone holds it. */
export function setAudioSessionType(type: AudioSessionType): void {
  if (mediaSessionHeld() || micInUse()) return
  const current = session()
  try {
    if (current && current.type !== type) current.type = type
  } catch {
    // Not allowed here: nothing to do.
  }
}

/** Holds the session on «playback» until the returned function is called (once). */
export function holdMediaSession(): () => void {
  store[HOLD_KEY] = (store[HOLD_KEY] ?? 0) + 1
  const current = session()
  try {
    if (current && !micInUse()) current.type = 'playback'
  } catch {
    // Not allowed here: nothing to do.
  }
  let released = false
  return () => {
    if (released) return
    released = true
    store[HOLD_KEY] = Math.max(0, (store[HOLD_KEY] ?? 1) - 1)
    if (!mediaSessionHeld()) setAudioSessionType('auto')
  }
}

/**
 * Holds «playback» while this audio element plays (master notes): released on pause, end or error,
 * held again when it plays, also from the lock screen. Call it once per element.
 */
export function holdWhilePlaying(audio: HTMLAudioElement): void {
  if (typeof audio.addEventListener !== 'function') return
  let release: (() => void) | null = null
  const hold = () => {
    if (!release) release = holdMediaSession()
  }
  const letGo = () => {
    release?.()
    release = null
  }
  audio.addEventListener('playing', hold)
  audio.addEventListener('pause', letGo)
  audio.addEventListener('ended', letGo)
  audio.addEventListener('error', letGo)
  audio.addEventListener('emptied', letGo)
}
