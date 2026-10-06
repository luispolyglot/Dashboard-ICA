import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import {
  CheckIcon,
  CopyIcon,
  HistoryIcon,
  ListChecksIcon,
  MicIcon,
  PenLineIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { langName, t, tn } from '@/i18n'
import {
  GamePage,
  GameProgress,
  IconTile,
  PageTitle,
  PhaseLetter,
  Pill,
  SectionLabel,
  tone,
  type Tone,
} from '../game/ui'
import { ActivatePhraseInMasterNoteModal } from '../components/ActivatePhraseInMasterNoteModal'
import {
  storeChallengeForNewPhrase,
  useChallengeEnabled,
} from '../services/challengeChunks'
import {
  MetaTrackerLevelUpModal,
  type MetaTrackerLevelUpCelebration,
} from '../components/MetaTracker/MetaTrackerLevelUpModal'
import { getMetaTrackerSnapshot } from '../components/MetaTracker/progress'
import { RomanizationHint } from '../components/RomanizationHint'
import { SpeakButton } from '../components/SpeakButton'
import { getImportance } from '../constants'
import { DASHBOARD_ROUTES } from '../routes/paths'
import {
  fetchActivationPhrase,
  type ManualPhraseReviewResult,
  fetchManualPhraseSuggestion,
} from '../services/anthropic'
import { recordPhraseGeneratedEvent } from '../services/gamification'
import { fetchWordActivationCounts } from '../services/metaTracker'
import type {
  ActivationPhraseResult,
  AppConfig,
  DailyProgressEntry,
  Lexicard,
  MetaTrackerProfile,
  StudyLevel,
} from '../types'
import { getEffectiveStudyLevel } from '../utils/studyLevel'
import { DailyLimitNotice } from '../game/DailyLimitNotice'
import { PendingActivationCard } from '../components/PendingActivationCard'
import { FirstUseTip, useFirstUseTip } from '../components/FirstUseTip'
import { usePendingActivationPhrase } from '../hooks/usePendingActivationPhrase'
import type { DailyLimitsState } from '../game/limits'

type PhraseViewProps = {
  cards: Lexicard[]
  config: AppConfig
  onPhraseGenerated: () => Promise<DailyProgressEntry>
  /** La C de hoy está hecha: solo entonces se recuerda la frase por activar. */
  creationDoneToday?: boolean
  metaTrackerProfile: MetaTrackerProfile | null
  onActivationWordsTotalChange: (activationWordsTotal: number) => void
  LevelBadge: ComponentType<{ level: StudyLevel; size?: 'normal' | 'small' }>
  /** Límite diario de frases nuevas (si no se pasa, no hay límite). */
  dailyLimits?: DailyLimitsState
}

const IMPORTANCE_DOT = {
  vital: 'bg-blue-400',
  frequent: 'bg-emerald-400',
  occasional: 'bg-amber-400',
  rare: 'bg-orange-400',
  irrelevant: 'bg-red-400',
} as const

const MAX_EXTRA_GENERATIONS = 2

type PhraseMode = 'automatic' | 'manual' | 'manualPhrase'

// Las tres formas de crear la frase (pestañas grandes).
const MODES: Array<{ value: PhraseMode; label: string; icon: typeof SparklesIcon }> = [
  { value: 'automatic', label: 'Automática', icon: SparklesIcon },
  { value: 'manual', label: 'Elijo palabras', icon: ListChecksIcon },
  { value: 'manualPhrase', label: 'La escribo yo', icon: PenLineIcon },
]

type WordTileState = 'idle' | 'selected' | 'detected'

/** Ficha grande de una palabra ICA (como una ficha de juego). Borde dorado si ya la usaste en frases. */
/** Words in tidy columns on the phone, smaller, so the button to create fits (Luis, 6 Oct). */
const WORD_GRID = 'grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2'

function WordTile({
  target,
  native,
  dotClass,
  usage,
  state = 'idle',
  onClick,
  onRemove,
}: {
  target: string
  native: string
  dotClass: string
  usage: number
  state?: WordTileState
  onClick?: () => void
  onRemove?: () => void
}) {
  let style: CSSProperties
  if (state === 'selected') {
    style = { background: 'var(--ica-c)', borderColor: 'var(--ica-c-edge)', color: '#fff', boxShadow: '0 3px 0 var(--ica-c-edge)' }
  } else if (state === 'detected') {
    style = {
      background: 'var(--ica-c-soft)',
      borderColor: 'var(--ica-c)',
      color: 'var(--ica-c-ink)',
      boxShadow: '0 3px 0 color-mix(in oklab, var(--ica-c) 45%, transparent)',
    }
  } else if (usage >= 3) {
    style = { background: 'var(--ica-gold-soft)', borderColor: 'var(--ica-gold)', boxShadow: '0 3px 0 var(--ica-gold-edge)' }
  } else if (usage >= 1) {
    style = { borderColor: 'var(--ica-gold)', boxShadow: '0 3px 0 color-mix(in oklab, var(--ica-gold) 60%, transparent)' }
  } else {
    style = { borderColor: 'var(--border)', boxShadow: '0 3px 0 var(--border)' }
  }

  const content = (
    <>
      {state === 'detected' ? (
        <CheckIcon className='size-4 shrink-0' strokeWidth={3.2} aria-hidden='true' />
      ) : (
        <span className={cn('size-2 shrink-0 rounded-full', dotClass)} aria-hidden='true' />
      )}
      <span className='flex min-w-0 flex-col'>
        <span className='text-[13.5px] leading-tight font-extrabold break-words sm:text-[15px]'>{target}</span>
        <span
          className={cn(
            'text-[11px] leading-tight font-semibold break-words sm:text-xs',
            state === 'selected' ? 'text-white/80' : state === 'detected' ? 'opacity-75' : 'text-muted-foreground',
          )}
        >
          {native}
        </span>
      </span>
      {onRemove ? (
        <button
          type='button'
          onClick={onRemove}
          aria-label={t('Quitar {word}', { word: target })}
          className='-mr-1 ml-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
        >
          <XIcon className='size-4' strokeWidth={3} aria-hidden='true' />
        </button>
      ) : null}
    </>
  )

  const classes = cn(
    'inline-flex w-full max-w-full min-w-0 min-h-10 items-center gap-1.5 rounded-xl border-2 bg-card px-2 py-1 text-left sm:w-auto sm:min-h-12 sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-1.5 dark:bg-transparent',
    onClick && 'ica-press cursor-pointer',
  )

  if (onClick) {
    return (
      <button type='button' onClick={onClick} aria-pressed={state === 'selected'} className={classes} style={style}>
        {content}
      </button>
    )
  }
  return (
    <div className={classes} style={style}>
      {content}
    </div>
  )
}

/** Leyenda del borde dorado. */
function UsageLegend() {
  return (
    <p className='m-0 mt-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground'>
      <span className='size-3.5 shrink-0 rounded-[5px] border-2' style={{ borderColor: 'var(--ica-gold)' }} aria-hidden='true' />
      {t('Borde dorado: ya la usaste en otras frases.')}
    </p>
  )
}

/** Bloque de la revisión IA (texto con fondo suave del color que toque). */
function ReviewBlock({ label, tone: toneKey, children }: { label?: ReactNode; tone?: Tone; children: ReactNode }) {
  const colors = toneKey ? tone(toneKey) : null
  return (
    <div className='rounded-2xl p-3.5' style={{ background: colors ? colors.soft : 'var(--muted)' }}>
      {label ? (
        <p
          className='m-0 text-[11px] font-extrabold tracking-[0.08em] uppercase'
          style={{ color: colors ? colors.ink : 'var(--muted-foreground)' }}
        >
          {label}
        </p>
      ) : null}
      <div className='mt-1 text-sm font-semibold' style={colors ? { color: colors.ink } : undefined}>
        {children}
      </div>
    </div>
  )
}

/** Longitud del principio común de dos palabras. */
function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let index = 0
  while (index < max && a[index] === b[index]) index += 1
  return index
}

