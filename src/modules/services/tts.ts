import { LANG_CODES } from '../constants'
import { supabase } from '@/lib/supabase'

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

// ---------------------------------------------------------------------------
// PREMIUM VOICE (Luis, 5 Oct): Gemini 3.8 Flash-Lite TTS.
// Every text is generated once and then reused (cached by the server and, during the visit, here).
// The local copy (`pnpm dev`) asks its own Vite plugin at /__ica/tts (key in .env.local).
// Development and production ask the premium-tts Edge Function (key in the GEMINI_API_KEY secret).
// Without a key, both answer 404 and everything works as before with the old voices.
// ---------------------------------------------------------------------------

const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY
const PREMIUM_TTS_ENDPOINT: string | null = import.meta.env.DEV
  ? '/__ica/tts'
  : SUPABASE_URL && SUPABASE_ANON_KEY
    ? `${SUPABASE_URL}/functions/v1/premium-tts`
    : null

/** The Edge Function needs the student's session; the local plugin does not. */
async function premiumHeaders(): Promise<Record<string, string> | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (import.meta.env.DEV) return headers
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
  const token = data.session?.access_token
  if (!token || !SUPABASE_ANON_KEY) return null
  headers.Authorization = `Bearer ${token}`
  headers.apikey = SUPABASE_ANON_KEY
  return headers
}
/** If the premium audio is not ready by then, use the old voices. */
const PREMIUM_FETCH_TIMEOUT_MS = 9000
/** A few silent samples: playing them inside the tap «unlocks» the audio element on iPhone. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

/** null = unknown yet, false = the server has no premium voice (no key): stop asking. */
let premiumAvailable: boolean | null = null
let premiumAudio: HTMLAudioElement | null = null
let premiumUnlocked = false
const premiumCache = new Map<string, Promise<string | null>>()

function fetchPremiumAudio(text: string, langCode: string): Promise<string | null> {
  const key = `${langCode}|${text}`
  const cached = premiumCache.get(key)
  if (cached) return cached
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PREMIUM_FETCH_TIMEOUT_MS)
  const load = premiumHeaders()
    .then((headers) => {
      if (!headers) return null
      return fetch(PREMIUM_TTS_ENDPOINT as string, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, lang: langCode }),
        signal: controller.signal,
      })
    })
    .then(async (response) => {
      if (!response) return null
      // 404 = no key on the server; 429 = this student's daily limit of new audios. Either way,
      // use the old voices for the rest of this visit instead of asking on every tap.
      if (response.status === 404 || response.status === 429) {
        premiumAvailable = false
        return null
      }
      if (!response.ok) return null
      premiumAvailable = true
      return URL.createObjectURL(await response.blob())
    })
    .catch(() => null)
    .finally(() => window.clearTimeout(timer))
    .then((url) => {
      // Failures are not cached: the next tap tries again.
      if (!url) premiumCache.delete(key)
      return url
    })
  premiumCache.set(key, load)
  return load
}

/**
 * Prepares the premium audio of a text ahead of time, without playing it, so that tapping
 * «Listen» later is instant. Does nothing where there is no premium voice. Never fails.
 */
export function prefetchSpeech(text: string, langName: string): Promise<void> {
  if (!PREMIUM_TTS_ENDPOINT || premiumAvailable === false || !text.trim()) return Promise.resolve()
  const code = LANG_CODES[langName] || 'en-US'
  return fetchPremiumAudio(text, code).then(() => undefined)
}

/**
 * Prepares many texts in order, a few at a time (the first ones are ready first).
 * Returns one promise per text, resolved when that text is ready (or failed).
 */
export function prefetchSpeechQueue(
  items: Array<{ text: string; langName: string }>,
  concurrency = 3,
): Promise<void>[] {
  const resolvers: Array<() => void> = []
  const promises = items.map(() => new Promise<void>((resolve) => resolvers.push(resolve)))
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const position = next
      next += 1
      await prefetchSpeech(items[position].text, items[position].langName)
      resolvers[position]()
    }
  }
  for (let count = 0; count < Math.max(1, concurrency); count += 1) void worker()
  return promises
}

/** The voice should sound like any other media (not mixed like the game effects). */
function useMediaAudioSession(): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session && session.type === 'ambient') session.type = 'auto'
  } catch {
    // No Audio Session API: nothing to do.
  }
}

function speakWithPremiumVoice(id: number, text: string, langCode: string, rate: number): void {
  premiumAudio = premiumAudio || new Audio()
  const audio = premiumAudio
  // iPhone only lets an audio element play later (after the download) if it already played inside a tap.
  if (!premiumUnlocked) {
    premiumUnlocked = true
    audio.src = SILENT_WAV
    void audio.play().catch(() => undefined)
  }
  const useOldVoices = () => {
    if (!isCurrent(id)) return
    if (ttsAudio === audio) ttsAudio = null
    audio.onended = null
    audio.onerror = null
    speakWithoutPremium(id, text, langCode, rate)
  }
  void fetchPremiumAudio(text, langCode).then((url) => {
    if (!isCurrent(id)) return
    if (!url) {
      useOldVoices()
      return
    }
    useMediaAudioSession()
    ttsAudio = audio
    audio.onplaying = null
    audio.onended = () => {
      if (ttsAudio === audio) ttsAudio = null
      endSession(id, { ok: true })
    }
    audio.onerror = useOldVoices
    audio.src = url
    // A new src resets the speed: set it after.
    const speed = Math.min(1.25, Math.max(0.5, rate))
    audio.defaultPlaybackRate = speed
    audio.playbackRate = speed
    audio.play().catch(useOldVoices)
  })
}

/**
 * Speaks `text`: first the premium voice (Gemini, where available), then the Google voice; if that
 * fails or does not start within a few seconds, the device voice. `onEnd` gets `{ ok: false }` only
 * when nothing could be played.
 */
export function speakNatural(
  text: string,
  langName: string,
  onEnd?: SpeakEnd,
  rate = 1,
): void {
  const id = beginSession(onEnd)
  const code = LANG_CODES[langName] || 'en-US'
  if (PREMIUM_TTS_ENDPOINT && premiumAvailable !== false && text.trim()) {
    speakWithPremiumVoice(id, text, code, rate)
    return
  }
  speakWithoutPremium(id, text, code, rate)
}

/** The voices from before the premium one: Google Translate, or the device voice on iPhone. */
function speakWithoutPremium(id: number, text: string, code: string, rate: number): void {
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
