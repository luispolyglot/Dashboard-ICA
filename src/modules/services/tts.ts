import { LANG_CODES } from '../constants'

let ttsAudio: HTMLAudioElement | null = null

export function stopTTS(): void {
  if (ttsAudio) {
    ttsAudio.pause()
    ttsAudio.currentTime = 0
    ttsAudio = null
  }
  window.speechSynthesis?.cancel()
}

function getBestVoice(langCode: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const lang = langCode.split('-')[0]
  const matching = voices.filter((v) => v.lang.startsWith(lang))
  if (!matching.length) return null
  const premiumRe = /Natural|Premium|Enhanced|Neural|Online|Google|Wavenet/i
  const best = matching.find((v) => premiumRe.test(v.name))
  if (best) return best
  const remote = matching.find((v) => !v.localService)
  if (remote) return remote
  return matching.find((v) => v.lang === langCode) || matching[0]
}

function speakFallback(text: string, langCode: string, onEnd?: () => void): void {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = langCode
  u.rate = 0.85
  u.pitch = 1
  const voice = getBestVoice(langCode)
  if (voice) u.voice = voice
  u.onend = onEnd ? () => onEnd() : null
  u.onerror = onEnd ? () => onEnd() : null
  window.speechSynthesis.speak(u)
}

export function speakNatural(text: string, langName: string, onEnd?: () => void): void {
  stopTTS()
  const code = LANG_CODES[langName] || 'en-US'
  const lang = code.split('-')[0]
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`
  const audio = new Audio(url)
  ttsAudio = audio
  let finished = false
  let started = false

  const done = () => {
    if (finished) return
    finished = true
    ttsAudio = null
    if (onEnd) onEnd()
  }

  const fallback = () => {
    if (finished) return
    finished = true
    ttsAudio = null
    speakFallback(text, code, onEnd)
  }

  audio.onplaying = () => {
    started = true
  }

  audio.onended = done
  audio.onerror = () => {
    if (started || audio.currentTime > 0) {
      done()
      return
    }
    fallback()
  }
  audio.play().catch(fallback)
}
