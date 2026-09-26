/**
 * NOTA DESAFIANTE — motor del juego (prototipo de la fase 2)
 *
 * Sin IA durante el juego: una voz lee el trozo, el reconocimiento de voz del
 * navegador (Chrome) transcribe al alumno y el código compara.
 *
 * Pendiente para la versión final (documento, fase 2): transcripción con la misma
 * herramienta que PregúntICA, tablas de "cómo suena" por idioma, cifras en letra
 * y modo bolsillo.
 */
import { LANG_CODES } from '../../constants'
import { speakNatural, stopTTS } from '../../services/tts'

export const getLangCode = (langName: string): string => LANG_CODES[langName] || 'en-US'

export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Dispositivo
// ---------------------------------------------------------------------------

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent || ''
  const isiPhoneOrIPad = /iPad|iPhone|iPod/.test(userAgent)
  const isIPadOSDesktopUA = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1
  return isiPhoneOrIPad || isIPadOSDesktopUA
}

export function isAndroidDevice(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')
}

// ---------------------------------------------------------------------------
// Audio: voz y pitidos
// ---------------------------------------------------------------------------

// Se guarda la frase que suena para que el navegador no la borre de memoria a
// mitad (en Safari, si pasa, nunca avisa de que ha terminado).
let currentUtterance: SpeechSynthesisUtterance | null = null

function pickSynthesisVoice(langCode: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() || []
  if (!voices.length) return null
  const lang = langCode.split('-')[0]
  const matching = voices.filter((voice) => voice.lang.replace('_', '-').startsWith(lang))
  if (!matching.length) return null
  return (
    matching.find((voice) => voice.lang.replace('_', '-') === langCode && voice.localService) ||
    matching.find((voice) => voice.localService) ||
    matching[0]
  )
}

/**
 * Voz del sistema (la que se usa en iPhone). Hecha a prueba de los fallos de Safari:
 * - no hace cancel() justo antes de speak() si no hace falta (Safari se "come" la frase),
 * - si la voz no llega a empezar en 3 s, sigue el juego en vez de quedarse colgado,
 * - si empieza, espera a que termine de verdad (con un tope por si Safari no avisa).
 */
function speakWithSynthesis(text: string, langName: string, rate = 1): Promise<void> {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  if (!synth || !text.trim()) return Promise.resolve()

  return new Promise((resolve) => {
    let settled = false
    let startTimer = 0
    let endTimer = 0
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(startTimer)
      window.clearTimeout(endTimer)
      resolve()
    }

    const speakNow = () => {
      if (settled) return
      const code = getLangCode(langName)
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = code
      const normalizedRate = Math.min(1.25, Math.max(0.5, rate))
      // En iPhone la voz ya va más lenta: se baja un poco más si se pide despacio.
      utterance.rate = normalizedRate < 1 ? Math.max(0.45, normalizedRate - 0.2) : normalizedRate
      utterance.pitch = 1
      utterance.volume = 1
      const voice = pickSynthesisVoice(code)
      if (voice) utterance.voice = voice
      currentUtterance = utterance

      utterance.onstart = () => {
        window.clearTimeout(startTimer)
        // Tope por si Safari no avisa del final: tiempo de sobra según lo largo que sea.
        endTimer = window.setTimeout(finish, Math.min(20000, 2500 + text.length * 140))
      }
      utterance.onend = finish
      utterance.onerror = finish
      // Si en 3 s no ha empezado a hablar, el navegador la ha bloqueado: se sigue.
      startTimer = window.setTimeout(finish, 3000)

      if (synth.paused) synth.resume()
      synth.speak(utterance)
      // Safari a veces deja la voz en pausa sin motivo.
      window.setTimeout(() => {
        if (!settled && synth.paused) synth.resume()
      }, 250)
    }

    if (synth.speaking || synth.pending) {
      synth.cancel()
      window.setTimeout(speakNow, 120)
    } else {
      speakNow()
    }
  })
}

export function speakAsync(text: string, langName: string, rate = 1): Promise<void> {
  if (isIOSDevice()) return speakWithSynthesis(text, langName, rate)
  return new Promise((resolve) => speakNatural(text, langName, () => resolve(), rate))
}

