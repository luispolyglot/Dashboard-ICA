import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import { CheckIcon, LightbulbIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react'
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
import { langName, t } from '@/i18n'
import { normalizeComparableText } from '../wordExtraction'
import {
  fetchPhraseTokenInsight,
} from '../services/anthropic'
import { insertWord } from '../services/storage'
import { speakNatural, stopTTS } from '../services/tts'
import type {
  ImportanceKey,
  Lexicard,
  PhraseTokenInsightResult,
} from '../types'
import { generateId } from '../utils'
import { DailyLimitNotice } from '../game/DailyLimitNotice'
import { useDailyLimits } from '../game/limits'
import { IconTile } from '../game/ui'
import { SpeakButton } from './SpeakButton'
import { VaultImportanceTiles } from './VaultImportanceTiles'

const INSIGHT_CACHE_STORAGE_KEY = 'ica-phrase-token-insights-cache-v1'

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
    window.sessionStorage.setItem(
      INSIGHT_CACHE_STORAGE_KEY,
      JSON.stringify(payload),
    )
  } catch {
    // Ignore storage quota errors.
  }
}

function getInsightCacheKey(
  token: string,
  targetLang: string,
  nativeLang: string,
): string {
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
  }, [
    cards,
    nativeLang,
    recentlyAddedScopedTargets,
    scopedKey,
    targetLang,
    trimmedToken,
  ])

  // Límite diario de palabras (cuenta igual que añadir desde "Añadir palabra").
  const dailyLimits = useDailyLimits()
  const wordLimitReached =
    dailyLimits.isAtLimit('words') && !saved && !alreadyInVault

  const canSave =
    Boolean(trimmedToken) &&
    Boolean(nativeMeaning.trim()) &&
    Boolean(importance) &&
    !alreadyInVault &&
    !saving &&
    !wordLimitReached

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
          setInsightError(t('No pudimos cargar la explicación con IA.'))
          return
        }
        insightCache.set(cacheKey, result)
        persistInsightCache()
        setInsight(result)
        setNativeMeaning(result.translation)
      })
      .catch(() => {
        if (requestId !== insightRequestRef.current) return
        setInsightError(t('No pudimos cargar la explicación con IA.'))
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
      const message = t('Esta palabra ya existe en tu baúl ICA.')
      setSaveError(message)
      toast.error(message)
      return
    }

    setSaving(true)
    setSaveError(null)

    const examplePhrase = phrase || null
    const exampleTranslation = phraseTranslation || null

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
        void onWordAdded().catch((error) => {
          console.error(error)
        })
      }
      setRecentlyAddedScopedTargets((prev) => {
        const next = new Set(prev)
        next.add(scopedKey)
        return next
      })
      setSaved(true)
      toast.success(t('Palabra añadida al baúl ICA.'))
    } catch {
      setCards((prev) => prev.filter((card) => card.id !== newCard.id))
      const message = t('No se pudo guardar la palabra en tu baúl ICA.')
      setSaveError(message)
      toast.error(message)
    } finally {
      onOpenChange(false)
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('Explorar palabra en contexto')}</DialogTitle>
          <DialogDescription>
            {t('Escucha la palabra y revisa su uso en la frase sin salir del flujo.')}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {/* La palabra, grande */}
          <div className='rounded-3xl px-4 py-4' style={{ background: 'var(--ica-i-soft)' }}>
            <span
              className='text-[11px] font-extrabold tracking-[0.08em] uppercase'
              style={{ color: 'var(--ica-i-ink)' }}
            >
              {t('Palabra')}
            </span>
            <p
              className='m-0 mt-0.5 font-display text-3xl leading-tight font-extrabold tracking-tight break-words'
              style={{ color: 'var(--ica-i-ink)' }}
            >
              {trimmedToken}
            </p>
            <SpeakButton
              text={trimmedToken}
              langName={targetLang}
              color='#3B82F6'
              label={t('Escuchar {lang}', { lang: langName(targetLang) })}
              className='mt-2'
              isPlaying={isPlaying}
              onPlayingChange={setIsPlaying}
            />
            <div className='mt-3'>
              <Label className='mb-1.5 block text-xs font-bold text-muted-foreground'>
                {t('Traducción ({lang})', { lang: langName(nativeLang) })}
              </Label>
              <Input
                value={nativeMeaning}
                onChange={(event) => setNativeMeaning(event.target.value)}
                placeholder={t('Escribe la traducción...')}
                disabled={saving || alreadyInVault || insightLoading}
              />
            </div>
          </div>

          {/* Explicación de la IA */}
          <div className='rounded-2xl border-2 border-border p-4'>
            <div className='mb-2 flex items-center gap-2'>
              <IconTile tone='gold' size={32} className='rounded-xl'>
                <LightbulbIcon className='size-4.5' strokeWidth={2.6} aria-hidden='true' />
              </IconTile>
              <Label className='text-sm font-extrabold'>{t('Insight IA')}</Label>
            </div>

            {insightLoading && (
              <div className='space-y-2' aria-hidden='true'>
                <div className='h-4 w-3/4 animate-pulse rounded-lg bg-muted' />
                <div className='h-4 w-full animate-pulse rounded-lg bg-muted' />
                <div className='h-4 w-2/3 animate-pulse rounded-lg bg-muted' />
              </div>
            )}
            {insightLoading && (
              <p className='m-0 mt-2 text-xs font-semibold text-muted-foreground'>
                {t('Analizando por favor espere...')}
              </p>
            )}

            {!insightLoading && insightError && (
              <p
                className='m-0 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold'
                style={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }}
              >
                <TriangleAlertIcon className='size-4 shrink-0' strokeWidth={2.6} aria-hidden='true' />
                {insightError}
              </p>
            )}

            {!insightLoading && insight && (
              <dl className='m-0 space-y-3 text-sm'>
                <div>
                  <dt className='ica-label'>{t('Traducción')}</dt>
                  <dd className='m-0 mt-0.5 font-semibold'>{insight.translation}</dd>
                </div>
                <div>
                  <dt className='ica-label'>{t('Significado')}</dt>
                  <dd className='m-0 mt-0.5 font-semibold'>{insight.meaning}</dd>
                </div>
                <div>
                  <dt className='ica-label'>{t('Tip gramatical')}</dt>
                  <dd className='m-0 mt-0.5 font-semibold'>{insight.grammarTip}</dd>
                </div>
                {insight.examples.length > 0 && (
                  <div>
                    <dt className='ica-label'>{t('Mini ejemplos')}</dt>
                    <dd className='m-0 mt-1.5'>
                      <ul className='m-0 list-none space-y-1.5 p-0'>
                        {insight.examples.map((example) => (
                          <li
                            key={example}
                            className='rounded-xl border-l-4 bg-muted/60 px-3 py-1.5 font-semibold'
                            style={{ borderLeftColor: 'var(--ica-c)' }}
                          >
                            {example}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* Guardar en el baúl */}
          <div className='space-y-3'>
            <Label className='ica-label block'>{t('Añadir al baúl ICA · Frecuencia de uso')}</Label>
            <VaultImportanceTiles
              value={importance}
              onChange={setImportance}
              disabled={saving || alreadyInVault}
            />

            {!saving && alreadyInVault && (
              <p
                className='m-0 rounded-xl px-3 py-2 text-xs font-bold'
                style={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }}
              >
                {t('Esta palabra ya existe en tu baúl ICA para este idioma.')}
              </p>
            )}

            {saveError && (
              <p
                className='m-0 rounded-xl px-3 py-2 text-xs font-bold'
                style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}
              >
                {saveError}
              </p>
            )}

            {wordLimitReached && (
              <DailyLimitNotice
                kind='words'
                state={dailyLimits}
                onNavigate={() => onOpenChange(false)}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('Cerrar')}
          </Button>
          <Button
            type='button'
            variant={saved ? 'success' : 'i'}
            onClick={() => void handleSave()}
            disabled={!canSave}
          >
            {saved ? (
              <CheckIcon strokeWidth={3} aria-hidden='true' />
            ) : !saving ? (
              <PlusIcon strokeWidth={3} aria-hidden='true' />
            ) : null}
            {saving
              ? t('Guardando...')
              : saved
                ? t('Guardada')
                : t('Añadir al baúl ICA')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
