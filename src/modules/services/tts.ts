import { LANG_CODES } from '../constants'
import { supabase } from '@/lib/supabase'
import { mediaSessionHeld, micInUse } from './audioSession'

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
  stopWebAudioSpeech()
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
/** If the premium audio of a tap is not ready by then, use the old voices. */
const PREMIUM_FETCH_TIMEOUT_MS = 9000
/** Audios prepared ahead (prefetch, Escuchar mi Baúl) can wait longer: nobody is waiting on a tap. */
const PREMIUM_BACKGROUND_TIMEOUT_MS = 45000
/** A few silent samples: playing them inside the tap «unlocks» the audio element on iPhone. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

/** null = unknown yet, false = the server has no premium voice (no key): stop asking. */
let premiumAvailable: boolean | null = null
/**
 * Until when (ms) Google lets the premium voice make no more NEW audios today (Luis, 11 Oct: 100 a
 * day per model). The ones already made keep coming from the server's cache.
 */
let premiumDayLimitUntil = 0
let premiumAudio: HTMLAudioElement | null = null
let premiumUnlocked = false
const premiumCache = new Map<string, Promise<string | null>>()

// ---------------------------------------------------------------------------
// ONE QUEUE FOR THE PREMIUM VOICE (Luis, 11 Oct). Gemini only accepts a few new audios per minute
// for this project; when a screen asked for 70 at once (a list of words, Escuchar mi Baúl) most
// failed with «429 too many requests» and the app switched to the old robotic voices, even for the
// phrases. Now:
//  - a tap («now») goes out at once;
//  - everything prepared ahead waits in a queue, at most four at a time ('bulk' before 'prefetch');
//  - a «busy» answer (Gemini's limit) is tried again after a pause instead of giving up, and it
//    never turns the premium voice off for the visit (only «no key» or the daily limit do);
//  - at most PREFETCH_QUEUE_MAX prefetches wait: the rest are asked for when tapped.
// ---------------------------------------------------------------------------

export type VoicePriority = 'now' | 'bulk' | 'prefetch'

const PRIORITY_ORDER: Record<VoicePriority, number> = { now: 0, bulk: 1, prefetch: 2 }
const BACKGROUND_CONCURRENCY = 4
const PREFETCH_QUEUE_MAX = 24
/** Tries for an audio prepared ahead when the voice server is busy (with growing pauses). */
const BACKGROUND_TRIES = 5

type VoiceJob = {
  key: string
  priority: number
  seq: number
  /** `holdsSlot`: started by the queue (frees its slot at the end). `asTap`: one quick try only. */
  start: (holdsSlot: boolean, asTap: boolean) => void
  drop: () => void
}

const voiceQueue: VoiceJob[] = []
let voiceActive = 0
let voiceSeq = 0

function pumpVoiceQueue(): void {
  while (voiceActive < BACKGROUND_CONCURRENCY && voiceQueue.length > 0) {
    voiceQueue.sort((a, b) => a.priority - b.priority || a.seq - b.seq)
    const job = voiceQueue.shift() as VoiceJob
    voiceActive += 1
    job.start(true, false)
  }
}

function releaseVoiceSlot(): void {
  voiceActive = Math.max(0, voiceActive - 1)
  pumpVoiceQueue()
}