export function stopSpeaking(): void {
  stopTTS()
  if (currentUtterance) currentUtterance = null
}

let audioContext: AudioContext | null = null

async function resumeAudioContext(ctx: AudioContext): Promise<void> {
  // 'interrupted' solo existe en Safari (tras usar el micro o una llamada).
  const state = ctx.state as string
  if (state === 'suspended' || state === 'interrupted') await ctx.resume()
}

/**
 * Hay que llamarla DENTRO del toque del alumno (sin await antes).
 * El iPhone solo deja sonar la voz y los pitidos si el primer sonido sale de un toque:
 * aquí se "desbloquean" los dos con un sonido mudo, y después ya suenan solos.
 */
export function unlockChallengeAudio(): void {
  try {
    audioContext = audioContext || new AudioContext()
    void audioContext.resume().catch(() => {})
    const buffer = audioContext.createBuffer(1, 1, 22050)
    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(audioContext.destination)
    source.start(0)
  } catch {
    // Sin audio: el juego sigue igual.
  }
  try {
    const synth = window.speechSynthesis
    if (synth) {
      const silent = new SpeechSynthesisUtterance(' ')
      silent.volume = 0
      silent.lang = 'es-ES'
      currentUtterance = silent
      synth.speak(silent)
    }
  } catch {
    // Sin voz del sistema: se sigue igual.
  }
}

export async function playBeep(frequency = 880, durationMs = 170): Promise<void> {
  try {
    audioContext = audioContext || new AudioContext()
    await resumeAudioContext(audioContext)
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + durationMs / 1000)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + durationMs / 1000 + 0.02)
    await wait(durationMs + 40)
  } catch {
    // Sin audio: el juego sigue igual.
  }
}

// Nota corta con un timbre concreto, programada en el tiempo del AudioContext.
function scheduleNote(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  durationS: number,
  type: OscillatorType,
  volume: number,
): void {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startAt)
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationS)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + durationS + 0.03)
}

async function getAudioContext(): Promise<AudioContext> {
  audioContext = audioContext || new AudioContext()
  await resumeAudioContext(audioContext)
  return audioContext
}

/**
 * ✅ Acierto: arpegio alegre que sube (do–mi–sol–do agudos), fuerte y claro,
 * muy distinto del pitido de turno. Va más agudo y más alto que antes porque
 * en los altavoces del portátil o del móvil las notas graves casi no se oían.
 */
export async function playSuccessChime(): Promise<void> {
  try {
    const ctx = await getAudioContext()
    const now = ctx.currentTime + 0.02
    const notes = [1046.5, 1318.5, 1568, 2093]
    notes.forEach((frequency, position) => {
      const isLast = position === notes.length - 1
      const startAt = now + position * 0.1
      scheduleNote(ctx, frequency, startAt, isLast ? 0.55 : 0.18, 'sine', 0.42)
      // Un poco de "cuerpo" para que suene a campanita y no a pitido
      scheduleNote(ctx, frequency / 2, startAt, isLast ? 0.4 : 0.14, 'triangle', 0.16)
    })
    await wait(Math.round((notes.length * 0.1 + 0.55) * 1000))
  } catch {
    // Sin audio: el juego sigue igual.
  }
}

/** ❌ Fallo: dos notas graves que bajan, suaves (no castiga, pero se nota la diferencia). */
export async function playFailTone(): Promise<void> {
  try {
    const ctx = await getAudioContext()
    const now = ctx.currentTime + 0.02
    scheduleNote(ctx, 311.13, now, 0.18, 'triangle', 0.28)
    scheduleNote(ctx, 233.08, now + 0.17, 0.32, 'triangle', 0.28)
    await wait(560)
  } catch {
    // Sin audio: el juego sigue igual.
  }
}

// ---------------------------------------------------------------------------
// Escuchar al alumno (reconocimiento de voz del navegador)
// ---------------------------------------------------------------------------

