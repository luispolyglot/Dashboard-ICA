import { useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { CopyIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RomanizationHint } from '../components/RomanizationHint'
import { SpeakButton } from '../components/SpeakButton'
import { getImportance } from '../constants'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { fetchActivationPhrase } from '../services/anthropic'
import { recordPhraseGeneratedEvent } from '../services/gamification'
import { fetchWordActivationCounts } from '../services/metaTracker'
import type {
  ActivationPhraseResult,
  AppConfig,
  CEFRLevel,
  Lexicard,
} from '../types'

type PhraseViewProps = {
  cards: Lexicard[]
  config: AppConfig
  onPhraseGenerated: () => Promise<{
    wordsAdded: number
    phraseGenerated: boolean
  }>
  onActivationWordsTotalChange: (activationWordsTotal: number) => void
  LevelBadge: ComponentType<{ level: CEFRLevel; size?: 'normal' | 'small' }>
}

const IMPORTANCE_DOT = {
  vital: 'bg-blue-400',
  frequent: 'bg-emerald-400',
  occasional: 'bg-amber-400',
  rare: 'bg-orange-400',
  irrelevant: 'bg-red-400',
} as const

export function PhraseView({
  cards,
  config,
  onPhraseGenerated,
  onActivationWordsTotalChange,
  LevelBadge,
}: PhraseViewProps) {
  const [wordCount, setWordCount] = useState(5)
  const [mode, setMode] = useState<'automatic' | 'manual' | 'manualPhrase'>(
    'automatic',
  )
  const [automaticSelectedIds, setAutomaticSelectedIds] = useState<string[]>([])
  const [manualSelectedIds, setManualSelectedIds] = useState<string[]>([])
  const [manualQuery, setManualQuery] = useState('')
  const [manualPhraseTarget, setManualPhraseTarget] = useState('')
  const [manualPhraseNative, setManualPhraseNative] = useState('')
  const [manualPhraseApproved, setManualPhraseApproved] = useState(false)
  const [result, setResult] = useState<ActivationPhraseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [wordUsageCounts, setWordUsageCounts] = useState<
    Record<string, number>
  >({})
  const [copyingResult, setCopyingResult] = useState(false)
  const [resultCopied, setResultCopied] = useState(false)

  const level = config.level || 'A1'
  const allWords = cards.slice().reverse()
  const automaticPool = cards.slice(-8).reverse()
  const manualPool = cards.slice(-25).reverse()

  useEffect(() => {
    const defaultIds = automaticPool.slice(0, wordCount).map((word) => word.id)
    setAutomaticSelectedIds(defaultIds)
  }, [wordCount, cards.length])

  useEffect(() => {
    setManualSelectedIds((prev) =>
      prev.filter((id) => allWords.some((word) => word.id === id)),
    )
  }, [cards])

  const minWordsRequired = 5

  const normalizeText = (value: string): string =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const includesAsWholeWord = (phrase: string, value: string): boolean => {
    if (!value) return false
    const regex = new RegExp(`(^|\\s)${escapeRegex(value)}(?=\\s|$)`, 'u')
    return regex.test(phrase)
  }

  const manualDetectedWords = useMemo(() => {
    if (!manualPhraseTarget.trim() && !manualPhraseNative.trim()) return []

    const normalizedTargetPhrase = normalizeText(manualPhraseTarget)
    const normalizedNativePhrase = normalizeText(manualPhraseNative)

    return allWords.filter((word) => {
      const targetToken = normalizeText(word.target)
      const nativeToken = normalizeText(word.native)

      if (!targetToken && !nativeToken) return false

      const matchesTarget = targetToken
        ? targetToken.length > 1
          ? includesAsWholeWord(normalizedTargetPhrase, targetToken)
          : normalizedTargetPhrase.includes(targetToken)
        : false

      const matchesNative = nativeToken
        ? nativeToken.length > 1
          ? includesAsWholeWord(normalizedNativePhrase, nativeToken)
          : normalizedNativePhrase.includes(nativeToken)
        : false

      return matchesTarget || matchesNative
    })
  }, [allWords, manualPhraseNative, manualPhraseTarget])

  const selectedWords =
    mode === 'manualPhrase'
      ? manualDetectedWords
      : mode === 'manual'
        ? allWords.filter((word) => manualSelectedIds.includes(word.id))
        : automaticPool.filter((word) => automaticSelectedIds.includes(word.id))

  useEffect(() => {
    let active = true

    fetchWordActivationCounts(
      cards.map((card) => card.id),
      config.targetLang,
      config.nativeLang,
    )
      .then((next) => {
        if (!active) return
        setWordUsageCounts(next)
      })
      .catch(() => {
        if (!active) return
        setWordUsageCounts({})
      })

    return () => {
      active = false
    }
  }, [cards, config.nativeLang, config.targetLang])

  const getUsageAuraClass = (lexicardId: string): string => {
    const usageCount = wordUsageCounts[lexicardId] || 0
    if (usageCount >= 3) {
      return '!border-amber-400/90 ring-1 ring-amber-300/60 bg-amber-500/12 shadow-[0_0_30px_-8px_rgba(251,191,36,0.95)]'
    }
    if (usageCount >= 1) {
      return '!border-amber-400/70 ring-1 ring-amber-300/35 bg-amber-500/8 shadow-[0_0_26px_-10px_rgba(251,191,36,0.75)]'
    }
    return ''
  }

  const searchableManualPool = manualQuery.trim() ? allWords : manualPool

  const filteredManualPool = searchableManualPool.filter((word) => {
    const q = manualQuery.trim().toLowerCase()
    if (!q) return true
    return (
      word.target.toLowerCase().includes(q) ||
      word.native.toLowerCase().includes(q)
    )
  })

  const toggleCustomWord = (id: string): void => {
    if (mode !== 'manual') return

    setManualSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id)
      }
      if (prev.length >= 8) {
        return prev
      }
      return [...prev, id]
    })
  }

  const handleGenerate = async (): Promise<void> => {
    if (
      mode === 'manualPhrase' &&
      (!manualPhraseTarget.trim() || !manualPhraseNative.trim())
    ) {
      return
    }
    if (selectedWords.length < minWordsRequired) return

    setLoading(true)
    setResult(null)
    setManualPhraseApproved(false)

    try {
      let response: ActivationPhraseResult | null = null
      if (mode === 'manualPhrase') {
        response = {
          phrase: manualPhraseTarget.trim(),
          translation: manualPhraseNative.trim(),
          words_used: selectedWords.map((word) => word.target),
        }
      } else {
        response = await fetchActivationPhrase(
          selectedWords,
          config.targetLang,
          config.nativeLang,
          level,
        )
      }

      setResult(response)
      if (response) {
        const progress = await onPhraseGenerated()
        const activationWordsTotal = await recordPhraseGeneratedEvent({
          wordIds: selectedWords.map((word) => word.id),
          words: selectedWords.map((word) => word.target),
          phrase: response.phrase,
          translation: response.translation,
          wordsAdded: progress.wordsAdded,
          targetLang: config.targetLang,
          nativeLang: config.nativeLang,
          source: mode === 'manualPhrase' ? 'manual' : 'generated',
        })
        if (typeof activationWordsTotal === 'number') {
          onActivationWordsTotalChange(activationWordsTotal)
        }
        setWordUsageCounts((prev) => {
          const next = { ...prev }
          selectedWords.forEach((word) => {
            next[word.id] = (next[word.id] || 0) + 1
          })
          return next
        })
        if (mode === 'manualPhrase') {
          setManualPhraseApproved(true)
        }
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const resetManualPhraseFlow = (): void => {
    setManualPhraseTarget('')
    setManualPhraseNative('')
    setManualPhraseApproved(false)
    setResult(null)
    setResultCopied(false)
  }

  const handlePrimaryAction = (): void => {
    if (mode === 'manualPhrase' && manualPhraseApproved) {
      resetManualPhraseFlow()
      return
    }
    void handleGenerate()
  }

  const removeSelectedWord = (id: string): void => {
    if (mode === 'manualPhrase') return

    if (mode === 'manual') {
      setManualSelectedIds((prev) => prev.filter((item) => item !== id))
      return
    }

    setAutomaticSelectedIds((prev) => prev.filter((item) => item !== id))
  }

  const handleCopyResultPhrase = async (): Promise<void> => {
    if (!result?.phrase || copyingResult) return

    setCopyingResult(true)
    try {
      await navigator.clipboard.writeText(result.phrase)
      setResultCopied(true)
      window.setTimeout(() => setResultCopied(false), 1400)
    } finally {
      setCopyingResult(false)
    }
  }

  return (
    <section className='mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-5 py-8'>
      <div className='mb-4 flex items-start justify-between gap-3'>
        <div>
          <h2 className='mb-1 font-serif text-3xl font-bold'>
            ⚡ Frase de Activación
          </h2>
          <p className='text-sm text-muted-foreground'>
            Genera una frase natural en {config.targetLang} usando tus palabras
            ICA.
          </p>
        </div>
        <Button asChild variant='outline' size='sm'>
          <Link to={DASHBOARD_ROUTES.phraseHistory}>📜 Historial</Link>
        </Button>
      </div>

      <div className='mb-6 flex items-center gap-2'>
        <LevelBadge level={level} />
        <span className='text-xs text-muted-foreground'>
          · CEFR · Adaptado a tu nivel
        </span>
      </div>

      <div className='mb-6'>
        <Tabs
          value={mode}
          onValueChange={(value) =>
            setMode(value as 'automatic' | 'manual' | 'manualPhrase')
          }
        >
          <TabsList className='grid w-full grid-cols-3'>
            <TabsTrigger value='automatic'>Automática</TabsTrigger>
            <TabsTrigger value='manual'>Palabras manual</TabsTrigger>
            <TabsTrigger value='manualPhrase'>Frase manual</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === 'automatic' && (
        <div className='mb-6'>
          <Label className='mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground'>
            Utiliza las últimas:
          </Label>
          <div className='flex gap-2'>
            {[5, 6, 7, 8].map((n) => {
              const available = automaticPool.length >= n
              const active = wordCount === n

              return (
                <Button
                  key={n}
                  type='button'
                  onClick={() => available && setWordCount(n)}
                  variant={active ? 'default' : 'outline'}
                  className='h-auto flex-1 py-3'
                  disabled={!available}
                >
                  <div className='text-center'>
                    <div className='text-2xl font-bold'>{n}</div>
                    <div
                      className={`text-[10px] ${active ? 'text-background' : 'text-muted-foreground'}`}
                    >
                      palabras
                    </div>
                  </div>
                </Button>
              )
            })}
          </div>
        </div>
      )}

      {mode === 'manual' && (
        <div className='mb-6 rounded-xl border border-border bg-muted/30 p-3.5'>
          <label className='mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground'>
            Selecciona palabras (5-8, últimas 25 por defecto)
          </label>

          <Input
            value={manualQuery}
            onChange={(event) => setManualQuery(event.target.value)}
            placeholder='Buscar palabra entre todas...'
            className='mb-3'
          />

          <div className='flex max-h-44 flex-wrap gap-1.5 overflow-y-auto'>
            {filteredManualPool.map((word) => {
              const active = manualSelectedIds.includes(word.id)
              const importance = getImportance(word.importance)
              return (
                <Button
                  key={word.id}
                  type='button'
                  onClick={() => toggleCustomWord(word.id)}
                  variant={active ? 'default' : 'outline'}
                  size='sm'
                  className={getUsageAuraClass(word.id)}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${IMPORTANCE_DOT[importance.key]}`}
                  />
                  {word.target}
                </Button>
              )
            })}
          </div>
          <p className='mt-2 text-[11px] text-muted-foreground'>
            Seleccionadas: {selectedWords.length}/8
          </p>
        </div>
      )}

      {mode === 'manualPhrase' && (
        <div className='mb-6 rounded-xl border border-border bg-muted/30 p-3.5'>
          <label className='mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground'>
            Escribe tu frase manual en ambos idiomas
          </label>

          <div className='space-y-3'>
            <div>
              <Label className='mb-1 block text-xs text-muted-foreground'>
                {config.targetLang}
              </Label>
              <textarea
                value={manualPhraseTarget}
                onChange={(event) => {
                  setManualPhraseApproved(false)
                  setManualPhraseTarget(event.target.value)
                }}
                placeholder={`Escribe la frase en ${config.targetLang}...`}
                className='min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              />
            </div>

            <div>
              <Label className='mb-1 block text-xs text-muted-foreground'>
                {config.nativeLang}
              </Label>
              <textarea
                value={manualPhraseNative}
                onChange={(event) => {
                  setManualPhraseApproved(false)
                  setManualPhraseNative(event.target.value)
                }}
                placeholder={`Escribe la frase en ${config.nativeLang}...`}
                className='min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              />
            </div>
          </div>

          <p className='mt-3 text-[11px] text-muted-foreground'>
            Detectadas automáticamente: {manualDetectedWords.length}. Se aprueba con
            mínimo {minWordsRequired} palabras ICA.
          </p>
        </div>
      )}

      <div className='mb-6'>
        <label className='mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground'>
          {mode === 'manualPhrase'
            ? 'Palabras ICA detectadas'
            : 'Palabras seleccionadas'}
        </label>
        <div className='flex flex-wrap gap-1.5'>
          {selectedWords.map((word) => {
            const importance = getImportance(word.importance)
            return (
              <div
                key={word.id}
                className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 ${getUsageAuraClass(word.id)}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${IMPORTANCE_DOT[importance.key]}`}
                />
                <span className='text-sm font-semibold'>{word.target}</span>
                <span className='text-xs text-muted-foreground'>
                  ({word.native})
                </span>
                {mode === 'manual' && (
                  <Button
                    type='button'
                    onClick={() => removeSelectedWord(word.id)}
                    variant='outline'
                    size='xs'
                  >
                    x
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <Button
        type='button'
        onClick={handlePrimaryAction}
        disabled={
          loading ||
          (mode !== 'manualPhrase' && selectedWords.length < minWordsRequired) ||
          (mode === 'manualPhrase' &&
            !manualPhraseApproved &&
            (selectedWords.length < minWordsRequired ||
              !manualPhraseTarget.trim() ||
              !manualPhraseNative.trim()))
        }
        className='h-11 w-full gap-2 text-base font-bold'
      >
        {loading ? (
          <>
            <span className='inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground' />
            {mode === 'manualPhrase' ? 'Registrando frase...' : `Generando ${level}...`}
          </>
        ) : (
          mode === 'manualPhrase'
            ? manualPhraseApproved
              ? '🔄 Generar otra frase manual'
              : `✅ Aprobar frase manual · ${selectedWords.length}/${minWordsRequired}`
            : `⚡ Generar Frase · ${level}`
        )}
      </Button>

      {result && (
        <article className='mt-7 overflow-hidden rounded-2xl border border-primary/30'>
          <div className='bg-linear-to-br from-primary/15 to-background p-5'>
            <div className='mb-3 flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <span className='text-[11px] font-semibold uppercase tracking-wider text-primary'>
                  {config.targetLang}
                </span>
                <LevelBadge level={level} size='small' />
              </div>
            </div>
            <p className='font-serif text-2xl font-bold leading-relaxed'>
              {result.phrase}
            </p>
            <RomanizationHint
              text={result.phrase}
              language={config.targetLang}
            />
            <SpeakButton
              text={result.phrase}
              langName={config.targetLang}
              color='#3B82F6'
              label={`Escuchar ${config.targetLang}`}
              className='mt-3'
            />
            <Button
              type='button'
              onClick={() => void handleCopyResultPhrase()}
              variant='outline'
              size='sm'
              className='mt-2'
            >
              <CopyIcon />
              {copyingResult
                ? 'Copiando...'
                : resultCopied
                  ? 'Copiadas'
                  : 'Copiar frases'}
            </Button>
          </div>

          <div className='border-t border-border bg-muted/20 p-5'>
            <span className='mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
              {config.nativeLang}
            </span>
            <p className='text-base leading-relaxed text-muted-foreground'>
              {result.translation}
            </p>
          </div>

          {result.words_used && (
            <div className='border-t border-border bg-muted/20 px-5 py-3.5'>
              <div className='flex flex-wrap gap-1.5'>
                {result.words_used.map((word) => (
                  <span
                    key={word}
                    className='rounded-md bg-primary/30 px-2.5 py-0.5 text-xs font-semibold text-white'
                  >
                    {word}
                  </span>
                ))}
              </div>
            </div>
          )}
        </article>
      )}

      {result && mode !== 'manualPhrase' && (
        <Button
          type='button'
          onClick={handleGenerate}
          disabled={loading}
          variant='outline'
          className='mt-4 w-full'
        >
          🔄 Generar otra frase
        </Button>
      )}
    </section>
  )
}