/** A queued job asked again with more priority (a tap on a word that was being prefetched). */
function promoteVoiceJob(key: string, priority: VoicePriority): void {
  const job = voiceQueue.find((item) => item.key === key)
  if (!job) return
  if (priority === 'now') {
    voiceQueue.splice(voiceQueue.indexOf(job), 1)
    job.start(false, true)
    return
  }
  job.priority = Math.min(job.priority, PRIORITY_ORDER[priority])
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** `failed`: the server tried and could not make it (not just busy): worth only one more try. */
type FetchOutcome = { url: string | null; retryAfterMs: number | null; failed?: boolean }

/** One request to the voice server. `retryAfterMs` is set when the server was only busy. */
async function requestPremiumAudio(text: string, langCode: string, timeoutMs: number): Promise<FetchOutcome> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = await premiumHeaders()
    if (!headers) return { url: null, retryAfterMs: null }
    const response = await fetch(PREMIUM_TTS_ENDPOINT as string, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, lang: langCode }),
      signal: controller.signal,
    })
    // 404 = no key on the server: use the old voices for the rest of this visit.
    if (response.status === 404) {
      premiumAvailable = false
      return { url: null, retryAfterMs: null }
    }
    // 429 = this student's daily limit of NEW audios. The ones already made keep coming from the
    // server's cache, so the voice is not switched off: only new ones are not retried for a while.
    if (response.status === 429) {
      premiumDayLimitUntil = Date.now() + 30 * 60_000
      return { url: null, retryAfterMs: null }
    }
    if (!response.ok) {
      // 503 (busy) / 502 (failed) / 5xx: worth trying again a bit later.
      const body = (await response.json().catch(() => null)) as { code?: unknown; retryAfter?: unknown } | null
      const seconds = Number(body?.retryAfter)
      if (body?.code === 'VOICE_DAY_LIMIT') {
        // No new audios until tomorrow: retrying would not help.
        premiumDayLimitUntil = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 3_600_000)
        return { url: null, retryAfterMs: null }
      }
      return {
        url: null,
        retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 3000,
        failed: body?.code === 'VOICE_FAILED',
      }
    }
    premiumAvailable = true
    return { url: URL.createObjectURL(await response.blob()), retryAfterMs: null }
  } catch {
    // Timeout or no connection.
    return { url: null, retryAfterMs: 3000 }
  } finally {
    window.clearTimeout(timer)
  }
}

function fetchPremiumAudio(text: string, langCode: string, priority: VoicePriority = 'now'): Promise<string | null> {
  const key = `${langCode}|${text}`
  const cached = premiumCache.get(key)
  if (cached) {
    promoteVoiceJob(key, priority)
    return cached
  }

  const load = new Promise<string | null>((resolve) => {
    const finish = (url: string | null) => {
      // Failures are not cached: the next tap tries again.
      if (!url) premiumCache.delete(key)
      resolve(url)
    }

    const runTap = async (): Promise<string | null> => {
      const first = await requestPremiumAudio(text, langCode, PREMIUM_FETCH_TIMEOUT_MS)
      if (first.url || first.retryAfterMs === null || first.retryAfterMs > 2500) return first.url
      // Busy for a moment: one more try, still within the time a tap can wait.
      await sleep(first.retryAfterMs)
      return (await requestPremiumAudio(text, langCode, PREMIUM_FETCH_TIMEOUT_MS)).url
    }

    const runBackground = async (): Promise<string | null> => {
      let pause = 2000
      let failures = 0
      for (let attempt = 1; attempt <= BACKGROUND_TRIES; attempt += 1) {
        if (premiumAvailable === false) return null
        const outcome = await requestPremiumAudio(text, langCode, PREMIUM_BACKGROUND_TIMEOUT_MS)
        if (outcome.url || outcome.retryAfterMs === null) return outcome.url
        // A text the voice could not make twice is left out (it does not hold a slot for long).
        if (outcome.failed && (failures += 1) >= 2) return null
        if (attempt === BACKGROUND_TRIES) return null
        // While this job waits it keeps its place: the queue slows down with the server.
        await sleep(Math.min(30000, Math.max(outcome.retryAfterMs, pause)))
        pause *= 2
      }
      return null
    }

    let started = false
    const run = (holdsSlot: boolean, asTap: boolean) => {
      if (started) return
      started = true
      void (asTap ? runTap() : runBackground())
        .then(finish, () => finish(null))
        .finally(() => {
          if (holdsSlot) releaseVoiceSlot()
        })
    }

    // Taps do not wait in the queue and do not take a slot from it.
    if (priority === 'now') {
      run(false, true)
      return
    }
    if (priority === 'prefetch') {
      const waiting = voiceQueue.filter((item) => item.priority === PRIORITY_ORDER.prefetch)
      if (waiting.length >= PREFETCH_QUEUE_MAX) {
        // The oldest prefetch is dropped (it will be asked for if tapped).
        const oldest = waiting.sort((a, b) => a.seq - b.seq)[0]
        voiceQueue.splice(voiceQueue.indexOf(oldest), 1)
        oldest.drop()
      }
    }
    voiceQueue.push({
      key,
      priority: PRIORITY_ORDER[priority],
      seq: (voiceSeq += 1),
      start: run,
      drop: () => {
        started = true
        finish(null)
      },
    })
    pumpVoiceQueue()
  })
  premiumCache.set(key, load)
  return load
}