type RecognitionAlternative = { transcript: string }
type RecognitionResult = { isFinal: boolean; length: number; [index: number]: RecognitionAlternative }
type RecognitionEvent = { resultIndex: number; results: { length: number; [index: number]: RecognitionResult } }
type RecognitionErrorEvent = { error: string }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  onaudiostart: (() => void) | null
  onspeechstart: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionConstructor = new () => Recognition

function getRecognitionConstructor(): RecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export const isSpeechRecognitionSupported = (): boolean =>
  typeof window !== 'undefined' && getRecognitionConstructor() !== null

export type ListenOutcome =
  | { status: 'heard'; candidates: string[]; transcript: string }
  | { status: 'silence' } // no ha empezado a hablar
  | { status: 'unclear' } // ha hablado pero no se ha entendido nada
  | { status: 'error'; message: string }
  | { status: 'cancelled' }

// El micro no ha llegado a abrirse (pasa en iPhone justo después de abrir la app).
type SessionOutcome = ListenOutcome | { status: 'not-started' }

function permissionMessage(): string {
  if (isIOSDevice()) {
    return 'No hay permiso para el micrófono. En el iPhone: Ajustes › Apps › Safari › Micrófono › Permitir, y Ajustes › Privacidad y seguridad › Reconocimiento de voz › activa Safari. Después cierra la app y vuelve a abrirla.'
  }
  if (isAndroidDevice()) {
    return 'No hay permiso para el micrófono. Toca el candado (o los tres puntos › Ajustes del sitio) y activa el micrófono para icademy.app.'
  }
  return 'No hay permiso para usar el micrófono. Permítelo en el candado de la barra de direcciones.'
}

const MIC_NOT_OPENING_MESSAGE =
  'El micrófono no se ha abierto. Toca «Salir», cierra la app del todo y vuelve a abrirla.'

// Solo puede haber un reconocimiento de voz a la vez. Si se abre uno nuevo antes de
// que el anterior haya terminado del todo, el iPhone lo deja "sordo" sin avisar.
let recognitionIdle: Promise<void> = Promise.resolve()

function markRecognitionBusy(): () => void {
  let release: () => void = () => {}
  recognitionIdle = new Promise<void>((resolve) => {
    release = resolve
  })
  return release
}

async function waitRecognitionIdle(maxMs = 1500): Promise<void> {
  await Promise.race([recognitionIdle, wait(maxMs)])
}

// ---------------------------------------------------------------------------
// Unir lo que devuelve el reconocimiento
// ---------------------------------------------------------------------------

type Segment = string[] // alternativas de un trozo reconocido (la primera es la mejor)

/**
 * Chrome en Android (y a veces Safari) devuelve cada resultado repitiendo lo anterior:
 * «hola» · «hola qué» · «hola qué tal». Si se suman tal cual sale
 * «hola hola qué hola qué tal». Aquí se quedan solo los trozos nuevos.
 */
export function mergeRecognitionSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const segment of segments) {
    const text = normalizeAnswer(segment[0] || '')
    if (!text) continue
    const joined = normalizeAnswer(out.map((item) => item[0] || '').join(' '))
    // Repite todo lo anterior y añade algo (o es igual): sustituye a todo.
    if (joined && (text === joined || text.startsWith(`${joined} `))) {
      out.length = 0
      out.push(segment)
      continue
    }
    const previous = out[out.length - 1]
    if (previous) {
      const previousText = normalizeAnswer(previous[0] || '')
      // Repite el último trozo y añade algo: sustituye al último.
      if (text.startsWith(`${previousText} `)) {
        out[out.length - 1] = segment
        continue
      }
      // Ya estaba dicho (repetición exacta o final del anterior): se ignora.
      if (text === previousText || previousText.endsWith(` ${text}`) || joined.endsWith(` ${text}`)) {
        continue
      }
    }
    out.push(segment)
  }
  return out
}

