import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  CREATION_WORDS_GOAL,
  IMPORTANCE_LEVELS,
  getImportance,
  getTodayProgress,
} from '../constants'
import {
  fetchSpellingSuggestion,
  fetchTranslation,
  fetchWordExample,
} from '../services/anthropic'
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
  const [saving, setSaving] = useState(false)
  const [suggestionNative, setSuggestionNative] = useState<string | null>(null)
  const [suggestionTarget, setSuggestionTarget] = useState<string | null>(null)
  const [loadingNative, setLoadingNative] = useState(false)
  const [loadingTarget, setLoadingTarget] = useState(false)
  const [spellingSuggestion, setSpellingSuggestion] = useState<string | null>(null)
  const [checkingSpelling, setCheckingSpelling] = useState(false)
  const targetDebounceRef = useRef<number | null>(null)
  const nativeDebounceRef = useRef<number | null>(null)
  const spellingDebounceRef = useRef<number | null>(null)
  const targetRequestRef = useRef(0)
  const nativeRequestRef = useRef(0)
  const spellingRequestRef = useRef(0)

  const recent = cards.slice(-5).reverse()
  const todayProgress = getTodayProgress(dailyProgress)

  const handleTargetChange = (value: string): void => {
    setTarget(value)
    setSuggestionNative(null)
    setSpellingSuggestion(null)
    targetRequestRef.current += 1
    spellingRequestRef.current += 1

    if (targetDebounceRef.current !== null) {
      window.clearTimeout(targetDebounceRef.current)
    }
    if (spellingDebounceRef.current !== null) {
      window.clearTimeout(spellingDebounceRef.current)
    }

    if (value.trim().length < 2) {
      setLoadingNative(false)
      setCheckingSpelling(false)
      return
    }

    const requestId = targetRequestRef.current
    targetDebounceRef.current = window.setTimeout(async () => {
      setLoadingNative(true)
      const result = await fetchTranslation(
        value.trim(),
        config.targetLang,
        config.nativeLang,
      )
      if (requestId !== targetRequestRef.current) return
      setSuggestionNative(result)
      setLoadingNative(false)
    }, 900)

    const spellingCandidate = value.trim()
    const looksLikeSingleWord = !spellingCandidate.includes(' ')
    if (!looksLikeSingleWord || spellingCandidate.length < 4) {
      setCheckingSpelling(false)
      return
    }

    const spellRequestId = spellingRequestRef.current
    spellingDebounceRef.current = window.setTimeout(async () => {
      setCheckingSpelling(true)
      const suggestion = await fetchSpellingSuggestion(
        spellingCandidate,
        config.targetLang,
      )
      if (spellRequestId !== spellingRequestRef.current) return

      const normalizedInput = spellingCandidate.toLowerCase()
      const normalizedSuggestion = suggestion?.toLowerCase() || ''
      setSpellingSuggestion(
        normalizedSuggestion && normalizedSuggestion !== normalizedInput
          ? suggestion
          : null,
      )
      setCheckingSpelling(false)
    }, 650)
  }

  const handleNativeChange = (value: string): void => {
    setNative(value)
    setSuggestionTarget(null)
    nativeRequestRef.current += 1

    if (nativeDebounceRef.current !== null) {
      window.clearTimeout(nativeDebounceRef.current)
    }

    if (value.trim().length < 2) {
      setLoadingTarget(false)
      return
    }

    const requestId = nativeRequestRef.current
    nativeDebounceRef.current = window.setTimeout(async () => {
      setLoadingTarget(true)
      const result = await fetchTranslation(
        value.trim(),
        config.nativeLang,
        config.targetLang,
      )
      if (requestId !== nativeRequestRef.current) return
      setSuggestionTarget(result)
      setLoadingTarget(false)
    }, 900)
  }

  const canSave = target.trim() && native.trim() && importance && !saving

  const handleSave = async (): Promise<void> => {
    if (!canSave || !importance) return
    setSaving(true)

    if (targetDebounceRef.current !== null) {
      window.clearTimeout(targetDebounceRef.current)
      targetDebounceRef.current = null
    }
    if (spellingDebounceRef.current !== null) {
      window.clearTimeout(spellingDebounceRef.current)
      spellingDebounceRef.current = null
    }
    if (nativeDebounceRef.current !== null) {
      window.clearTimeout(nativeDebounceRef.current)
      nativeDebounceRef.current = null
    }
    targetRequestRef.current += 1
    nativeRequestRef.current += 1
    spellingRequestRef.current += 1
    setLoadingNative(false)
    setLoadingTarget(false)
    setCheckingSpelling(false)
    setSuggestionNative(null)
    setSuggestionTarget(null)
    setSpellingSuggestion(null)

    const trimmedTarget = target.trim()
    const trimmedNative = native.trim()
    const example = await fetchWordExample(
      trimmedTarget,
      trimmedNative,
      config.targetLang,
      config.nativeLang,
      config.level || 'A2',
    )

    const nextCards: Lexicard[] = [
      ...cards,
      {
        id: generateId(),
        target: trimmedTarget,
        native: trimmedNative,
        targetLang: config.targetLang,
        nativeLang: config.nativeLang,
        examplePhrase: example?.phrase || null,
        exampleTranslation: example?.translation || null,
        importance,
        interval: 1,
        easeFactor: 2.5,
        streak: 0,
        lastReviewed: null,
        createdAt: Date.now(),
      },
    ]

    try {
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
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
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
          disabled={saving}
          placeholder={`Escribe en ${config.targetLang}...`}
          className='w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-60'
        />
        {(checkingSpelling || spellingSuggestion) && (
          <div className='mt-1.5 flex items-center gap-2 text-xs'>
            {checkingSpelling && (
              <span className='text-slate-500'>Revisando ortografia...</span>
            )}
            {!checkingSpelling && spellingSuggestion && (
              <>
                <span className='text-slate-500'>
                  *quizas querias escribir "{spellingSuggestion}"*
                </span>
                <button
                  type='button'
                  onClick={() => {
                    handleTargetChange(spellingSuggestion)
                    setSpellingSuggestion(null)
                  }}
                  className='rounded-md border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300'
                >
                  Usar
                </button>
              </>
            )}
          </div>
        )}
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
          disabled={saving}
          placeholder={`Escribe en ${config.nativeLang}...`}
          className='w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-60'
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
                onClick={() => !saving && setImportance(level.key)}
                disabled={saving}
                className={`min-w-[90px] flex-1 rounded-xl border-2 px-2 py-2.5 text-center transition ${
                  selected
                    ? IMPORTANCE_TONE[level.key]
                    : 'border-slate-800 bg-slate-950 text-slate-500'
                } disabled:cursor-not-allowed disabled:opacity-60`}
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
        {saving ? 'Guardando...' : saved ? '✓ ¡Guardada!' : 'Guardar palabra'}
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
