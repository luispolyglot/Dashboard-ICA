import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
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
import { Label } from '@/components/ui/label'
import { IMPORTANCE_LEVELS } from '../constants'
import { normalizeComparableText } from '../wordExtraction'
import { fetchPhraseTokenInsight, fetchWordExample } from '../services/anthropic'
import { insertWord } from '../services/storage'
import { speakNatural, stopTTS } from '../services/tts'
import type {
  CEFRLevel,
  ImportanceKey,
  Lexicard,
  PhraseTokenInsightResult,
} from '../types'
import { generateId } from '../utils'
import { SpeakButton } from './SpeakButton'

const INSIGHT_CACHE_STORAGE_KEY = 'ica-phrase-token-insights-cache-v1'

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

let insightCacheHydrated = false
const insightCache = new Map<string, PhraseTokenInsightResult>()

function hydrateInsightCache(): void {
  if (insightCacheHydrated) return
  insightCacheHydrated = true
  if (typeof window === 'undefined') return

  try {
    const raw = window.sessionStorage.getItem(INSIGHT_CACHE_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, PhraseTokenInsightResult>
    Object.entries(parsed).forEach(([key, value]) => {
      if (!value) return
      insightCache.set(key, value)
    })
  } catch {
    // Ignore corrupted session cache.
  }
}

function persistInsightCache(): void {
  if (typeof window === 'undefined') return

  try {
    const payload = Object.fromEntries(insightCache.entries())
    window.sessionStorage.setItem(INSIGHT_CACHE_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage quota errors.
  }
}

function getInsightCacheKey(token: string, targetLang: string, nativeLang: string): string {
  return `${targetLang}::${nativeLang}::${normalizeComparableText(token)}`
}

type ExplorePhraseTokenModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  phrase: string
  phraseTranslation?: string | null
  targetLang: string
  nativeLang: string
  level: CEFRLevel
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded?: () => Promise<unknown>
}

function hasDuplicateWord(
  cards: Lexicard[],
  target: string,
  targetLang: string,
  nativeLang: string,
): boolean {
  const normalizedTarget = normalizeComparableText(target)
  return cards.some(
    (card) =>
      normalizeComparableText(card.target) === normalizedTarget &&
      (card.targetLang || '') === targetLang &&
      (card.nativeLang || '') === nativeLang,
  )
}

export function ExplorePhraseTokenModal({
  open,
  onOpenChange,
  token,
  phrase,
  phraseTranslation,
  targetLang,
  nativeLang,
  level,
  cards,
  setCards,
  onWordAdded,
}: ExplorePhraseTokenModalProps) {
  const [insight, setInsight] = useState<PhraseTokenInsightResult | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)
  const [nativeMeaning, setNativeMeaning] = useState('')
  const [importance, setImportance] = useState<ImportanceKey | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [recentlyAddedScopedTargets, setRecentlyAddedScopedTargets] = useState<
    Set<string>
  >(new Set())
  const insightRequestRef = useRef(0)

  const trimmedToken = token.trim()
  const scopedKey = `${targetLang}::${nativeLang}::${normalizeComparableText(trimmedToken)}`
  const alreadyInVault = useMemo(() => {
    if (!trimmedToken) return false
    return (
      hasDuplicateWord(cards, trimmedToken, targetLang, nativeLang) ||
      recentlyAddedScopedTargets.has(scopedKey)
    )
  }, [cards, nativeLang, recentlyAddedScopedTargets, scopedKey, targetLang, trimmedToken])

  const canSave =
    Boolean(trimmedToken) &&
    Boolean(nativeMeaning.trim()) &&
    Boolean(importance) &&
    !alreadyInVault &&
    !saving

  useEffect(() => {
    hydrateInsightCache()
  }, [])

  useEffect(() => {
    if (!open || !trimmedToken) return

    const cacheKey = getInsightCacheKey(trimmedToken, targetLang, nativeLang)
    const cached = insightCache.get(cacheKey)

    if (cached) {
      setInsight(cached)
      setNativeMeaning(cached.translation)
      setInsightError(null)
      setInsightLoading(false)
      setImportance(null)
      setSaveError(null)
      setSaved(false)
      return
    }

    setInsight(null)
    setInsightError(null)
    setInsightLoading(true)
    setNativeMeaning('')
    setImportance(null)
    setSaveError(null)
    setSaved(false)

    insightRequestRef.current += 1
    const requestId = insightRequestRef.current

    void fetchPhraseTokenInsight(trimmedToken, phrase, targetLang, nativeLang)
      .then((result) => {
        if (requestId !== insightRequestRef.current) return
        if (!result) {
          setInsightError('No pudimos cargar la explicación con IA.')
          return
        }
        insightCache.set(cacheKey, result)
        persistInsightCache()
        setInsight(result)
        setNativeMeaning(result.translation)
      })
      .catch(() => {
        if (requestId !== insightRequestRef.current) return
        setInsightError('No pudimos cargar la explicación con IA.')
      })
      .finally(() => {
        if (requestId !== insightRequestRef.current) return
        setInsightLoading(false)
      })
  }, [open, trimmedToken, phrase, targetLang, nativeLang])

  useEffect(() => {
    if (!open || !trimmedToken) return

    setIsPlaying(true)
    speakNatural(trimmedToken, targetLang, () => setIsPlaying(false), 1)

    return () => {
      stopTTS()
      setIsPlaying(false)
    }
  }, [open, trimmedToken, targetLang])

  const handleSave = async (): Promise<void> => {
    if (!canSave || !importance) return

    if (alreadyInVault) {
      const message = 'Esta palabra ya existe en tu baúl ICA.'
      setSaveError(message)
      toast.error(message)
      return
    }

    setSaving(true)
    setSaveError(null)

    let examplePhrase = phrase || null
    let exampleTranslation = phraseTranslation || null

    try {
      const example = await fetchWordExample(
        trimmedToken,
        nativeMeaning.trim(),
        targetLang,
        nativeLang,
        level,
      )
      if (example?.phrase) {
        examplePhrase = example.phrase
      }
      if (example?.translation) {
        exampleTranslation = example.translation
      }
    } catch {
      // Best effort only.
    }

    const newCard: Lexicard = {
      id: generateId(),
      target: trimmedToken,
      native: nativeMeaning.trim(),
      targetLang,
      nativeLang,
      examplePhrase,
      exampleTranslation,
      importance,
      interval: 1,
      easeFactor: 2.5,
      streak: 0,
      activationCount: 0,
      firstActivatedAt: null,
      lastActivatedAt: null,
      lastReviewed: null,
      createdAt: Date.now(),
    }

    try {
      setCards((prev) => [...prev, newCard])
      await insertWord(newCard)
      if (onWordAdded) {
        await onWordAdded()
      }
      setRecentlyAddedScopedTargets((prev) => {
        const next = new Set(prev)
        next.add(scopedKey)
        return next
      })
      setSaved(true)
      toast.success('Palabra añadida al baúl ICA.')
    } catch {
      setCards((prev) => prev.filter((card) => card.id !== newCard.id))
      const message = 'No se pudo guardar la palabra en tu baúl ICA.'
      setSaveError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Explorar palabra en contexto</DialogTitle>
          <DialogDescription>
            Escucha la palabra y revisa su uso en la frase sin salir del flujo.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='rounded-lg border border-border/70 bg-muted/20 p-3'>
            <span className='text-xs uppercase tracking-wider text-muted-foreground'>
              Palabra
            </span>
            <p className='mt-1 text-xl font-semibold'>{trimmedToken}</p>
            <SpeakButton
              text={trimmedToken}
              langName={targetLang}
              color='#3B82F6'
              label={`Escuchar ${targetLang}`}
              className='mt-2'
              isPlaying={isPlaying}
              onPlayingChange={setIsPlaying}
            />
          </div>

          <div>
            <Label className='text-xs uppercase tracking-wider text-muted-foreground'>
              Frase completa
            </Label>
            <p className='mt-1 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm'>
              {phrase}
            </p>
          </div>

          <div className='space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3'>
            <Label className='text-xs uppercase tracking-wider text-muted-foreground'>
              Insight IA
            </Label>

            {insightLoading && (
              <p className='text-sm text-muted-foreground'>Analizando en segundo plano...</p>
            )}

            {!insightLoading && insightError && (
              <p className='text-sm text-amber-600 dark:text-amber-300'>{insightError}</p>
            )}

            {!insightLoading && insight && (
              <div className='space-y-2 text-sm'>
                <p>
                  <span className='font-semibold'>Traducción:</span> {insight.translation}
                </p>
                <p>
                  <span className='font-semibold'>Significado:</span> {insight.meaning}
                </p>
                <p>
                  <span className='font-semibold'>Tip gramatical:</span> {insight.grammarTip}
                </p>
                {insight.examples.length > 0 && (
                  <div>
                    <p className='font-semibold'>Mini ejemplos:</p>
                    <ul className='list-disc pl-5'>
                      {insight.examples.map((example) => (
                        <li key={example}>{example}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className='space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3'>
            <Label className='text-xs uppercase tracking-wider text-muted-foreground'>
              Añadir al baúl ICA
            </Label>

            <div>
              <Label className='mb-1 block text-xs text-muted-foreground'>
                Traducción ({nativeLang})
              </Label>
              <Input
                value={nativeMeaning}
                onChange={(event) => setNativeMeaning(event.target.value)}
                placeholder='Escribe la traducción...'
                disabled={saving || alreadyInVault}
              />
            </div>

            <div>
              <Label className='mb-2 block text-xs uppercase tracking-wider text-muted-foreground'>
                Frecuencia de uso
              </Label>
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-5'>
                {IMPORTANCE_LEVELS.map((item) => {
                  const selected = importance === item.key
                  return (
                    <Button
                      key={item.key}
                      type='button'
                      variant={selected ? 'default' : 'outline'}
                      onClick={() => setImportance(item.key)}
                      disabled={saving || alreadyInVault}
                      className={`h-auto py-2 text-xs ${selected ? IMPORTANCE_TONE[item.key] : ''}`}
                    >
                      <span
                        className={`mr-1 h-1.5 w-1.5 rounded-full ${IMPORTANCE_DOT[item.key]}`}
                      />
                      {item.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            {alreadyInVault && (
              <p className='text-xs text-amber-600 dark:text-amber-300'>
                Esta palabra ya existe en tu baúl ICA para este idioma.
              </p>
            )}

            {saveError && <p className='text-xs text-red-600 dark:text-red-300'>{saveError}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cerrar
          </Button>
          <Button type='button' onClick={() => void handleSave()} disabled={!canSave}>
            {saving ? 'Guardando...' : saved ? '✓ Guardada' : '📦 Añadir al baúl ICA'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
