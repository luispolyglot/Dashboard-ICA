import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  CREATION_WORDS_GOAL,
  IMPORTANCE_LEVELS,
  getImportance,
  getTodayProgress,
} from '../constants'
import { fetchTranslation } from '../services/anthropic'
import { recordWordAddedEvent } from '../services/gamification'
import { saveData } from '../services/storage'
import { generateId } from '../utils'
import { TranslationSuggestion } from '../components/TranslationSuggestion'
import type {
  AppConfig,
  DailyProgressMap,
  ImportanceKey,
  Lexicard,
} from '../types'

type AddViewProps = {
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  config: AppConfig
  dailyProgress: DailyProgressMap
  onWordAdded: () => Promise<void>
}

const IMPORTANCE_TONE: Record<ImportanceKey, string> = {
  vital: 'border-blue-500 text-blue-400 bg-blue-500/10',
  frequent: 'border-emerald-500 text-emerald-400 bg-emerald-500/10',
  occasional: 'border-amber-500 text-amber-400 bg-amber-500/10',
  rare: 'border-orange-500 text-orange-400 bg-orange-500/10',
  irrelevant: 'border-red-500 text-red-400 bg-red-500/10',
}

const IMPORTANCE_DOT: Record<ImportanceKey, string> = {
  vital: 'bg-blue-400',
  frequent: 'bg-emerald-400',
  occasional: 'bg-amber-400',
  rare: 'bg-orange-400',
  irrelevant: 'bg-red-400',
}

