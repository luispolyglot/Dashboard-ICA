import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkAnswer,
  composeRecognitionText,
  listenOnce,
  mergeRecognitionSegments,
} from '../../../../../src/modules/components/NotaDesafiante/challengeEngine'

describe('mergeRecognitionSegments', () => {
  it('Android: cada resultado repite lo anterior → se queda solo el último', () => {
    const merged = mergeRecognitionSegments([['je'], ['je suis'], ['je suis allé'], ['je suis allé à Paris']])
    expect(merged.map((s) => s[0])).toEqual(['je suis allé à Paris'])
  })

  it('resultados repetidos iguales cuentan una sola vez', () => {
    const merged = mergeRecognitionSegments([['ich bin'], ['ich bin'], ['müde']])
    expect(merged.map((s) => s[0]).join(' ')).toBe('ich bin müde')
  })

  it('trozos normales (Chrome de ordenador) se suman', () => {
    const merged = mergeRecognitionSegments([['I went'], ['to the beach']])
    expect(merged.map((s) => s[0]).join(' ')).toBe('I went to the beach')
  })

  it('un trozo que repite todo lo anterior sustituye a todo', () => {
    const merged = mergeRecognitionSegments([['I went'], ['to the'], ['I went to the beach']])
    expect(merged.map((s) => s[0]).join(' ')).toBe('I went to the beach')
  })

  it('texto que se enseña mientras habla: sin repetir', () => {
    expect(composeRecognitionText([['hola']], 'hola qué tal')).toBe('hola qué tal')
    expect(composeRecognitionText([['hola']], 'qué tal')).toBe('hola qué tal')
  })
})

// ---------------------------------------------------------------------------
// Reconocimiento de voz falso
// ---------------------------------------------------------------------------

type Handler = ((event?: unknown) => void) | null

class FakeRecognition {
  static instances: FakeRecognition[] = []
  static mode: 'normal' | 'dead-first' = 'normal'
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: Handler = null
  onerror: Handler = null
  onend: Handler = null
  onstart: Handler = null
  onaudiostart: Handler = null
  onspeechstart: Handler = null
  started = false
  constructor() {
    FakeRecognition.instances.push(this)
  }
  start() {
    this.started = true
    const dead = FakeRecognition.mode === 'dead-first' && FakeRecognition.instances.length === 1
    setTimeout(() => {
      this.onstart?.()
      if (!dead) this.onaudiostart?.()
    }, 50)
  }
  stop() {
    setTimeout(() => this.onend?.(), 50)
  }
  abort() {
    setTimeout(() => this.onend?.(), 20)
  }
  // Emite la lista completa de resultados como hace el navegador.
  emit(results: Array<{ text: string; final: boolean }>) {
    const list = results.map((item) => Object.assign([{ transcript: item.text }], { isFinal: item.final }))
    this.onspeechstart?.()
    this.onresult?.({ resultIndex: 0, results: list })
  }
}

describe('listenOnce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeRecognition.instances = []
    FakeRecognition.mode = 'normal'
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('Android: resultados acumulados no duplican las palabras', async () => {
    const shown: string[] = []
    const listening = listenOnce('Francés', { onInterim: (text) => shown.push(text) })
    await vi.advanceTimersByTimeAsync(300)
    const rec = FakeRecognition.instances[0]
    rec.emit([{ text: 'je suis', final: true }])
    await vi.advanceTimersByTimeAsync(300)
    rec.emit([
      { text: 'je suis', final: true },
      { text: 'je suis allé', final: true },
    ])
    await vi.advanceTimersByTimeAsync(300)
    rec.emit([
      { text: 'je suis', final: true },
      { text: 'je suis allé', final: true },
      { text: 'je suis allé à Paris', final: true },
    ])
    // Android repite el mismo resultado sin parar: no debe alargar la escucha.
    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(500)
      rec.emit([{ text: 'je suis allé à Paris', final: true }])
    }
    await vi.advanceTimersByTimeAsync(6000)
    const outcome = await listening.promise
    expect(outcome.status).toBe('heard')
    if (outcome.status !== 'heard') return
    expect(outcome.transcript).toBe('je suis allé à Paris')
    expect(shown[shown.length - 1]).toBe('je suis allé à Paris')
    expect(checkAnswer('Je suis allé à Paris', outcome.candidates).correct).toBe(true)
  })

  it('iPhone: si el micro no se abre, se tira y se abre otro solo', async () => {
    FakeRecognition.mode = 'dead-first'
    const ua = vi
      .spyOn(window.navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')
    const listening = listenOnce('Inglés')
    await vi.advanceTimersByTimeAsync(6500)
    expect(FakeRecognition.instances.length).toBe(2)
    const rec = FakeRecognition.instances[1]
    rec.emit([{ text: 'hello there', final: true }])
    await vi.advanceTimersByTimeAsync(6000)
    const outcome = await listening.promise
    expect(outcome.status).toBe('heard')
    ua.mockRestore()
  })

  it('sin hablar → silencio (no se queda colgado)', async () => {
    const listening = listenOnce('Inglés')
    await vi.advanceTimersByTimeAsync(9000)
    const outcome = await listening.promise
    expect(outcome.status).toBe('silence')
  })

  it('cancelar (Salir) termina al momento', async () => {
    const listening = listenOnce('Inglés')
    await vi.advanceTimersByTimeAsync(300)
    listening.cancel()
    await vi.advanceTimersByTimeAsync(500)
    const outcome = await listening.promise
    expect(outcome.status).toBe('cancelled')
  })
})
