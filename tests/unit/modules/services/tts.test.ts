import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { speakLocal, speakNatural, stopTTS, type SpeakResult } from '@/modules/services/tts'

type Behaviour = 'ok' | 'endWithoutStart' | 'never'

/** Fake speechSynthesis: each speak() follows the next behaviour in the list. */
function installSynth(behaviours: Behaviour[]) {
  const spoken: string[] = []
  let speaking = false
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => [{ lang: 'pl-PL', name: 'Polski', localService: true } as SpeechSynthesisVoice],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(() => {
      speaking = false
    }),
    speak: vi.fn((u: SpeechSynthesisUtterance) => {
      spoken.push(u.text)
      const behaviour = behaviours.shift() ?? 'ok'
      speaking = true
      if (behaviour === 'ok') {
        setTimeout(() => u.onstart?.(new Event('start') as SpeechSynthesisEvent), 10)
        setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 50)
      } else if (behaviour === 'endWithoutStart') {
        setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 5)
      }
    }),
  }
  Object.defineProperty(synth, 'speaking', { get: () => speaking })
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  class FakeUtterance {
    text: string
    lang = ''
    rate = 1
    pitch = 1
    voice: SpeechSynthesisVoice | null = null
    onstart: ((e: SpeechSynthesisEvent) => void) | null = null
    onend: ((e: SpeechSynthesisEvent) => void) | null = null
    onerror: ((e: SpeechSynthesisErrorEvent) => void) | null = null
    constructor(text: string) {
      this.text = text
    }
  }
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  return { synth, spoken }
}

describe('voz del botón Escuchar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    stopTTS()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('si la voz del móvil termina sin empezar (Chrome Android), lo intenta otra vez y suena', async () => {
    const { spoken } = installSynth(['endWithoutStart', 'ok'])
    const results: SpeakResult[] = []
    speakLocal('dzień dobry', 'Polaco', (r) => results.push(r))
    await vi.runAllTimersAsync()
    expect(spoken).toHaveLength(2)
    expect(results).toEqual([{ ok: true }])
  })

  it('si falla dos veces, avisa de que no se pudo', async () => {
    installSynth(['endWithoutStart', 'never'])
    const results: SpeakResult[] = []
    speakLocal('dzień dobry', 'Polaco', (r) => results.push(r))
    await vi.runAllTimersAsync()
    expect(results).toEqual([{ ok: false }])
  })

  it('parar no cuenta como fallo', async () => {
    installSynth(['never'])
    const results: SpeakResult[] = []
    speakLocal('dzień dobry', 'Polaco', (r) => results.push(r))
    await vi.advanceTimersByTimeAsync(100)
    stopTTS()
    await vi.runAllTimersAsync()
    expect(results).toEqual([{ ok: true, stopped: true }])
  })

  it('si Google no empieza a sonar, pasa a la voz del móvil', async () => {
    const { spoken } = installSynth(['ok'])
    vi.stubGlobal(
      'Audio',
      class {
        playbackRate = 1
        currentTime = 0
        onplaying: (() => void) | null = null
        onended: (() => void) | null = null
        onerror: (() => void) | null = null
        play() {
          return new Promise<void>(() => undefined) // se queda colgado
        }
        pause() {}
        removeAttribute() {}
      },
    )
    const results: SpeakResult[] = []
    speakNatural('dzień dobry', 'Polaco', (r) => results.push(r))
    await vi.runAllTimersAsync()
    expect(spoken).toEqual(['dzień dobry'])
    expect(results).toEqual([{ ok: true }])
  })
})
