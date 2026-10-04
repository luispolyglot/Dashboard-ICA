import { LANG_CODES } from '../constants'

/** How a call to speakNatural/speakLocal ended. `stopped` means stopTTS() (or a new call) cut it short. */
export type SpeakResult = { ok: boolean; stopped?: boolean }
type SpeakEnd = (result: SpeakResult) => void

/** If the Google audio has not started playing by then, switch to the device voice. */
const REMOTE_START_TIMEOUT_MS = 4000
/** If the device voice has not started by then, count the attempt as failed. */
const LOCAL_START_TIMEOUT_MS = 3000
/** Max wait for the device voice list to load (Chrome loads it asynchronously). */
const VOICES_WAIT_MS = 1500
/** Pause between cancel() and speak(): Chrome Android drops a speak() issued right after cancel(). */
const CANCEL_SETTLE_MS = 180
/** Pause before retrying a failed device-voice attempt. */
const RETRY_DELAY_MS = 300

let ttsAudio: HTMLAudioElement | null = null
// Keep a reference to the utterance: Chrome can garbage-collect it and never fire its events.
let currentUtterance: SpeechSynthesisUtterance | null = null
// Every speak call gets a session id; stopTTS() or a newer call makes older sessions stale.
let sessionId = 0
let pendingEnd: { id: number; onEnd?: SpeakEnd } | null = null
const pendingTimers = new Set<number>()

function isIOSLikeDevice(): boolean {
  const userAgent = window.navigator.userAgent
  const platform = window.navigator.platform
  const maxTouchPoints = window.navigator.maxTouchPoints || 0

  const isiPhoneOrIPad = /iPad|iPhone|iPod/.test(userAgent)
  const isIPadOSDesktopUA = platform === 'MacIntel' && maxTouchPoints > 1

  return isiPhoneOrIPad || isIPadOSDesktopUA
}

function later(fn: () => void, ms: number): number {
  const timer = window.setTimeout(() => {
    pendingTimers.delete(timer)
    fn()
  }, ms)
  pendingTimers.add(timer)
  return timer
}

function clearLater(timer: number): void {
  window.clearTimeout(timer)
  pendingTimers.delete(timer)
}

/** Starts a new speak session: stops whatever was playing and remembers who to tell when it ends. */
function beginSession(onEnd?: SpeakEnd): number {
  stopTTS()
  sessionId += 1
  pendingEnd = { id: sessionId, onEnd }
  return sessionId
}

/** Ends a session once. Stale sessions (stopped or replaced) are ignored. */
function endSession(id: number, result: SpeakResult): void {
  if (!pendingEnd || pendingEnd.id !== id) return
  const { onEnd } = pendingEnd
  pendingEnd = null
  onEnd?.(result)
}

const isCurrent = (id: number) => pendingEnd?.id === id

export function stopTTS(): void {
  pendingTimers.forEach((timer) => window.clearTimeout(timer))
  pendingTimers.clear()
  if (ttsAudio) {
    const audio = ttsAudio
    ttsAudio = null
    audio.onplaying = null
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
  }
  currentUtterance = null
  if (window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
    window.speechSynthesis.cancel()
  }
  // Stopping is not a failure: tell whoever was waiting that it finished.
  if (pendingEnd) {
    const { onEnd } = pendingEnd
    pendingEnd = null
    onEnd?.({ ok: true, stopped: true })
  }
}

function getBestVoice(
  langCode: string,
  options?: { preferLocalService?: boolean },
): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const lang = langCode.split('-')[0]
  const matching = voices.filter((v) => v.lang.replace('_', '-').startsWith(lang))
  if (!matching.length) return null
  if (options?.preferLocalService) {
    const exactLocal = matching.find((v) => v.lang === langCode && v.localService)
    if (exactLocal) return exactLocal
    const local = matching.find((v) => v.localService)
    if (local) return local
  }
  const premiumRe = /Natural|Premium|Enhanced|Neural|Online|Google|Wavenet/i
  const best = matching.find((v) => premiumRe.test(v.name))
  if (best) return best
  const remote = matching.find((v) => !v.localService)
  if (remote) return remote
  return matching.find((v) => v.lang === langCode) || matching[0]
}

/** Resolves once the device voice list is available (or after a short wait if it never loads). */
function waitForVoices(): Promise<void> {
  const synth = window.speechSynthesis
  if (!synth || synth.getVoices().length > 0) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      synth.removeEventListener?.('voiceschanged', finish)
      resolve()
    }
    synth.addEventListener?.('voiceschanged', finish)
    window.setTimeout(finish, VOICES_WAIT_MS)
  })
}