/** Texto para enseñar mientras habla: lo ya reconocido + lo provisional, sin repetir. */
export function composeRecognitionText(segments: Segment[], interim: string): string {
  const merged = mergeRecognitionSegments(segments)
  const finalText = merged.map((item) => item[0] || '').join(' ').trim()
  const interimClean = interim.trim()
  if (!interimClean) return finalText
  if (!finalText) return interimClean
  const finalNorm = normalizeAnswer(finalText)
  const interimNorm = normalizeAnswer(interimClean)
  if (interimNorm === finalNorm || interimNorm.startsWith(`${finalNorm} `)) return interimClean
  if (finalNorm.endsWith(interimNorm)) return finalText
  return `${finalText} ${interimClean}`
}

// ---------------------------------------------------------------------------
// Preparar el micrófono (permisos) antes de empezar
// ---------------------------------------------------------------------------

let microphoneReady = false

/**
 * Abre el reconocimiento de voz un momento, antes del primer trozo, para que los
 * permisos (micrófono y reconocimiento de voz) salgan al empezar y no en mitad del juego.
 * Solo hace falta la primera vez desde que se abre la app.
 */
export function warmUpMicrophone(
  langName: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const Ctor = getRecognitionConstructor()
  if (!Ctor) {
    return Promise.resolve({
      ok: false,
      message: isIOSDevice()
        ? 'Tu iPhone no deja usar el reconocimiento de voz aquí. Abre icademy.app en Safari.'
        : 'Tu navegador no tiene reconocimiento de voz. Abre la app en Google Chrome.',
    })
  }
  if (microphoneReady) return Promise.resolve({ ok: true })

  return new Promise((resolve) => {
    void (async () => {
      await waitRecognitionIdle()
      const recognition = new Ctor()
      recognition.lang = getLangCode(langName)
      recognition.continuous = false
      recognition.interimResults = false
      recognition.maxAlternatives = 1
      const release = markRecognitionBusy()

      let settled = false
      let timeout = 0
      const finish = (result: { ok: true } | { ok: false; message: string }) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        if (result.ok) microphoneReady = true
        try {
          recognition.abort()
        } catch {
          // ya estaba parado
        }
        // Por si el navegador no avisa de que se ha cerrado.
        window.setTimeout(release, 800)
        resolve(result)
      }

      // En cuanto el micro se abre, ya hay permiso.
      // (onstart no vale: en iPhone salta antes de contestar a la ventana de permiso).
      recognition.onaudiostart = () => finish({ ok: true })
      recognition.onspeechstart = () => finish({ ok: true })
      recognition.onresult = () => finish({ ok: true })
      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          finish({ ok: false, message: permissionMessage() })
        } else if (event.error === 'audio-capture') {
          finish({ ok: false, message: 'No se encuentra ningún micrófono.' })
        } else if (event.error === 'network') {
          finish({ ok: false, message: 'El reconocimiento de voz necesita conexión a internet.' })
        }
        // 'no-speech' / 'aborted': el micro funciona; se decide en onend.
      }
      recognition.onend = () => {
        release()
        finish({ ok: true })
      }
      // Tiempo de sobra para contestar a las ventanas de permiso.
      timeout = window.setTimeout(() => finish({ ok: true }), 20000)

      try {
        recognition.start()
      } catch {
        release()
        finish({ ok: true })
      }
    })()
  })
}

// ---------------------------------------------------------------------------
// Escuchar una respuesta
// ---------------------------------------------------------------------------

type ListenOptions = {
  noSpeechMs?: number // sin hablar en 5 s -> silencio
  endSilenceMs?: number // se corta tras 4 s de silencio (tiempo para pensar)
  maxMs?: number // máximo 30 s
  onInterim?: (text: string) => void
}

// Si en este tiempo el micro no se ha abierto, se da por colgado y se abre otro.
const START_TIMEOUT_MS = 4000
// Si tras pedir que pare el navegador no contesta, se evalúa lo que haya igualmente.
const STOP_TIMEOUT_MS = 2500