/**
 * The premium audio of a text as a blob URL (the same cached one «Escuchar» uses), or null where
 * there is no premium voice. Used to build one long track for Escuchar mi Baúl ICA (Luis, 11 Oct).
 */
export function getSpeechAudioUrl(text: string, langName: string): Promise<string | null> {
  if (!PREMIUM_TTS_ENDPOINT || premiumAvailable === false || !text.trim()) return Promise.resolve(null)
  return fetchPremiumAudio(text, LANG_CODES[langName] || 'en-US', 'bulk')
}

/** Whether Google's daily limit of new audios was reached (the ones already made still play). */
export function premiumVoiceDayLimited(): boolean {
  return premiumDayLimitUntil > Date.now()
}

/** Whether the premium voice can be used at all in this visit (false: no key, or daily limit). */
export function premiumVoiceUsable(): boolean {
  return Boolean(PREMIUM_TTS_ENDPOINT) && premiumAvailable !== false
}

/**
 * Prepares the premium audio of a text ahead of time, without playing it, so that tapping
 * «Listen» later is instant. Does nothing where there is no premium voice. Never fails.
 */
export function prefetchSpeech(text: string, langName: string): Promise<void> {
  if (!PREMIUM_TTS_ENDPOINT || premiumAvailable === false || !text.trim()) return Promise.resolve()
  const code = LANG_CODES[langName] || 'en-US'
  return fetchPremiumAudio(text, code, 'prefetch').then(() => undefined)
}

/**
 * The ready premium audio of a text (it can be played on another audio element), or null when there
 * is no premium voice or it does not arrive within `timeoutMs`.
 */
export function getPremiumSpeechUrl(text: string, langName: string, timeoutMs = 4000): Promise<string | null> {
  if (!PREMIUM_TTS_ENDPOINT || premiumAvailable === false || !text.trim()) return Promise.resolve(null)
  const code = LANG_CODES[langName] || 'en-US'
  return Promise.race([fetchPremiumAudio(text, code, 'now'), sleep(timeoutMs).then(() => null)]).catch(() => null)
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

/**
 * iPhone only lets an audio element play later (after the download, outside the tap) if it
 * already played inside a tap. This plays a silent sample on the voice's element. It runs on the
 * first taps anywhere in the app (see below) and again when a voice is asked inside a tap, until
 * it works once. While unlocking, the sound session is «ambient», so it does not stop the music
 * the student may have playing (Spotify…).
 */
function unlockPremiumAudio(): void {
  if (premiumUnlocked || !PREMIUM_TTS_ENDPOINT || typeof Audio === 'undefined') return
  premiumAudio = premiumAudio || new Audio()
  const audio = premiumAudio
  // Never touch the element while it is saying something.
  if (ttsAudio === audio) return
  let session: { type: string } | undefined
  let changedSession = false
  try {
    session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session && session.type === 'auto' && !mediaSessionHeld() && !micInUse()) {
      session.type = 'ambient'
      changedSession = true
    }
  } catch {
    // No Audio Session API: nothing to do.
  }
  // Back to normal right after, so the notes and the voice sound as always (also in silent mode).
  const restoreSession = () => {
    if (!changedSession) return
    changedSession = false
    if (mediaSessionHeld()) return
    try {
      if (session && session.type === 'ambient') session.type = 'auto'
    } catch {
      // Nothing to restore.
    }
  }
  audio.src = SILENT_WAV
  const playing = audio.play()
  if (playing && typeof playing.then === 'function') {
    playing
      .then(() => {
        premiumUnlocked = true
      })
      .catch(() => undefined)
      .finally(() => window.setTimeout(restoreSession, 300))
  } else {
    window.setTimeout(restoreSession, 300)
  }
}

/** Call it inside a tap (e.g. «Start») so the next voices can play on iPhone. */
export function unlockSpeechAudio(): void {
  unlockPremiumAudio()
  primeSpeechContext()
}

// ---------------------------------------------------------------------------
// Second way to play the premium voice: Web Audio. If iPhone still refuses to play the audio
// element (play() rejected outside a tap), the same audio is played through an AudioContext that
// was woken up inside a tap. Only if this also fails does the device voice speak.
// ---------------------------------------------------------------------------

let speechContext: AudioContext | null = null
let speechSource: AudioBufferSourceNode | null = null
let restoreAfterWebAudio: (() => void) | null = null