export function AddView({
  cards,
  setCards,
  config,
  dailyProgress,
  onWordAdded,
}: AddViewProps) {
  const [target, setTarget] = useState('')
  const [native, setNative] = useState('')
  const [importance, setImportance] = useState<ImportanceKey | null>(null)
  const [saved, setSaved] = useState(false)
  const [suggestionNative, setSuggestionNative] = useState<string | null>(null)
  const [suggestionTarget, setSuggestionTarget] = useState<string | null>(null)
  const [loadingNative, setLoadingNative] = useState(false)
  const [loadingTarget, setLoadingTarget] = useState(false)
  const targetDebounceRef = useRef<number | null>(null)
  const nativeDebounceRef = useRef<number | null>(null)

  const recent = cards.slice(-5).reverse()
  const todayProgress = getTodayProgress(dailyProgress)

  const handleTargetChange = (value: string): void => {
    setTarget(value)
    setSuggestionNative(null)

    if (targetDebounceRef.current !== null) {
      window.clearTimeout(targetDebounceRef.current)
    }

    if (value.trim().length < 2) return

    targetDebounceRef.current = window.setTimeout(async () => {
      setLoadingNative(true)
      const result = await fetchTranslation(
        value.trim(),
        config.targetLang,
        config.nativeLang,
      )
      setSuggestionNative(result)
      setLoadingNative(false)
    }, 900)
  }

  const handleNativeChange = (value: string): void => {
    setNative(value)
    setSuggestionTarget(null)

    if (nativeDebounceRef.current !== null) {
      window.clearTimeout(nativeDebounceRef.current)
    }

    if (value.trim().length < 2) return

    nativeDebounceRef.current = window.setTimeout(async () => {
      setLoadingTarget(true)
      const result = await fetchTranslation(
        value.trim(),
        config.nativeLang,
        config.targetLang,
      )
      setSuggestionTarget(result)
      setLoadingTarget(false)
    }, 900)
  }

  const canSave = target.trim() && native.trim() && importance

  const handleSave = async (): Promise<void> => {
    if (!canSave || !importance) return

    const nextCards: Lexicard[] = [
      ...cards,
      {
        id: generateId(),
        target: target.trim(),
        native: native.trim(),
        importance,
        interval: 1,
        easeFactor: 2.5,
        streak: 0,
        lastReviewed: null,
        createdAt: Date.now(),
      },
    ]

    setCards(nextCards)
    await saveData('dashboard-ICA-words', nextCards)
    await onWordAdded()
    try {
      await recordWordAddedEvent()
    } catch (error) {
      console.error(error)
    }

    setTarget('')
    setNative('')
    setImportance(null)
    setSuggestionNative(null)
    setSuggestionTarget(null)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <section className='mx-auto w-full max-w-xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-1 flex flex-wrap items-center justify-between gap-2'>
        <h2 className='font-serif text-3xl font-bold text-slate-100'>
          Añadir nueva palabra
        </h2>
        <div
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 ${
            todayProgress.wordsAdded >= CREATION_WORDS_GOAL
              ? 'border-violet-500/30 bg-violet-500/10 text-violet-400'
              : 'border-slate-700 bg-slate-800 text-slate-400'
          }`}
        >
          <span className='text-sm font-bold'>
            {todayProgress.wordsAdded}/{CREATION_WORDS_GOAL}
          </span>
          <span className='text-[11px]'>hoy</span>
          {todayProgress.wordsAdded >= CREATION_WORDS_GOAL && (
            <span className='text-xs'>✓</span>
          )}
        </div>
      </div>

      <p className='mb-7 text-sm text-slate-500'>
        Escribe en cualquier campo y la IA te sugiere la traduccion.
      </p>

      <div className='mb-5'>
        <label className='mb-2 block text-[11px] uppercase tracking-wider text-slate-400'>
          {config.targetLang}{' '}
          <span className='normal-case tracking-normal text-slate-600'>
            — idioma objetivo
          </span>
        </label>
        <input
          value={target}
          onChange={(e) => handleTargetChange(e.target.value)}
          placeholder={`Escribe en ${config.targetLang}...`}
          className='w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base text-slate-100 outline-none'
        />
        <TranslationSuggestion
          suggestion={suggestionNative}
          loading={loadingNative}
          label={`En ${config.nativeLang}`}
          onAccept={() => {
            if (suggestionNative) {
              setNative(suggestionNative)
              setSuggestionNative(null)
            }
          }}
        />
      </div>

      <div className='mb-6'>
        <label className='mb-2 block text-[11px] uppercase tracking-wider text-slate-400'>
          {config.nativeLang}{' '}
          <span className='normal-case tracking-normal text-slate-600'>
            — idioma materno
          </span>
        </label>
        <input
          value={native}
          onChange={(e) => handleNativeChange(e.target.value)}
          placeholder={`Escribe en ${config.nativeLang}...`}
          className='w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base text-slate-100 outline-none'
        />
        <TranslationSuggestion
          suggestion={suggestionTarget}
          loading={loadingTarget}
          label={`En ${config.targetLang}`}
          onAccept={() => {
            if (suggestionTarget) {
              setTarget(suggestionTarget)
              setSuggestionTarget(null)
            }
          }}
        />
      </div>

      <div className='mb-7'>
        <label className='mb-2 block text-[11px] uppercase tracking-wider text-slate-400'>
          Frecuencia de uso
        </label>
        <div className='flex flex-wrap gap-2'>
          {IMPORTANCE_LEVELS.map((level) => {
            const selected = importance === level.key
            return (
              <button
                key={level.key}
                type='button'
                onClick={() => setImportance(level.key)}
                className={`min-w-[90px] flex-1 rounded-xl border-2 px-2 py-2.5 text-center transition ${
                  selected
                    ? IMPORTANCE_TONE[level.key]
                    : 'border-slate-800 bg-slate-950 text-slate-500'
                }`}
              >
                <div className='mb-1 text-xs font-semibold'>{level.label}</div>
                <div className='text-[10px]'>{level.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      <button
        type='button'
        onClick={handleSave}
        disabled={!canSave}
        className={`w-full rounded-xl px-4 py-3 text-base font-semibold ${
          canSave
            ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white'
            : 'cursor-not-allowed bg-slate-800 text-slate-600'
        }`}
      >
        {saved ? '✓ ¡Guardada!' : 'Guardar palabra'}
      </button>

      {recent.length > 0 && (
        <div className='mt-10'>
          <h3 className='mb-3 text-[11px] uppercase tracking-wider text-slate-500'>
            Últimas añadidas
          </h3>
          {recent.map((card) => {
            const importanceMeta = getImportance(card.importance)
            return (
              <div
                key={card.id}
                className='mb-1.5 flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5'
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${IMPORTANCE_DOT[importanceMeta.key]}`}
                />
                <span className='text-sm text-slate-100'>{card.target}</span>
                <span className='text-slate-700'>→</span>
                <span className='text-sm text-slate-400'>{card.native}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