function listenSession(
  Ctor: RecognitionConstructor,
  langName: string,
  options: ListenOptions | undefined,
  registerCancel: (cancel: () => void) => void,
): Promise<SessionOutcome> {
  const noSpeechMs = options?.noSpeechMs ?? 5000
  // Somos humanos: al responder, a veces hay que pararse a pensar.
  // Se permiten 4 s de silencio a mitad de la respuesta antes de darla por terminada.
  const endSilenceMs = options?.endSilenceMs ?? 4000
  const maxMs = options?.maxMs ?? 30000

  return new Promise<SessionOutcome>((resolve) => {
    const recognition = new Ctor()
    recognition.lang = getLangCode(langName)
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3
    const release = markRecognitionBusy()

    const createdAt = Date.now()
    let alive = false // el micro se ha abierto de verdad
    let cancelled = false
    let stopRequested = false
    let stopRequestedAt = 0
    let settled = false
    let speechStarted = false
    let startedAt = Date.now()
    let lastActivity = Date.now()
    let errorOutcome: ListenOutcome | null = null
    let committed: Segment[] = [] // lo reconocido antes de reabrir el micro
    let sessionFinals: Segment[] = [] // lo reconocido en esta apertura del micro
    let interimText = ''
    let shownText = ''
    let timer = 0

    const finish = (outcome: SessionOutcome) => {
      if (settled) return
      settled = true
      window.clearInterval(timer)
      resolve(outcome)
    }

    const allSegments = (): Segment[] => mergeRecognitionSegments([...committed, ...sessionFinals])

    const buildOutcome = (): ListenOutcome => {
      if (cancelled) return { status: 'cancelled' }
      if (errorOutcome) return errorOutcome
      const merged = allSegments()
      if (!merged.length && interimText.trim()) merged.push([interimText.trim()])
      const transcript = merged.map((alternatives) => alternatives[0] || '').join(' ').trim()
      if (!transcript) return speechStarted ? { status: 'unclear' } : { status: 'silence' }

      // Candidatos: todo lo dicho, y también solo lo último (si empezó de nuevo a mitad,
      // cuenta el último intento), más las alternativas del último segmento.
      const candidates = new Set<string>([transcript])
      const last = merged[merged.length - 1]
      if (last) {
        const before = merged
          .slice(0, -1)
          .map((alternatives) => alternatives[0] || '')
          .join(' ')
        last.forEach((alternative) => {
          candidates.add(alternative)
          candidates.add(`${before} ${alternative}`.trim())
        })
      }
      return { status: 'heard', transcript, candidates: Array.from(candidates) }
    }

    const markAlive = () => {
      if (alive) return
      alive = true
      // El tiempo para empezar a hablar cuenta desde que el micro está abierto.
      startedAt = Date.now()
      lastActivity = Date.now()
    }

    const requestStop = (mode: 'stop' | 'abort') => {
      if (stopRequested) return
      stopRequested = true
      stopRequestedAt = Date.now()
      try {
        if (mode === 'abort') recognition.abort()
        else recognition.stop()
      } catch {
        // ya estaba parado
      }
    }

    // En iPhone solo cuenta "micro abierto" cuando llega sonido (onaudiostart):
    // a veces salta onstart pero el micro se queda mudo, que es justo el fallo a evitar.
    recognition.onstart = isIOSDevice() ? null : markAlive
    recognition.onaudiostart = markAlive

    recognition.onspeechstart = () => {
      markAlive()
      speechStarted = true
      lastActivity = Date.now()
    }

    recognition.onresult = (event) => {
      markAlive()
      // Se reconstruye desde la lista completa (no se va sumando): así, aunque el
      // navegador repita resultados, cada palabra cuenta una sola vez.
      const finals: Segment[] = []
      let interim = ''
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (!result) continue
        if (result.isFinal) {
          const alternatives: string[] = []
          for (let k = 0; k < result.length; k += 1) {
            const text = result[k]?.transcript?.trim()
            if (text) alternatives.push(text)
          }
          if (alternatives.length) finals.push(alternatives)
        } else {
          interim += ` ${result[0]?.transcript || ''}`
        }
      }
      sessionFinals = finals
      interimText = interim.trim()

      const shown = composeRecognitionText([...committed, ...sessionFinals], interimText)
      if (shown) speechStarted = true
      // Solo cuenta como "sigue hablando" si ha cambiado algo (Android repite
      // resultados iguales y así la escucha no se cortaba nunca).
      if (shown !== shownText) {
        shownText = shown
        lastActivity = Date.now()
        options?.onInterim?.(shown)
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        markAlive()
        return
      }
      if (event.error === 'aborted') return
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        errorOutcome = { status: 'error', message: permissionMessage() }
        return
      }
      if (event.error === 'network') {
        errorOutcome = {
          status: 'error',
          message: 'El reconocimiento de voz necesita conexión a internet.',
        }
        return
      }
      if (event.error === 'audio-capture') {
        errorOutcome = { status: 'error', message: 'No se encuentra ningún micrófono.' }
      }
    }

    recognition.onend = () => {
      if (settled) {
        release()
        return
      }
      if (!alive && !cancelled && !errorOutcome) {
        // Se ha cerrado sin llegar a abrir el micro.
        release()
        finish({ status: 'not-started' })
        return
      }
      // El navegador a veces cierra el micro por su cuenta tras un silencio corto.
      // Si aún no se ha cumplido el tiempo para pensar, se vuelve a abrir y se sigue escuchando.
      if (!cancelled && !stopRequested && !errorOutcome) {
        const now = Date.now()
        const stillThinking = speechStarted
          ? now - lastActivity < endSilenceMs
          : now - startedAt < noSpeechMs
        if (stillThinking && now - startedAt < maxMs) {
          // Lo reconocido hasta ahora se guarda antes de reabrir.
          committed = [...committed, ...sessionFinals]
          if (interimText.trim()) committed.push([interimText.trim()])
          sessionFinals = []
          interimText = ''
          try {
            recognition.start()
            return
          } catch {
            // si no se puede reabrir, se evalúa lo que haya
          }
        }
      }
      release()
      finish(buildOutcome())
    }

    timer = window.setInterval(() => {
      const now = Date.now()
      if (cancelled) return

      // El navegador no contesta tras pedir que pare: se evalúa lo que haya.
      if (stopRequested && now - stopRequestedAt > STOP_TIMEOUT_MS) {
        release()
        finish(alive ? buildOutcome() : { status: 'not-started' })
        return
      }
      if (stopRequested) return

      if (!alive) {
        // El micro no se abre (iPhone recién abierto): se tira y se abre otro.
        if (now - createdAt > START_TIMEOUT_MS) {
          requestStop('abort')
          window.setTimeout(() => {
            release()
            finish({ status: 'not-started' })
          }, 600)
        }
        return
      }
      if (!speechStarted && now - startedAt > noSpeechMs) {
        requestStop('abort')
        return
      }
      if (speechStarted && now - lastActivity > endSilenceMs) {
        requestStop('stop')
        return
      }
      if (now - startedAt > maxMs) {
        requestStop('stop')
      }
    }, 200)

    registerCancel(() => {
      cancelled = true
      try {
        recognition.abort()
      } catch {
        // ya estaba parado
      }
      window.setTimeout(() => {
        release()
        finish({ status: 'cancelled' })
      }, 300)
    })

    try {
      recognition.start()
    } catch {
      // Normalmente porque el anterior aún no se había cerrado: se intenta con otro.
      release()
      finish({ status: 'not-started' })
    }
  })
}