/** Creates the voice's AudioContext and wakes it up (it only wakes up inside a tap). */
function primeSpeechContext(): void {
  if (typeof window === 'undefined') return
  try {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return
    speechContext = speechContext || new AudioCtor()
    const state = speechContext.state as string
    if (state === 'suspended' || state === 'interrupted') void speechContext.resume().catch(() => undefined)
  } catch {
    speechContext = null
  }
}

function stopWebAudioSpeech(): void {
  const source = speechSource
  speechSource = null
  if (source) {
    source.onended = null
    try {
      source.stop()
    } catch {
      // Already stopped.
    }
  }
  restoreAfterWebAudio?.()
  restoreAfterWebAudio = null
}

/** Plays a premium audio (blob URL) through Web Audio. Resolves false if it could not start. */
async function playWithWebAudio(id: number, url: string, rate: number): Promise<boolean> {
  const ctx = speechContext
  if (!ctx) return false
  try {
    if ((ctx.state as string) !== 'running') await ctx.resume()
    if ((ctx.state as string) !== 'running') return false
    const data = await (await fetch(url)).arrayBuffer()
    const buffer = await ctx.decodeAudioData(data)
    if (!isCurrent(id)) return true
    // Web Audio follows the silent switch on iPhone unless the session says «playback».
    let session: { type: string } | undefined
    let previous: string | null = null
    try {
      session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
      if (session && micInUse()) session = undefined
      if (session) {
        previous = session.type
        session.type = 'playback'
      }
    } catch {
      session = undefined
    }
    restoreAfterWebAudio = () => {
      try {
        if (mediaSessionHeld()) return
        if (session && previous && session.type === 'playback') session.type = previous === 'ambient' ? 'auto' : previous
      } catch {
        // Nothing to restore.
      }
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = Math.min(1.25, Math.max(0.5, rate))
    source.connect(ctx.destination)
    source.onended = () => {
      if (speechSource === source) speechSource = null
      restoreAfterWebAudio?.()
      restoreAfterWebAudio = null
      endSession(id, { ok: true })
    }
    speechSource = source
    source.start()
    return true
  } catch {
    return false
  }
}

if (typeof window !== 'undefined' && PREMIUM_TTS_ENDPOINT) {
  const events = ['pointerdown', 'touchend', 'click', 'keydown'] as const
  const onGesture = () => {
    if (premiumUnlocked) {
      events.forEach((name) => window.removeEventListener(name, onGesture, true))
      return
    }
    unlockPremiumAudio()
  }
  events.forEach((name) => window.addEventListener(name, onGesture, { capture: true, passive: true }))
}

function speakWithPremiumVoice(id: number, text: string, langCode: string, rate: number): void {
  premiumAudio = premiumAudio || new Audio()
  const audio = premiumAudio
  // Both run here, synchronously: when the voice is asked for inside a tap, they count as the tap.
  unlockPremiumAudio()
  primeSpeechContext()
  const useOldVoices = () => {
    if (!isCurrent(id)) return
    if (ttsAudio === audio) ttsAudio = null
    audio.onended = null
    audio.onerror = null
    speakWithoutPremium(id, text, langCode, rate)
  }
  // The audio element refused to play: same audio through Web Audio, and only then the old voices.
  let triedWebAudio = false
  const tryWebAudio = (url: string) => {
    if (triedWebAudio || !isCurrent(id)) return
    triedWebAudio = true
    if (ttsAudio === audio) ttsAudio = null
    audio.onended = null
    audio.onerror = null
    void playWithWebAudio(id, url, rate).then((ok) => {
      if (!ok) useOldVoices()
    })
  }
  // A tap waits at most PREMIUM_FETCH_TIMEOUT_MS, even when the audio was already being prepared
  // in the background (that preparation goes on and is ready for the next tap).
  const ready = Promise.race([
    fetchPremiumAudio(text, langCode, 'now'),
    sleep(PREMIUM_FETCH_TIMEOUT_MS + 500).then(() => null),
  ])
  void ready.then((url) => {
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
    audio.onerror = () => tryWebAudio(url)
    audio.src = url
    // A new src resets the speed: set it after.
    const speed = Math.min(1.25, Math.max(0.5, rate))
    audio.defaultPlaybackRate = speed
    audio.playbackRate = speed
    audio.play().catch(() => tryWebAudio(url))
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
