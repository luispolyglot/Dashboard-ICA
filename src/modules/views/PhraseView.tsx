import { useEffect, useMemo, useState } from 'react'
import type { ComponentType, Dispatch, SetStateAction } from 'react'
import { CopyIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActivatePhraseInMasterNoteModal } from '../components/ActivatePhraseInMasterNoteModal'
import { ExplorePhraseTokenModal } from '../components/ExplorePhraseTokenModal'
import { ExtractWordsToVaultModal } from '../components/ExtractWordsToVaultModal'
import { InteractivePhraseText } from '../components/InteractivePhraseText'
import {
  MetaTrackerLevelUpModal,
  type MetaTrackerLevelUpCelebration,
} from '../components/MetaTracker/MetaTrackerLevelUpModal'
import { getMetaTrackerSnapshot } from '../components/MetaTracker/progress'
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
  DailyProgressEntry,
  Lexicard,
  MetaTrackerProfile,
} from '../types'

type PhraseViewProps = {
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  config: AppConfig
  onWordAdded: () => Promise<DailyProgressEntry>
  onPhraseGenerated: () => Promise<DailyProgressEntry>
  metaTrackerProfile: MetaTrackerProfile | null
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

const MAX_EXTRA_GENERATIONS = 2

export function PhraseView({
  cards,
  setCards,
  config,
  onWordAdded,
  onPhraseGenerated,
  metaTrackerProfile,
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
  const [manualOnlyNotActivated, setManualOnlyNotActivated] = useState(false)
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
  const [resultPhraseId, setResultPhraseId] = useState<string | null>(null)
  const [activateModalOpen, setActivateModalOpen] = useState(false)
  const [extractWordsModalOpen, setExtractWordsModalOpen] = useState(false)
  const [exploreModalOpen, setExploreModalOpen] = useState(false)
  const [exploreToken, setExploreToken] = useState('')
  const [extraGenerationsCount, setExtraGenerationsCount] = useState(0)
  const [levelUpCelebration, setLevelUpCelebration] =
    useState<MetaTrackerLevelUpCelebration | null>(null)

  const level = config.level || 'A1'
  const trackerSnapshot = metaTrackerProfile?.confirmedAt
    ? getMetaTrackerSnapshot(metaTrackerProfile, config.targetLang)
    : null
  const allWords = cards.slice().reverse()
  const automaticPool = cards.slice(-8).reverse()
  const manualPool = cards.slice(-25).reverse()
  const activationCountsByCardId = useMemo(() => {
    const map: Record<string, number> = {}
    cards.forEach((card) => {
      map[card.id] = Number(card.activationCount || 0)
    })
    return map
  }, [cards])

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

  const getUsageAuraClass = (lexicardId: string, active?: boolean): string => {
    const usageCount =
      wordUsageCounts[lexicardId] ?? activationCountsByCardId[lexicardId] ?? 0
    if (usageCount >= 3) {
      return `!border-amber-400/90 ring-1 ring-amber-300/60 ${!active && 'bg-amber-500/12'} shadow-[0_0_30px_-8px_rgba(251,191,36,0.95)]`
    }
    if (usageCount >= 1) {
      return `!border-amber-400/70 ring-1 ring-amber-300/35 ${!active && 'bg-amber-500/8'} shadow-[0_0_26px_-10px_rgba(251,191,36,0.75)]`
    }
    return ''
  }

  const searchableManualPool =
    manualQuery.trim() || manualOnlyNotActivated ? allWords : manualPool

  const filteredManualPool = searchableManualPool.filter((word) => {
    const q = manualQuery.trim().toLowerCase()
    const matchesQuery =
      !q ||
      word.target.toLowerCase().includes(q) ||
      word.native.toLowerCase().includes(q)
    if (!matchesQuery) return false
    if (!manualOnlyNotActivated) return true
    const activationCount =
      wordUsageCounts[word.id] ?? activationCountsByCardId[word.id] ?? 0
    return activationCount === 0
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

  const handleGenerate = async (options?: {
    isRegeneration?: boolean
  }): Promise<void> => {
    const isRegeneration = options?.isRegeneration === true

    if (isRegeneration && extraGenerationsCount >= MAX_EXTRA_GENERATIONS) {
      return
    }

    if (
      mode === 'manualPhrase' &&
      (!manualPhraseTarget.trim() || !manualPhraseNative.trim())
    ) {
      return
    }

    const hasLanguageMismatch = selectedWords.some((word) => {
      const mismatchedTarget =
        typeof word.targetLang === 'string' &&
        word.targetLang.trim() !== '' &&
        word.targetLang !== config.targetLang
      const mismatchedNative =
        typeof word.nativeLang === 'string' &&
        word.nativeLang.trim() !== '' &&
        word.nativeLang !== config.nativeLang

      return mismatchedTarget || mismatchedNative
    })

    if (hasLanguageMismatch) {
      toast.error('Detectamos palabras de otro idioma. Recarga e intenta de nuevo.')
      console.error('Blocked phrase generation due to language mismatch in selected words', {
        targetLang: config.targetLang,
        nativeLang: config.nativeLang,
        selectedWords: selectedWords.map((word) => ({
          id: word.id,
          target: word.target,
          native: word.native,
          targetLang: word.targetLang,
          nativeLang: word.nativeLang,
        })),
      })
      return
    }

    if (selectedWords.length < minWordsRequired) return

    setLoading(true)
    setResult(null)
    setResultPhraseId(null)
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
        const previousPhrase = isRegeneration ? result?.phrase : undefined
        response = await fetchActivationPhrase(
          selectedWords,
          config.targetLang,
          config.nativeLang,
          level,
          previousPhrase,
        )
      }

      setResult(response)
      if (response) {
        if (isRegeneration) {
          setExtraGenerationsCount((prev) => prev + 1)
        } else {
          setExtraGenerationsCount(0)
        }

        const { activationWordsTotal, phraseGenerationId } =
          await recordPhraseGeneratedEvent({
            wordIds: selectedWords.map((word) => word.id),
            words: selectedWords.map((word) => word.target),
            phrase: response.phrase,
            translation: response.translation,
            targetLang: config.targetLang,
            nativeLang: config.nativeLang,
            source: mode === 'manualPhrase' ? 'manual' : 'generated',
          })
        await onPhraseGenerated()
        setResultPhraseId(phraseGenerationId)
        if (typeof activationWordsTotal === 'number') {
          if (metaTrackerProfile?.confirmedAt && trackerSnapshot) {
            const nextSnapshot = getMetaTrackerSnapshot(
              {
                ...metaTrackerProfile,
                activationWordsTotal,
              },
              config.targetLang,
            )

            const crossedToNewLevel =
              nextSnapshot.currentLevelKey !== trackerSnapshot.currentLevelKey
            const wordsActivatedNow = Math.max(
              0,
              nextSnapshot.totalWords - trackerSnapshot.totalWords,
            )

            if (crossedToNewLevel && wordsActivatedNow > 0) {
              setLevelUpCelebration({
                targetLang: config.targetLang,
                fromLevel: trackerSnapshot.currentLevelKey,
                toLevel: nextSnapshot.currentLevelKey,
                fromTotalWords: trackerSnapshot.totalWords,
                toTotalWords: nextSnapshot.totalWords,
                activatedWords: wordsActivatedNow,
                nextLevel: nextSnapshot.nextLevelKey,
                wordsToNext: nextSnapshot.wordsToNext,
              })
            }
          }

          onActivationWordsTotalChange(activationWordsTotal)
        }
        setWordUsageCounts((prev) => {
          const next = { ...prev }
          selectedWords.forEach((word) => {
            const baseCount =
              next[word.id] ?? activationCountsByCardId[word.id] ?? 0
            next[word.id] = baseCount + 1
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
    setResultPhraseId(null)
    setResultCopied(false)
    setExtraGenerationsCount(0)
  }

  const openActivateModal = (): void => {
    if (!resultPhraseId) return
    setActivateModalOpen(true)
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
      const completedPhrase = result.phrase + '\n\n' + result.translation
      await navigator.clipboard.writeText(completedPhrase)
      setResultCopied(true)
      window.setTimeout(() => setResultCopied(false), 1400)
    } finally {
      setCopyingResult(false)
    }
  }

  const handleOpenExploreModal = (token: string): void => {
    if (!result?.phrase) return
    setExploreToken(token)
    setExploreModalOpen(true)
  }

  return (
    <section className='mx-auto w-full max-w-2xl flex-1 flex flex-col justify-center items-center p-4 pb-24'>
      <div className='mb-4 w-full flex items-start justify-between gap-3'>
        <div>
          <h2 className='mb-1 font-serif text-2xl lg:text-3xl font-bold'>
            🧩 Creación de Frases ICA
          </h2>
          <p className='text-sm text-muted-foreground'>
            Genera una frase natural en {config.targetLang} usando tus palabras
            ICA.
          </p>
        </div>
        <Button asChild variant='outline' size='sm' className='hidden lg:flex'>
          <Link to={DASHBOARD_ROUTES.phraseHistory}>📜 Historial</Link>
        </Button>
      </div>

      <div className='w-full mb-6 flex items-center gap-2'>
        <LevelBadge level={level} />
        <span className='text-xs text-muted-foreground'>
          · CEFR · Adaptado a tu nivel
        </span>
        <Button asChild variant='outline' size='sm' className='flex lg:hidden'>
          <Link to={DASHBOARD_ROUTES.phraseHistory}>📜 Historial</Link>
        </Button>
      </div>

      <div className='w-full mb-6'>
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
        <div className='mb-6 w-full'>
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
        <div className='mb-6 w-full rounded-xl border border-border bg-muted/30 p-3.5'>
          <label className='mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground'>
            Selecciona palabras (5-8,{' '}
            {!manualOnlyNotActivated ? 'últimas 25 por defecto' : 'todas'})
          </label>

          <Input
            value={manualQuery}
            onChange={(event) => setManualQuery(event.target.value)}
            placeholder='Buscar palabra entre todas...'
            className='mb-3'
          />

          <label className='mb-3 inline-flex items-center gap-2 text-xs text-muted-foreground'>
            <input
              type='checkbox'
              checked={manualOnlyNotActivated}
              onChange={(event) =>
                setManualOnlyNotActivated(event.target.checked)
              }
              className='h-4 w-4 accent-primary'
            />
            Mostrar solo palabras no activadas
          </label>

          <div className='flex max-h-44 flex-wrap gap-1.5 overflow-y-auto py-4'>
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
                  className={getUsageAuraClass(word.id, active)}
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
        <div className='mb-6 w-full rounded-xl border border-border bg-muted/30 p-3.5'>
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
                className='min-h-22 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
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
                className='min-h-22 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              />
            </div>
          </div>

          <p className='mt-3 text-[11px] text-muted-foreground'>
            Detectadas automáticamente: {manualDetectedWords.length}. Se aprueba
            con mínimo {minWordsRequired} palabras ICA.
          </p>
        </div>
      )}

      <div className='mb-6 w-full'>
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
          (mode !== 'manualPhrase' &&
            selectedWords.length < minWordsRequired) ||
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
            {mode === 'manualPhrase'
              ? 'Registrando frase...'
              : `Generando ${level}...`}
          </>
        ) : mode === 'manualPhrase' ? (
          manualPhraseApproved ? (
            '🔄 Generar otra frase manual'
          ) : (
            `✅ Guardar frase manual · ${selectedWords.length}/${minWordsRequired}`
          )
        ) : (
          `⚡ Generar Frase · ${level}`
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
            <InteractivePhraseText
              text={result.phrase}
              language={config.targetLang}
              onTokenClick={handleOpenExploreModal}
              className='font-serif text-2xl font-bold leading-relaxed'
            />
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

          {resultPhraseId && (
            <div className='border-t border-border bg-muted/20 p-5'>
              <div className='flex flex-col gap-2'>
                <Button
                  type='button'
                  onClick={() => setExtractWordsModalOpen(true)}
                  variant='secondary'
                  className='w-full'
                >
                  📦 Extraer nuevas palabras
                </Button>
                <Button
                  type='button'
                  onClick={openActivateModal}
                  variant='outline'
                  className='w-full'
                >
                  🗣️ Activar frase
                </Button>
              </div>
            </div>
          )}
        </article>
      )}

      {result &&
        mode !== 'manualPhrase' &&
        extraGenerationsCount < MAX_EXTRA_GENERATIONS && (
          <Button
            type='button'
            onClick={() => void handleGenerate({ isRegeneration: true })}
            disabled={loading}
            variant='outline'
            className='mt-2 w-full'
          >
            🔄 Generar otra frase
          </Button>
        )}

      <ActivatePhraseInMasterNoteModal
        open={activateModalOpen}
        phraseId={resultPhraseId}
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
        onOpenChange={setActivateModalOpen}
      />

      <MetaTrackerLevelUpModal
        open={Boolean(levelUpCelebration)}
        celebration={levelUpCelebration}
        onOpenChange={(open) => {
          if (!open) setLevelUpCelebration(null)
        }}
      />

      <ExtractWordsToVaultModal
        open={extractWordsModalOpen}
        onOpenChange={setExtractWordsModalOpen}
        text={result?.phrase || ''}
        translation={result?.translation || ''}
        seedWords={result?.words_used || []}
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
        level={level}
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
      />

      <ExplorePhraseTokenModal
        open={exploreModalOpen}
        onOpenChange={setExploreModalOpen}
        token={exploreToken}
        phrase={result?.phrase || ''}
        phraseTranslation={result?.translation || ''}
        targetLang={config.targetLang}
        nativeLang={config.nativeLang}
        level={level}
        cards={cards}
        setCards={setCards}
        onWordAdded={onWordAdded}
      />
    </section>
  )
}