/**
 * ¿Es la misma palabra aunque cambie la terminación? En polaco, alemán, ruso… las palabras
 * cambian según el caso («liść» → «liściu», «klawisz» → «klawisza»). Se da por buena si
 * empiezan igual y solo cambia el final. Las palabras cortas tienen que ser exactas.
 */
function sameWordForm(term: string, token: string): boolean {
  if (term === token) return true
  if (term.length < 4 || token.length < 3) return false
  if (token.length > term.length + 3) return false
  return commonPrefixLength(term, token) >= Math.max(3, term.length - 2)
}

/** Resalta en la frase las palabras ICA usadas, también si aparecen declinadas o conjugadas. */
function highlightUsedWords(phrase: string, words: string[] | undefined): ReactNode {
  const terms = Array.from(new Set((words || []).map((word) => word.trim()).filter(Boolean))).sort(
    (a, b) => b.length - a.length,
  )
  if (!terms.length) return phrase
  const normalize = (value: string) => value.normalize('NFC').toLocaleLowerCase()
  const tokens = Array.from(phrase.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)).map((match) => ({
    text: normalize(match[0]),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }))
  const used = new Array(tokens.length).fill(false)
  const spans: Array<{ start: number; end: number }> = []
  for (const term of terms) {
    const parts = normalize(term).split(/\s+/).filter(Boolean)
    if (!parts.length) continue
    for (let index = 0; index + parts.length <= tokens.length; index += 1) {
      let fits = true
      for (let offset = 0; offset < parts.length; offset += 1) {
        if (used[index + offset] || !sameWordForm(parts[offset], tokens[index + offset].text)) {
          fits = false
          break
        }
      }
      if (!fits) continue
      for (let offset = 0; offset < parts.length; offset += 1) used[index + offset] = true
      spans.push({ start: tokens[index].start, end: tokens[index + parts.length - 1].end })
    }
  }
  if (!spans.length) return phrase
  spans.sort((a, b) => a.start - b.start)
  const nodes: ReactNode[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) nodes.push(phrase.slice(cursor, span.start))
    nodes.push(
      <mark
        key={`${span.start}-${span.end}`}
        className='rounded-lg px-1 font-extrabold'
        style={{ background: 'color-mix(in oklab, var(--ica-c) 20%, transparent)', color: 'var(--ica-c-ink)' }}
      >
        {phrase.slice(span.start, span.end)}
      </mark>,
    )
    cursor = span.end
  }
  if (cursor < phrase.length) nodes.push(phrase.slice(cursor))
  return nodes
}