export function listenOnce(
  langName: string,
  options?: ListenOptions,
): { promise: Promise<ListenOutcome>; cancel: () => void } {
  const Ctor = getRecognitionConstructor()
  if (!Ctor) {
    return {
      promise: Promise.resolve({
        status: 'error',
        message: 'Tu navegador no tiene reconocimiento de voz. Abre la app en Google Chrome.',
      }),
      cancel: () => {},
    }
  }

  let cancelled = false
  let cancelCurrent: () => void = () => {}

  const run = async (): Promise<ListenOutcome> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await waitRecognitionIdle()
      if (cancelled) return { status: 'cancelled' }
      // En iPhone, el altavoz tarda un poco en soltar la voz/pitido antes de poder grabar.
      await wait(isIOSDevice() ? 300 : 60)
      if (cancelled) return { status: 'cancelled' }

      const outcome = await listenSession(Ctor, langName, options, (cancel) => {
        cancelCurrent = cancel
      })
      if (cancelled) return { status: 'cancelled' }
      if (outcome.status !== 'not-started') return outcome
      // El micro no se abrió: se intenta una vez más con uno nuevo.
      await wait(400)
    }
    return { status: 'error', message: MIC_NOT_OPENING_MESSAGE }
  }

  let resolveCancelled: (outcome: ListenOutcome) => void = () => {}
  const cancelledPromise = new Promise<ListenOutcome>((resolve) => {
    resolveCancelled = resolve
  })

  return {
    promise: Promise.race([run(), cancelledPromise]),
    cancel: () => {
      cancelled = true
      cancelCurrent()
      window.setTimeout(() => resolveCancelled({ status: 'cancelled' }), 350)
    },
  }
}

