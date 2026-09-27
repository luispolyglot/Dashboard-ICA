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
// Audio: voz y pitidos
// ---------------------------------------------------------------------------

export function speakAsync(text: string, langName: string, rate = 1): Promise<void> {
  return new Promise((resolve) => speakNatural(text, langName, () => resolve(), rate))
}

export function stopSpeaking(): void {
  stopTTS()
}

let audioContext: AudioContext | null = null

export async function playBeep(frequency = 880, durationMs = 170): Promise<void> {
  try {
    audioContext = audioContext || new AudioContext()
    if (audioContext.state === 'suspended') await audioContext.resume()
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
  if (audioContext.state === 'suspended') await audioContext.resume()
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

export function listenOnce(
  langName: string,
  options?: {
    noSpeechMs?: number // sin hablar en 5 s -> silencio
    endSilenceMs?: number // se corta tras 4 s de silencio (tiempo para pensar)
    maxMs?: number // máximo 30 s
    onInterim?: (text: string) => void
  },
): { promise: Promise<ListenOutcome>; cancel: () => void } {
  const noSpeechMs = options?.noSpeechMs ?? 5000
  // Somos humanos: al responder, a veces hay que pararse a pensar.
  // Se permiten 4 s de silencio a mitad de la respuesta antes de darla por terminada.
  const endSilenceMs = options?.endSilenceMs ?? 4000
  const maxMs = options?.maxMs ?? 30000

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

  const recognition = new Ctor()
  recognition.lang = getLangCode(langName)
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 3

  let cancelled = false
  let stopRequested = false
  let settled = false
  let speechStarted = false
  let lastActivity = Date.now()
  const startedAt = Date.now()
  let errorOutcome: ListenOutcome | null = null
  const finalSegments: string[][] = [] // por segmento, sus alternativas
  let interimText = ''
  let timer = 0

  let resolveOutcome: (outcome: ListenOutcome) => void = () => {}
  const promise = new Promise<ListenOutcome>((resolve) => {
    resolveOutcome = resolve
  })

  const finish = (outcome: ListenOutcome) => {
    if (settled) return
    settled = true
    window.clearInterval(timer)
    resolveOutcome(outcome)
  }

  const buildOutcome = (): ListenOutcome => {
    if (cancelled) return { status: 'cancelled' }
    if (errorOutcome) return errorOutcome
    const segments = finalSegments.map((alternatives) => alternatives[0] || '')
    if (!segments.length && interimText.trim()) segments.push(interimText.trim())
    const transcript = segments.join(' ').trim()
    if (!transcript) return speechStarted ? { status: 'unclear' } : { status: 'silence' }

    // Candidatos: todo lo dicho, y también solo lo último (si empezó de nuevo a mitad,
    // cuenta el último intento), más las alternativas del último segmento.
    const candidates = new Set<string>([transcript])
    const last = finalSegments[finalSegments.length - 1]
    if (last) {
      const before = finalSegments.slice(0, -1).map((alternatives) => alternatives[0] || '').join(' ')
      last.forEach((alternative) => {
        candidates.add(alternative)
        candidates.add(`${before} ${alternative}`.trim())
      })
    }
    return { status: 'heard', transcript, candidates: Array.from(candidates) }
  }

  recognition.onspeechstart = () => {
    speechStarted = true
    lastActivity = Date.now()
  }

  recognition.onresult = (event) => {
    speechStarted = true
    lastActivity = Date.now()
    interimText = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      if (result.isFinal) {
        const alternatives: string[] = []
        for (let k = 0; k < result.length; k += 1) {
          const text = result[k]?.transcript?.trim()
          if (text) alternatives.push(text)
        }
        if (alternatives.length) finalSegments.push(alternatives)
      } else {
        interimText += ` ${result[0]?.transcript || ''}`
      }
    }
    const shown = [...finalSegments.map((alternatives) => alternatives[0]), interimText.trim()]
      .filter(Boolean)
      .join(' ')
    options?.onInterim?.(shown)
  }

  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      errorOutcome = {
        status: 'error',
        message: 'No hay permiso para usar el micrófono. Permítelo en el candado de la barra de direcciones.',
      }
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
    // Chrome a veces cierra el micro por su cuenta tras un silencio corto.
    // Si aún no se ha cumplido el tiempo para pensar, se vuelve a abrir y se sigue escuchando.
    if (!cancelled && !stopRequested && !errorOutcome && !settled) {
      const now = Date.now()
      const stillThinking = speechStarted
        ? now - lastActivity < endSilenceMs
        : now - startedAt < noSpeechMs
      if (stillThinking && now - startedAt < maxMs) {
        try {
          recognition.start()
          return
        } catch {
          // si no se puede reabrir, se evalúa lo que haya
        }
      }
    }
    finish(buildOutcome())
  }

  timer = window.setInterval(() => {
    const now = Date.now()
    if (!speechStarted && now - startedAt > noSpeechMs) {
      stopRequested = true
      recognition.abort()
      return
    }
    if (speechStarted && now - lastActivity > endSilenceMs) {
      stopRequested = true
      recognition.stop()
      return
    }
    if (now - startedAt > maxMs) {
      stopRequested = true
      recognition.stop()
    }
  }, 200)

  try {
    recognition.start()
  } catch (error) {
    finish({
      status: 'error',
      message: error instanceof Error ? error.message : 'No se pudo abrir el micrófono.',
    })
  }

  return {
    promise,
    cancel: () => {
      cancelled = true
      try {
        recognition.abort()
      } catch {
        // ya estaba parado
      }
      window.setTimeout(() => finish({ status: 'cancelled' }), 300)
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