export function PhraseView({
  cards,
  config,
  onPhraseGenerated,
  creationDoneToday = false,
  metaTrackerProfile,
  onActivationWordsTotalChange,
  dailyLimits,
}: PhraseViewProps) {
  const challengeEnabled = useChallengeEnabled()
  // Límite diario de frases nuevas (2, o 4 con Creación ampliada hoy).
  // "No me convence, genera otra" no cuenta como frase nueva.
  const phraseLimitReached = dailyLimits?.isAtLimit('phrases') ?? false
  const [wordCount, setWordCount] = useState(5)
  const [mode, setMode] = useState<PhraseMode>('automatic')
  const [automaticSelectedIds, setAutomaticSelectedIds] = useState<string[]>([])
  const [manualSelectedIds, setManualSelectedIds] = useState<string[]>([])
  const [manualQuery, setManualQuery] = useState('')
  const [manualOnlyNotActivated, setManualOnlyNotActivated] = useState(false)
  const [manualPhraseTarget, setManualPhraseTarget] = useState('')
  const [manualPhraseNative, setManualPhraseNative] = useState('')
  const [manualPhraseApproved, setManualPhraseApproved] = useState(false)
  const [manualSuggestionLoading, setManualSuggestionLoading] = useState(false)
  const [manualSuggestionModalOpen, setManualSuggestionModalOpen] =
    useState(false)
  const [manualSuggestionReview, setManualSuggestionReview] =
    useState<ManualPhraseReviewResult | null>(null)
  const [result, setResult] = useState<ActivationPhraseResult | null>(null)
  // A phrase made in this visit: then the «max reached» notice stays hidden (Luis, 6 Oct).
  const [createdThisVisit, setCreatedThisVisit] = useState(false)
  // First-use bubbles that walk a new icademer to the next button (Luis, 6 Oct).
  const [generateTipPending, closeGenerateTip] = useFirstUseTip('phrase-generate')
  const [activateTipPending, closeActivateTip] = useFirstUseTip('phrase-activate')
  // One tip per mode, so seeing the Automática one does not hide the others (Luis, 6 Oct).
  const [pickTipPending, closePickTip] = useFirstUseTip('phrase-pick-words')
  const [generatePickedTipPending, closeGeneratePickedTip] = useFirstUseTip('phrase-generate-picked')
  const [reviewTipPending, closeReviewTip] = useFirstUseTip('phrase-write-review')
  const [loading, setLoading] = useState(false)
  const [wordUsageCounts, setWordUsageCounts] = useState<
    Record<string, number>
  >({})
  const [copyingResult, setCopyingResult] = useState(false)
  const [resultCopied, setResultCopied] = useState(false)
  const [resultPhraseId, setResultPhraseId] = useState<string | null>(null)
  const pendingActivationPhrase = usePendingActivationPhrase(config.targetLang, resultPhraseId)
  const [activateModalOpen, setActivateModalOpen] = useState(false)
  const [extraGenerationsCount, setExtraGenerationsCount] = useState(0)
  const [levelUpCelebration, setLevelUpCelebration] =
    useState<MetaTrackerLevelUpCelebration | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)

  // Al salir la frase, la llevamos a la vista (la tarjeta de resultado queda abajo).
  useEffect(() => {
    if (!result) return
    const node = resultRef.current
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [result])

  const level = getEffectiveStudyLevel(config.targetLang, metaTrackerProfile)
  const trackerSnapshot = metaTrackerProfile?.confirmedAt
    ? getMetaTrackerSnapshot(metaTrackerProfile, config.targetLang)
    : null
  const allWords = cards.slice().reverse()
  const automaticPool = cards.slice(-8).reverse()
  const manualPool = cards.slice(-25).reverse()
  const manualPhraseGuidePool = cards.slice(-10).reverse()
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
    value.normalize('NFKC').toLowerCase().trim()

  const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const includesAsWholeWord = (phrase: string, value: string): boolean => {
    if (!value) return false
    const regex = new RegExp(
      `(^|[^\\p{L}\\p{N}'-])${escapeRegex(value)}(?=$|[^\\p{L}\\p{N}'-])`,
      'u',
    )
    return regex.test(phrase)
  }

  const manualDetectedWords = useMemo(() => {
    if (!manualPhraseTarget.trim()) return []

    const normalizedTargetPhrase = normalizeText(manualPhraseTarget)

    return allWords.filter((word) => {
      const targetToken = normalizeText(word.target)

      if (!targetToken) return false

      const matchesTarget = targetToken
        ? includesAsWholeWord(normalizedTargetPhrase, targetToken)
        : false

      return matchesTarget
    })
  }, [allWords, manualPhraseTarget])

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

  // Veces que la palabra ya salió en frases (borde dorado en su ficha).
  const getUsageCount = (lexicardId: string): number =>
    wordUsageCounts[lexicardId] ?? activationCountsByCardId[lexicardId] ?? 0

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

    if (!isRegeneration && phraseLimitReached && dailyLimits) {
      toast.info(
        t('Hoy ya creaste {n} frases nuevas, el máximo del día.', { n: dailyLimits.limits.phrases }),
      )
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
      toast.error(t('Detectamos palabras de otro idioma. Recarga e intenta de nuevo.'))
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
        setCreatedThisVisit(true)
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
        // Nota desafiante: guardar los trozos de la frase (sin bloquear la pantalla).
        if (challengeEnabled && phraseGenerationId) {
          void storeChallengeForNewPhrase({
            phraseId: phraseGenerationId,
            result: response,
            isManual: mode === 'manualPhrase',
          }).catch((error) => {
            console.error('[nota desafiante] no se pudieron guardar los trozos', error)
          })
        }
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
      const message = error instanceof Error ? error.message : ''
      if (message.includes('DAILY_LIMIT_PHRASES')) {
        setResult(null)
        setResultPhraseId(null)
        toast.error(t('Has alcanzado el límite diario de frases.'))
      }
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

  const handleManualPhraseSuggestion = async (): Promise<void> => {
    if (manualSuggestionLoading) return

    const targetPhrase = manualPhraseTarget.trim()
    const nativePhrase = manualPhraseNative.trim()
    const requiredWords = manualDetectedWords.map((word) => word.target)

    if (!targetPhrase || !nativePhrase || requiredWords.length === 0) return

    setManualSuggestionLoading(true)

    try {
      const suggestion = await fetchManualPhraseSuggestion(
        targetPhrase,
        nativePhrase,
        requiredWords,
        config.targetLang,
        config.nativeLang,
      )

      if (!suggestion) {
        toast.error(t('No pudimos revisar la frase por ahora. Intenta de nuevo.'))
        return
      }

      setManualSuggestionReview(suggestion)
      setManualSuggestionModalOpen(true)
    } catch (error) {
      console.error(error)
      toast.error(t('No pudimos generar sugerencia por ahora. Intenta de nuevo.'))
    } finally {
      setManualSuggestionLoading(false)
    }
  }

  const handleUseManualSuggestion = (): void => {
    if (!manualSuggestionReview?.suggestion) return
    setManualPhraseApproved(false)
    setManualPhraseTarget(manualSuggestionReview.suggestion)
    if (manualSuggestionReview.nativeSuggestion) {
      setManualPhraseNative(manualSuggestionReview.nativeSuggestion)
    }
    setManualSuggestionModalOpen(false)
  }

  // --- Datos para pintar ---
  const isManualPhrase = mode === 'manualPhrase'
  const limitUsed = dailyLimits
    ? Math.min(dailyLimits.used.phrases, dailyLimits.limits.phrases)
    : 0
  const limitMax = dailyLimits?.limits.phrases ?? 0
  const detectedCount = manualDetectedWords.length
  const detectedIds = new Set(manualDetectedWords.map((word) => word.id))
  const enoughDetected = detectedCount >= minWordsRequired
  const primaryDisabled =
    loading ||
    (phraseLimitReached && !(mode === 'manualPhrase' && manualPhraseApproved)) ||
    (mode !== 'manualPhrase' && selectedWords.length < minWordsRequired) ||
    (mode === 'manualPhrase' &&
      !manualPhraseApproved &&
      (selectedWords.length < minWordsRequired ||
        !manualPhraseTarget.trim() ||
        !manualPhraseNative.trim()))
  const wordsInView =
    mode === 'manualPhrase'
      ? manualPhraseGuidePool
      : mode === 'manual'
        ? [...filteredManualPool, ...selectedWords]
        : selectedWords
  const showUsageLegend = wordsInView.some((word) => getUsageCount(word.id) >= 1)
  const regenerationsLeft = MAX_EXTRA_GENERATIONS - extraGenerationsCount

  const renderTile = (
    word: Lexicard,
    options: { state?: WordTileState; onClick?: () => void; onRemove?: () => void } = {},
  ) => (
    <WordTile
      key={word.id}
      target={word.target}
      native={word.native}
      dotClass={IMPORTANCE_DOT[getImportance(word.importance).key]}
      usage={getUsageCount(word.id)}
      state={options.state}
      onClick={options.onClick}
      onRemove={options.onRemove}
    />
  )

  return (
    <GamePage>
      {/* Cabecera de la fase C */}
      <PageTitle
        icon={<PhaseLetter letter='C' size={48} />}
        subtitle={t('Crea una frase en {lang} con tus palabras ICA', { lang: langName(config.targetLang) })}
        right={
          <Button asChild variant='outline' size='sm'>
            <Link to={DASHBOARD_ROUTES.phraseHistory} aria-label={t('Historial de frases')}>
              <HistoryIcon strokeWidth={2.6} aria-hidden='true' />
              {t('Historial')}
            </Link>
          </Button>
        }
      >
        {t('Creación')}
      </PageTitle>

      {/* Si hoy ya se hizo la C y esa frase aún no se grabó, se recuerda aquí con un botón directo */}
      {!result && creationDoneToday && pendingActivationPhrase ? (
        <PendingActivationCard
          dismissible
          phrase={pendingActivationPhrase}
          targetLang={config.targetLang}
          nativeLang={config.nativeLang}
        />
      ) : null}

      {/* Contador del día: fino en el móvil (Luis, 6 oct), número y nivel en una sola fila */}
      <div className='-mt-1 rounded-2xl px-4 pt-2.5 pb-3 lg:rounded-3xl lg:px-5 lg:py-4' style={{ background: 'var(--ica-c-soft)' }}>
        <div className='flex items-center justify-between gap-3'>
          {dailyLimits ? (
            <p className='m-0 flex min-w-0 items-baseline gap-1.5 leading-none font-black tabular-nums' style={{ color: 'var(--ica-c-ink)' }}>
              <span className='text-[26px] lg:text-5xl'>{limitUsed}</span>
              <span className='text-base opacity-60 lg:text-2xl'>/ {limitMax}</span>
              <span className='ml-1 truncate text-[11px] font-extrabold tracking-[0.08em] uppercase lg:text-xs'>
                {t('Frases nuevas hoy')}
              </span>
            </p>
          ) : (
            <p className='m-0 text-lg leading-tight font-black tracking-tight lg:text-2xl' style={{ color: 'var(--ica-c-ink)' }}>
              {t('Adaptada a tu nivel')}
            </p>
          )}
          <span className='flex shrink-0 items-center gap-1.5'>
            <span className='text-[11px] font-extrabold tracking-[0.06em] uppercase' style={{ color: 'var(--ica-c-ink)' }}>
              {t('Tu nivel')}
            </span>
            <span
              className='flex h-8 min-w-11 items-center justify-center rounded-xl px-2 text-sm font-black text-white lg:h-11 lg:min-w-14 lg:text-lg'
              style={{ background: 'var(--ica-c)', boxShadow: '0 3px 0 var(--ica-c-edge)' }}
            >
              {level}
            </span>
          </span>
        </div>
        {dailyLimits ? (
          <>
            <GameProgress
              value={limitMax > 0 ? limitUsed / limitMax : 0}
              color='var(--ica-c)'
              height={12}
              className='mt-2.5 bg-card lg:mt-4'
              label={t('Frases nuevas de hoy')}
            />
            <div className='mt-2 hidden flex-wrap items-center gap-2 lg:flex'>
              <p className='m-0 text-xs font-semibold text-muted-foreground'>
                {t('Pedir otra versión no cuenta.')}
              </p>
              {dailyLimits.boosted.phrases ? (
                <Pill tone='c' solid>
                  {t('AMPLIADA HOY')}
                </Pill>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {/* Cómo quieres crearla */}
      <div>
        <div
          role='tablist'
          aria-label={t('Cómo quieres crear la frase')}
          className='grid grid-cols-3 gap-2'
        >
          {MODES.map((item) => {
            const active = mode === item.value
            const Icon = item.icon
            return (
              <button
                key={item.value}
                type='button'
                role='tab'
                aria-selected={active}
                aria-label={t(item.label)}
                onClick={() => setMode(item.value)}
                className={cn(
                  'ica-press flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1.5 py-1.5 text-center transition-colors lg:min-h-[84px] lg:gap-1.5 lg:py-2.5',
                  !active && 'border-border bg-card text-muted-foreground hover:bg-muted dark:bg-transparent',
                )}
                style={
                  active
                    ? {
                        borderColor: 'var(--ica-c)',
                        background: 'var(--ica-c-soft)',
                        color: 'var(--ica-c-ink)',
                        boxShadow: '0 4px 0 var(--ica-c-edge)',
                      }
                    : { boxShadow: '0 4px 0 var(--border)' }
                }
              >
                <Icon className='size-[18px] lg:size-6' strokeWidth={2.6} aria-hidden='true' />
                <span className='text-[12.5px] leading-tight font-extrabold lg:text-[13px]'>{t(item.label)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* La IA la crea: con cuántas palabras */}
      {mode === 'automatic' && (
        <div>
          <SectionLabel>{t('Usa tus últimas')}</SectionLabel>
          <div className='grid grid-cols-4 gap-2'>
            {[5, 6, 7, 8].map((n) => {
              const available = automaticPool.length >= n
              const active = wordCount === n

              return (
                <button
                  key={n}
                  type='button'
                  onClick={() => available && setWordCount(n)}
                  disabled={!available}
                  aria-pressed={active}
                  className={cn(
                    'ica-press flex h-12 flex-col items-center justify-center rounded-2xl border-2 disabled:opacity-40 lg:h-[72px]',
                    !active && 'border-border bg-card dark:bg-transparent',
                  )}
                  style={
                    active
                      ? {
                          background: 'var(--ica-c)',
                          borderColor: 'var(--ica-c-edge)',
                          color: '#fff',
                          boxShadow: '0 4px 0 var(--ica-c-edge)',
                        }
                      : { boxShadow: '0 4px 0 var(--border)' }
                  }
                >
                  <span className='text-lg leading-none font-black tabular-nums lg:text-2xl'>{n}</span>
                  <span
                    className={cn(
                      'mt-0.5 text-[10px] font-bold lg:mt-1 lg:text-[11px]',
                      active ? 'text-white/85' : 'text-muted-foreground',
                    )}
                  >
                    {t('palabras')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Elijo palabras: buscador y fichas para tocar */}
      {mode === 'manual' && (
        <div className='ica-panel p-3 lg:p-4'>
          <SectionLabel
            right={
              <Pill tone={selectedWords.length >= minWordsRequired ? 'ok' : 'c'}>
                {selectedWords.length}/8
              </Pill>
            }
          >
            {t('Elige de 5 a 8 palabras')}
          </SectionLabel>

          <div className='relative'>
            <SearchIcon
              className='pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground'
              strokeWidth={2.6}
              aria-hidden='true'
            />
            <Input
              value={manualQuery}
              onChange={(event) => setManualQuery(event.target.value)}
              placeholder={t('Buscar palabra entre todas...')}
              className='pl-10'
              aria-label={t('Buscar palabra')}
            />
          </div>

          <button
            type='button'
            role='switch'
            aria-checked={manualOnlyNotActivated}
            onClick={() => setManualOnlyNotActivated((prev) => !prev)}
            className='mt-2 mb-2 flex items-center gap-2.5 text-left text-[13px] font-bold lg:mt-3 lg:mb-0 lg:text-sm'
          >
            <span
              className='relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors'
              style={{ background: manualOnlyNotActivated ? 'var(--ica-c)' : 'var(--border-strong)' }}
              aria-hidden='true'
            >
              <span
                className='absolute size-4.5 rounded-full bg-white transition-[left]'
                style={{ left: manualOnlyNotActivated ? 19 : 3 }}
              />
            </span>
            {t('Mostrar solo palabras no activadas')}
          </button>

          <p className='m-0 mt-3 mb-2 hidden text-xs font-semibold text-muted-foreground lg:block'>
            {manualOnlyNotActivated || manualQuery.trim()
              ? t('Buscando entre todas tus palabras')
              : t('Tus últimas 25 palabras')}
          </p>
          {/* Lista desplazable: se difumina abajo para indicar que hay más */}
          <div className='relative'>
          {pickTipPending && manualSelectedIds.length === 0 && filteredManualPool.length > 0 ? (
            <FirstUseTip onClose={closePickTip}>
              {t('Toca de 5 a 8 palabras de tu lista y luego toca Generar frase.')}
            </FirstUseTip>
          ) : null}
          <div
            className={cn(WORD_GRID, '-mx-1 max-h-44 overflow-y-auto px-1 pt-1 pb-6 lg:max-h-80')}
            style={{
              maskImage: 'linear-gradient(to bottom, #000 calc(100% - 2.5rem), transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 2.5rem), transparent)',
            }}
          >
            {filteredManualPool.map((word) =>
              renderTile(word, {
                state: manualSelectedIds.includes(word.id) ? 'selected' : 'idle',
                onClick: () => {
                  if (pickTipPending) closePickTip()
                  toggleCustomWord(word.id)
                },
              }),
            )}
            {filteredManualPool.length === 0 ? (
              <p className='m-0 py-2 text-sm font-semibold text-muted-foreground'>
                {t('No hay palabras con ese filtro.')}
              </p>
            ) : null}
          </div>
          </div>
          {showUsageLegend ? <UsageLegend /> : null}
        </div>
      )}

      {/* La escribo yo: palabras para usar, frase y detección */}
      {mode === 'manualPhrase' && (
        <>
          <div>
            <SectionLabel>{t('Usa al menos 5 de tus palabras')}</SectionLabel>
            {manualPhraseGuidePool.length > 0 ? (
              <>
                <div className={WORD_GRID}>
                  {manualPhraseGuidePool.map((word) =>
                    renderTile(word, { state: detectedIds.has(word.id) ? 'detected' : 'idle' }),
                  )}
                </div>
                <p className='m-0 mt-3 hidden text-xs font-semibold text-muted-foreground lg:block'>
                  {t('Tus últimas 10 palabras ICA: se marcan al usarlas en tu frase.')}
                </p>
                {showUsageLegend ? <UsageLegend /> : null}
              </>
            ) : (
              <p className='m-0 text-sm font-semibold text-muted-foreground'>
                {t('Aún no hay palabras ICA para mostrar.')}
              </p>
            )}
          </div>

          <div className='ica-panel p-4'>
            <label htmlFor='phrase-manual-target' className='mb-2 flex items-center gap-2'>
              <Pill tone='c' solid>
                {langName(config.targetLang)}
              </Pill>
              <span className='text-xs font-bold text-muted-foreground'>{t('Tu frase')}</span>
            </label>
            <Textarea
              id='phrase-manual-target'
              value={manualPhraseTarget}
              onChange={(event) => {
                setManualPhraseApproved(false)
                setManualSuggestionReview(null)
                setManualPhraseTarget(event.target.value)
              }}
              placeholder={t('Escribe la frase en {lang}...', { lang: langName(config.targetLang) })}
              className='min-h-20 rounded-2xl text-base font-bold md:text-base lg:min-h-28 lg:text-lg'
            />

            <label htmlFor='phrase-manual-native' className='mt-4 mb-2 flex items-center gap-2'>
              <Pill tone='neutral'>{langName(config.nativeLang)}</Pill>
              <span className='text-xs font-bold text-muted-foreground'>{t('Su traducción')}</span>
            </label>
            <Textarea
              id='phrase-manual-native'
              value={manualPhraseNative}
              onChange={(event) => {
                setManualPhraseApproved(false)
                setManualSuggestionReview(null)
                setManualPhraseNative(event.target.value)
              }}
              placeholder={t('Escribe la frase en {lang}...', { lang: langName(config.nativeLang) })}
              className='min-h-16 rounded-2xl lg:min-h-20'
            />

            {/* Paso opcional: revisión con IA */}
            <div className='relative mt-3 flex flex-wrap items-center justify-between gap-2'>
              {reviewTipPending && !manualSuggestionLoading ? (
                <FirstUseTip align='end' side='bottom' onClose={closeReviewTip}>
                  {t('Cuando escribas tu frase y su traducción, toca aquí y la IA revisa tu gramática.')}
                </FirstUseTip>
              ) : null}
              <span className='text-xs font-semibold text-muted-foreground'>{t('Opcional')}</span>
              <Button
                type='button'
                onClick={() => {
                  if (reviewTipPending) closeReviewTip()
                  void handleManualPhraseSuggestion()
                }}
                variant='outline'
                size='sm'
                disabled={
                  manualSuggestionLoading ||
                  !manualPhraseTarget.trim() ||
                  !manualPhraseNative.trim() ||
                  manualDetectedWords.length === 0
                }
              >
                <SparklesIcon strokeWidth={2.6} aria-hidden='true' />
                {manualSuggestionLoading ? t('Analizando frase...') : t('Revisar gramática con IA')}
              </Button>
            </div>
          </div>

          {/* Detección en directo */}
          <div>
            <div className='flex items-center gap-4'>
              <p
                className='m-0 shrink-0 leading-none font-black tabular-nums'
                style={{ color: enoughDetected ? 'var(--ica-ok-ink)' : 'var(--ica-c-ink)' }}
              >
                <span className='text-4xl'>{detectedCount}</span>
                <span className='text-xl opacity-60'>/{minWordsRequired}</span>
              </p>
              <div className='min-w-0 flex-1'>
                <GameProgress
                  value={Math.min(1, detectedCount / minWordsRequired)}
                  color={enoughDetected ? 'var(--ica-ok)' : 'var(--ica-c)'}
                  label={t('Palabras ICA detectadas')}
                />
                <p className='m-0 mt-1.5 text-xs font-bold text-muted-foreground'>
                  {t('Detectadas automáticamente: {n}.', { n: detectedCount })}{' '}
                  {enoughDetected
                    ? t('¡Ya puedes guardarla!')
                    : tn(minWordsRequired - detectedCount, 'Te falta {n} para guardarla.', 'Te faltan {n} para guardarla.')}
                </p>
              </div>
            </div>
            {selectedWords.length > 0 ? (
              <div className='mt-3 hidden flex-wrap gap-2 lg:flex'>
                {selectedWords.map((word) => renderTile(word, { state: 'detected' }))}
              </div>
            ) : null}
          </div>
        </>
      )}

      {/* Palabras con las que se creará la frase */}
      {mode !== 'manualPhrase' && (
        <div className={mode === 'manual' ? 'hidden lg:block' : undefined}>
          <SectionLabel
            right={
              <Pill tone='c'>
                {tn(selectedWords.length, '{n} palabra', '{n} palabras')}
              </Pill>
            }
          >
            {mode === 'manual' ? t('Tu selección') : t('Palabras seleccionadas')}
          </SectionLabel>
          {selectedWords.length > 0 ? (
            <div className={WORD_GRID}>
              {selectedWords.map((word) =>
                renderTile(word, {
                  onRemove: mode === 'manual' ? () => removeSelectedWord(word.id) : undefined,
                }),
              )}
            </div>
          ) : (
            <p className='m-0 text-sm font-semibold text-muted-foreground'>
              {mode === 'manual'
                ? t('Toca palabras de la lista para elegirlas.')
                : t('Aún no hay palabras para crear la frase.')}
            </p>
          )}
          {mode === 'automatic' && showUsageLegend ? <UsageLegend /> : null}
        </div>
      )}

      {/* Sin palabras suficientes: ir a Inmersión */}
      {cards.length < minWordsRequired ? (
        <div
          className='flex items-center gap-3 rounded-3xl px-4 py-3.5'
          style={{ background: 'var(--ica-i-soft)' }}
        >
          <PhaseLetter letter='I' size={40} />
          <p className='m-0 min-w-0 flex-1 text-sm font-bold' style={{ color: 'var(--ica-i-ink)' }}>
            {t('Necesitas al menos {n} palabras ICA para crear una frase.', { n: minWordsRequired })}
          </p>
          <Button asChild variant='i' size='sm'>
            <Link to={DASHBOARD_ROUTES.newIcaWords}>
              <PlusIcon strokeWidth={3} aria-hidden='true' />
              {t('Añadir')}
            </Link>
          </Button>
        </div>
      ) : null}

      {/* Límite del día alcanzado */}
      {dailyLimits && phraseLimitReached && !loading && !createdThisVisit && (
        <DailyLimitNotice kind='phrases' state={dailyLimits} className='w-full' />
      )}

      {/* Botón principal */}
      <div className='relative'>
      {(mode === 'automatic' ? generateTipPending : mode === 'manual' && generatePickedTipPending) &&
      !primaryDisabled &&
      !result &&
      !loading ? (
        <FirstUseTip onClose={mode === 'automatic' ? closeGenerateTip : closeGeneratePickedTip}>
          {t('Toca aquí y la IA crea tu frase con estas palabras.')}
        </FirstUseTip>
      ) : null}
      <Button
        type='button'
        onClick={() => {
          if (mode === 'automatic' && generateTipPending) closeGenerateTip()
          if (mode === 'manual' && generatePickedTipPending) closeGeneratePickedTip()
          handlePrimaryAction()
        }}
        variant={isManualPhrase && manualPhraseApproved ? 'outline' : 'c'}
        size='xl'
        disabled={primaryDisabled}
        className='w-full'
      >
        {loading ? (
          <>
            <span className='inline-block size-4.5 animate-spin rounded-full border-[3px] border-white/40 border-t-white' />
            {isManualPhrase ? t('Registrando frase...') : t('Generando {level}...', { level })}
          </>
        ) : isManualPhrase ? (
          manualPhraseApproved ? (
            <>
              <PenLineIcon strokeWidth={2.6} aria-hidden='true' />
              {t('Escribir otra frase')}
            </>
          ) : (
            t('Guardar frase · {n}/{min}', { n: selectedWords.length, min: minWordsRequired })
          )
        ) : (
          <>
            <SparklesIcon strokeWidth={2.6} aria-hidden='true' />
            {t('Generar frase · {level}', { level })}
          </>
        )}
      </Button>
      </div>

      {/* Resultado: la frase y, justo debajo, el siguiente paso (Activación) */}
      {result && (
        <div ref={resultRef} className='ica-pop flex scroll-mt-4 flex-col gap-4'>
          <article className='ica-panel p-5'>
            <div className='flex items-center gap-3'>
              <span
                className='hidden size-9 shrink-0 items-center justify-center rounded-full sm:flex'
                style={{ background: 'var(--ica-c-soft)', color: 'var(--ica-c)' }}
                aria-hidden='true'
              >
                <CheckIcon className='size-5' strokeWidth={3.2} />
              </span>
              <div className='min-w-0 flex-1'>
                <p className='m-0 text-base leading-tight font-black tracking-tight whitespace-nowrap sm:text-lg'>
                  {isManualPhrase ? t('¡Frase guardada!') : t('¡Frase creada!')}
                </p>
                <p className='m-0 text-xs font-bold text-muted-foreground'>
                  {langName(config.targetLang)}
                  {result.words_used?.length
                    ? ` · ${tn(result.words_used.length, '{n} palabra ICA', '{n} palabras ICA')}`
                    : ''}
                </p>
              </div>
              {mode !== 'manualPhrase' && extraGenerationsCount < MAX_EXTRA_GENERATIONS ? (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='shrink-0 rounded-xl'
                  onClick={() => void handleGenerate({ isRegeneration: true })}
                  disabled={loading}
                  aria-label={t('Quedan {n}', { n: regenerationsLeft })}
                >
                  <RefreshCwIcon className={loading ? 'animate-spin' : undefined} strokeWidth={2.6} aria-hidden='true' />
                  {t('No me convence')}
                </Button>
              ) : null}
            </div>

            <p className='m-0 mt-4 font-display text-2xl leading-snug font-extrabold tracking-tight break-words'>
              {highlightUsedWords(result.phrase, result.words_used)}
            </p>
            <RomanizationHint text={result.phrase} language={config.targetLang} />

            <p className='m-0 mt-3 text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase'>
              {langName(config.nativeLang)}
            </p>
            <p className='m-0 mt-0.5 text-base leading-relaxed font-semibold text-muted-foreground'>
              {result.translation}
            </p>

            {result.words_used && result.words_used.length > 0 && (
              <div className='mt-3 flex flex-wrap gap-1.5'>
                {result.words_used.map((word) => (
                  <Pill key={word} tone='c'>
                    <CheckIcon className='size-3' strokeWidth={3.4} aria-hidden='true' />
                    {word}
                  </Pill>
                ))}
              </div>
            )}

            <div className='mt-4 flex flex-wrap items-end justify-between gap-2 border-t-2 border-border pt-1'>
              <SpeakButton
                text={result.phrase}
                langName={config.targetLang}
                color='#3B82F6'
                label={t('Escuchar {lang}', { lang: langName(config.targetLang) })}
                className='mt-3'
              />
              <Button
                type='button'
                onClick={() => void handleCopyResultPhrase()}
                variant='outline'
                size='sm'
              >
                {resultCopied ? (
                  <CheckIcon strokeWidth={3} aria-hidden='true' />
                ) : (
                  <CopyIcon aria-hidden='true' />
                )}
                {copyingResult
                  ? t('Copiando...')
                  : resultCopied
                    ? t('Copiadas')
                    : t('Copiar frases')}
              </Button>
            </div>
          </article>

          {resultPhraseId && (
            <div>
              <p className='ica-label m-0 mb-2' style={{ color: 'var(--ica-a-ink)' }}>
                {t('Siguiente paso · Activación')}
              </p>
              <div className='relative'>
              {activateTipPending ? (
                <FirstUseTip onClose={closeActivateTip}>
                  {t('Ahora graba tu frase en voz alta: toca aquí para ir a Activación.')}
                </FirstUseTip>
              ) : null}
              <Button
                type='button'
                onClick={() => {
                  if (activateTipPending) closeActivateTip()
                  openActivateModal()
                }}
                variant='a'
                size='xl'
                className='w-full'
              >
                <MicIcon strokeWidth={2.6} aria-hidden='true' />
                {t('Activar frase')}
              </Button>
              </div>
            </div>
          )}
        </div>
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

      {/* Revisión IA de la frase escrita a mano */}
      <Dialog
        open={manualSuggestionModalOpen}
        onOpenChange={setManualSuggestionModalOpen}
      >
        <DialogContent className='max-h-[88vh] overflow-y-auto sm:max-w-lg'>
          <DialogHeader>
            <div className='flex items-center gap-3'>
              <IconTile tone='c' size={40}>
                <SparklesIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
              </IconTile>
              <DialogTitle>{t('Revisión IA de tu frase')}</DialogTitle>
            </div>
            <DialogDescription>
              {t('Te mostramos feedback en ambos idiomas y una sugerencia opcional. La IA puede flexionar palabras ICA para que la gramática sea natural.')}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-2.5'>
            <ReviewBlock label={t('Frase actual ({lang})', { lang: langName(config.targetLang) })}>
              <p className='m-0 text-base font-extrabold text-foreground'>
                {manualPhraseTarget.trim()}
              </p>
            </ReviewBlock>

            <ReviewBlock label={t('Comentario IA')}>
              <p className='m-0 text-foreground'>{manualSuggestionReview?.comment}</p>
            </ReviewBlock>

            {manualSuggestionReview?.issues?.length ? (
              <ReviewBlock label={t('Posibles errores')} tone='gold'>
                <ul className='m-0 list-disc space-y-1 pl-5'>
                  {manualSuggestionReview.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </ReviewBlock>
            ) : null}

            {manualSuggestionReview?.diagnostics?.suggestionRejectedReason ? (
              <ReviewBlock label={t('Nota ICA')} tone='gold'>
                <p className='m-0'>
                  {manualSuggestionReview.diagnostics.suggestionRejectedReason}
                </p>
                {manualSuggestionReview.diagnostics.missingRequiredWords.length >
                0 ? (
                  <p className='m-0 mt-1 text-xs'>
                    {t('Formas ICA exactas no visibles en sugerencia: {words}', {
                      words: manualSuggestionReview.diagnostics.missingRequiredWords.join(', '),
                    })}
                  </p>
                ) : null}
                {manualSuggestionReview.diagnostics.suggestionCandidate ? (
                  <p className='m-0 mt-2 text-xs'>
                    {t('Borrador IA descartado: "{text}"', {
                      text: manualSuggestionReview.diagnostics.suggestionCandidate,
                    })}
                  </p>
                ) : null}
              </ReviewBlock>
            ) : null}

            {manualSuggestionReview?.targetFeedback?.length ? (
              <ReviewBlock label={t('Feedback ({lang})', { lang: langName(config.targetLang) })}>
                <ul className='m-0 list-disc space-y-1 pl-5 text-foreground'>
                  {manualSuggestionReview.targetFeedback.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </ReviewBlock>
            ) : null}

            {manualSuggestionReview?.nativeFeedback?.length ? (
              <ReviewBlock label={t('Feedback ({lang})', { lang: langName(config.nativeLang) })}>
                <ul className='m-0 list-disc space-y-1 pl-5 text-foreground'>
                  {manualSuggestionReview.nativeFeedback.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </ReviewBlock>
            ) : null}

            {manualSuggestionReview?.suggestion ? (
              <ReviewBlock label={t('Sugerencia ({lang})', { lang: langName(config.targetLang) })} tone='c'>
                <p className='m-0 text-base font-extrabold'>
                  {manualSuggestionReview.suggestion}
                </p>
                <p className='m-0 mt-1 text-xs opacity-80'>
                  {t('Si te convence, puedes aplicarla con "Usar sugerencia".')}
                </p>
              </ReviewBlock>
            ) : manualSuggestionReview?.status === 'perfect' ? (
              <ReviewBlock tone='ok'>
                <p className='m-0 flex items-center gap-2 font-extrabold'>
                  <CheckIcon className='size-4' strokeWidth={3.2} aria-hidden='true' />
                  {t('Tu frase ya está muy bien. No necesitas cambiarla.')}
                </p>
              </ReviewBlock>
            ) : (
              <ReviewBlock tone='gold'>
                <p className='m-0 font-bold'>
                  {t('No pudimos darte una sugerencia de {lang} que respete exactamente todas tus palabras ICA. Puedes reintentar.', {
                    lang: langName(config.targetLang),
                  })}
                </p>
              </ReviewBlock>
            )}

            {manualSuggestionReview?.nativeSuggestion ? (
              <ReviewBlock label={t('Sugerencia ({lang})', { lang: langName(config.nativeLang) })} tone='c'>
                <p className='m-0'>{manualSuggestionReview.nativeSuggestion}</p>
              </ReviewBlock>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setManualSuggestionModalOpen(false)
                setManualSuggestionReview(null)
              }}
            >
              {t('Descartar')}
            </Button>
            <Button
              type='button'
              variant='c'
              onClick={handleUseManualSuggestion}
              disabled={!manualSuggestionReview?.suggestion}
            >
              {t('Usar sugerencia')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GamePage>
  )
}