// ---------------------------------------------------------------------------
// Comparar lo dicho con el trozo correcto
// ---------------------------------------------------------------------------

// Limpieza básica: minúsculas, sin puntuación ni tildes, apóstrofos y guiones como espacios.
// (La tabla de "cómo suena" de cada idioma llegará en la fase 2.)
export const normalizeAnswer = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`´\-/]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Si el reconocimiento escribe una cifra ("2"), se acepta en lugar de la palabra.
const tokenMatches = (heard: string | undefined, expected: string): boolean =>
  heard !== undefined && (heard === expected || /^\d+$/.test(heard))

export type WordMark = { word: string; ok: boolean }

export type AnswerCheck = {
  correct: boolean
  marks: WordMark[]
  heard: string
  /** Palabras del trozo que ha dicho bien (todas si es correcto). */
  matchedWords: number
}

export function checkAnswer(expected: string, candidates: string[]): AnswerCheck {
  const displayWords = expected.split(/\s+/).filter(Boolean)
  const expectedTokens: Array<{ token: string; owner: number }> = []
  displayWords.forEach((word, owner) => {
    normalizeAnswer(word)
      .split(' ')
      .filter(Boolean)
      .forEach((token) => expectedTokens.push({ token, owner }))
  })

  let best: { correct: boolean; matched: Set<number>; heard: string } | null = null

  for (const candidate of candidates.length ? candidates : ['']) {
    const heard = normalizeAnswer(candidate).split(' ').filter(Boolean)
    const n = expectedTokens.length
    // Correcto si no falla ninguna palabra (se admiten palabras de más al principio:
    // si se equivocó y volvió a empezar, cuenta el último intento).
    const correct =
      heard.length >= n &&
      expectedTokens.every((item, k) => tokenMatches(heard[heard.length - n + k], item.token))

    // Palabras acertadas (subsecuencia común más larga), para marcar en pantalla.
    const rows = n + 1
    const cols = heard.length + 1
    const table: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))
    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        table[i][j] = tokenMatches(heard[j - 1], expectedTokens[i - 1].token)
          ? table[i - 1][j - 1] + 1
          : Math.max(table[i - 1][j], table[i][j - 1])
      }
    }
    const matched = new Set<number>()
    let i = n
    let j = heard.length
    while (i > 0 && j > 0) {
      if (tokenMatches(heard[j - 1], expectedTokens[i - 1].token) && table[i][j] === table[i - 1][j - 1] + 1) {
        matched.add(i - 1)
        i -= 1
        j -= 1
      } else if (table[i - 1][j] >= table[i][j - 1]) {
        i -= 1
      } else {
        j -= 1
      }
    }

    const better =
      !best ||
      (correct && !best.correct) ||
      (correct === best.correct && matched.size > best.matched.size)
    if (better) best = { correct, matched, heard: candidate }
  }

  const result = best!
  const marks = displayWords.map((word, owner) => {
    const ownTokens = expectedTokens
      .map((item, index) => ({ ...item, index }))
      .filter((item) => item.owner === owner)
    return {
      word,
      ok: result.correct || ownTokens.every((item) => result.matched.has(item.index)),
    }
  })

  return {
    correct: result.correct,
    marks,
    heard: result.heard,
    matchedWords: marks.filter((mark) => mark.ok).length,
  }
}