/**
 * Speaks with the device voice. Waits for the voices to load, never calls speak() right after
 * cancel(), retries once if the voice fails to start, and reports the outcome to `endSession`.
 */
function speakWithDeviceVoice(id: number, text: string, langCode: string, rate: number): void {
  const synth = window.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    endSession(id, { ok: false })
    return
  }

  const isIOS = isIOSLikeDevice()
  const normalizedRate = Math.min(1.25, Math.max(0.5, rate))
  const utteranceRate = isIOS && normalizedRate < 1 ? Math.max(0.45, normalizedRate - 0.2) : normalizedRate

  const attempt = (tryNumber: number) => {
    if (!isCurrent(id)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = langCode
    u.rate = utteranceRate
    u.pitch = 1
    const voice = getBestVoice(langCode, { preferLocalService: isIOS })
    if (voice) u.voice = voice
    currentUtterance = u

    let started = false
    let settled = false
    let startTimer = 0
    let maxTimer = 0

    const settle = (ok: boolean) => {
      if (settled) return
      settled = true
      clearLater(startTimer)
      clearLater(maxTimer)
      if (currentUtterance === u) currentUtterance = null
      if (!isCurrent(id)) return
      if (ok) {
        endSession(id, { ok: true })
      } else if (tryNumber === 0) {
        // One more try, after letting the speech engine settle.
        if (synth.speaking || synth.pending) synth.cancel()
        later(() => attempt(1), RETRY_DELAY_MS)
      } else {
        endSession(id, { ok: false })
      }
    }

    u.onstart = () => {
      started = true
      clearLater(startTimer)
      // Safety net in case onend never arrives.
      maxTimer = later(() => settle(true), Math.max(4000, Math.min(20000, text.length * 160)))
    }
    // Ending without ever starting is the Chrome Android failure: treat it as an error.
    u.onend = () => settle(started)
    u.onerror = (event) => {
      // 'interrupted' / 'canceled' after we moved on is a stop, not a failure.
      if (!isCurrent(id)) return
      settle(started && event.error !== 'synthesis-failed' && event.error !== 'audio-busy')
    }
    startTimer = later(() => {
      if (!started) settle(false)
    }, LOCAL_START_TIMEOUT_MS)

    if (synth.paused) synth.resume()
    synth.speak(u)
  }

  void waitForVoices().then(() => {
    if (!isCurrent(id)) return
    if (synth.speaking || synth.pending) {
      synth.cancel()
      later(() => attempt(0), CANCEL_SETTLE_MS)
    } else {
      attempt(0)
    }
  })
}

/**
 * Speaks `text`: first the Google voice (more natural); if it fails or does not start within a few
 * seconds, the device voice. `onEnd` gets `{ ok: false }` only when nothing could be played.
 */
export function speakNatural(
  text: string,
  langName: string,
  onEnd?: SpeakEnd,
  rate = 1,
): void {
  const id = beginSession(onEnd)
  const code = LANG_CODES[langName] || 'en-US'

  if (isIOSLikeDevice()) {
    speakWithDeviceVoice(id, text, code, rate)
    return
  }

  const lang = code.split('-')[0]
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`
  const audio = new Audio(url)
  audio.playbackRate = Math.min(1.25, Math.max(0.5, rate))
  ttsAudio = audio
  let started = false
  let switched = false

  const useDeviceVoice = () => {
    if (switched || !isCurrent(id)) return
    switched = true
    clearLater(startTimer)
    if (ttsAudio === audio) ttsAudio = null
    audio.onplaying = null
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
    speakWithDeviceVoice(id, text, code, rate)
  }

  const startTimer = later(() => {
    if (!started) useDeviceVoice()
  }, REMOTE_START_TIMEOUT_MS)

  audio.onplaying = () => {
    started = true
    clearLater(startTimer)
  }
  audio.onended = () => {
    if (ttsAudio === audio) ttsAudio = null
    endSession(id, { ok: true })
  }
  audio.onerror = () => {
    if (started || audio.currentTime > 0) {
      if (ttsAudio === audio) ttsAudio = null
      endSession(id, { ok: true })
      return
    }
    useDeviceVoice()
  }
  audio.play().catch(() => {
    if (!started) useDeviceVoice()
  })
}

/** Device voice only. */
export function speakLocal(
  text: string,
  langName: string,
  onEnd?: SpeakEnd,
  rate = 1,
): void {
  const id = beginSession(onEnd)
  const code = LANG_CODES[langName] || 'en-US'
  speakWithDeviceVoice(id, text, code, rate)
}
