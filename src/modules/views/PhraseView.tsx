import { useState } from 'react'
import type { ComponentType } from 'react'
import { getImportance } from '../constants'
import { fetchActivationPhrase } from '../services/anthropic'
import { speakNatural, stopTTS } from '../services/tts'
import type { ActivationPhraseResult, AppConfig, CEFRLevel, Lexicard } from '../types'

type PhraseViewProps = {
  cards: Lexicard[]
  config: AppConfig
  onPhraseGenerated: () => Promise<void>
  LevelBadge: ComponentType<{ level: CEFRLevel; size?: 'normal' | 'small' }>
}

const IMPORTANCE_DOT = {
  vital: 'bg-blue-400',
  frequent: 'bg-emerald-400',
  occasional: 'bg-amber-400',
  rare: 'bg-orange-400',
  irrelevant: 'bg-red-400',
} as const

export function PhraseView({ cards, config, onPhraseGenerated, LevelBadge }: PhraseViewProps) {
  const [wordCount, setWordCount] = useState(5)
  const [result, setResult] = useState<ActivationPhraseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  const level = config.level || 'A2'
  const recentWords = cards.slice(-8).reverse()
  const selectedWords = recentWords.slice(0, wordCount)

  const handleGenerate = async (): Promise<void> => {
    if (selectedWords.length < wordCount) return
    setLoading(true)
    setResult(null)
    const response = await fetchActivationPhrase(selectedWords, config.targetLang, config.nativeLang, level)
    setResult(response)
    setLoading(false)
    if (response) {
      await onPhraseGenerated()
    }
  }

  const handleSpeak = (): void => {
    if (!result?.phrase) return

    if (speaking) {
      stopTTS()
      setSpeaking(false)
      return
    }

    setSpeaking(true)
    speakNatural(result.phrase, config.targetLang, () => setSpeaking(false))
  }

  return (
    <section className='mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-5 py-8'>
      <h2 className='mb-1 font-serif text-3xl font-bold text-slate-100'>⚡ Frase de Activación</h2>
      <p className='mb-1 text-sm text-slate-500'>
        Genera una frase natural en {config.targetLang} usando tus palabras ICA.
      </p>

      <div className='mb-6 flex items-center gap-2'>
        <LevelBadge level={level} />
        <span className='text-xs text-slate-500'>· CEFR · Adaptado a tu nivel</span>
      </div>

      <div className='mb-6'>
        <label className='mb-2 block text-[11px] uppercase tracking-wider text-slate-400'>¿Cuántas palabras?</label>
        <div className='flex gap-2'>
          {[5, 6, 7, 8].map((n) => {
            const available = recentWords.length >= n
            const active = wordCount === n

            return (
              <button
                key={n}
                type='button'
                onClick={() => available && setWordCount(n)}
                className={`flex-1 rounded-xl border-2 px-2 py-3 text-center ${
                  !available
                    ? 'cursor-not-allowed border-slate-800 bg-slate-950 opacity-40'
                    : active
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-slate-800 bg-slate-950'
                }`}
              >
                <div className={`text-2xl font-bold ${active && available ? 'text-amber-400' : 'text-slate-500'}`}>{n}</div>
                <div className='text-[10px] text-slate-600'>palabras</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className='mb-6'>
        <label className='mb-2 block text-[11px] uppercase tracking-wider text-slate-400'>Palabras seleccionadas</label>
        <div className='flex flex-wrap gap-1.5'>
          {selectedWords.map((word) => {
            const importance = getImportance(word.importance)
            return (
              <div
                key={word.id}
                className='inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5'
              >
                <span className={`h-1.5 w-1.5 rounded-full ${IMPORTANCE_DOT[importance.key]}`} />
                <span className='text-sm font-semibold text-slate-100'>{word.target}</span>
                <span className='text-xs text-slate-500'>({word.native})</span>
              </div>
            )
          })}
        </div>
      </div>

      <button
        type='button'
        onClick={handleGenerate}
        disabled={loading || selectedWords.length < wordCount}
        className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-bold ${
          loading || selectedWords.length < wordCount
            ? 'cursor-not-allowed bg-slate-800 text-slate-500'
            : 'bg-gradient-to-r from-amber-500 to-orange-600 text-black'
        }`}
      >
        {loading ? (
          <>
            <span className='inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-slate-300' />
            Generando {level}...
          </>
        ) : (
          `⚡ Generar Frase · ${level}`
        )}
      </button>

      {result && (
        <article className='mt-7 overflow-hidden rounded-2xl border border-amber-500/30'>
          <div className='bg-gradient-to-br from-amber-950/50 to-slate-900 p-5'>
            <div className='mb-3 flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <span className='text-[11px] font-semibold uppercase tracking-wider text-amber-400'>{config.targetLang}</span>
                <LevelBadge level={level} size='small' />
              </div>
              <button
                type='button'
                onClick={handleSpeak}
                className='inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400'
              >
                {speaking ? 'Parando...' : 'Escuchar'}
              </button>
            </div>
            <p className='font-serif text-2xl font-bold leading-relaxed text-slate-100'>{result.phrase}</p>
          </div>

          <div className='border-t border-slate-800 bg-slate-950 p-5'>
            <span className='mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500'>
              {config.nativeLang}
            </span>
            <p className='text-base leading-relaxed text-slate-300'>{result.translation}</p>
          </div>

          {result.words_used && (
            <div className='border-t border-slate-800 bg-slate-950 px-5 py-3.5'>
              <div className='flex flex-wrap gap-1.5'>
                {result.words_used.map((word) => (
                  <span
                    key={word}
                    className='rounded-md bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400'
                  >
                    {word}
                  </span>
                ))}
              </div>
            </div>
          )}
        </article>
      )}

      {result && (
        <button
          type='button'
          onClick={handleGenerate}
          disabled={loading}
          className='mt-4 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-400'
        >
          🔄 Generar otra frase
        </button>
      )}
    </section>
  )
}
