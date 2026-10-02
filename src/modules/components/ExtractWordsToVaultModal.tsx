import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { CheckIcon, PackagePlusIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react'
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
import { langName, t } from '@/i18n'
import { useWordExtractionCandidates } from '../hooks/useWordExtractionCandidates'
import { fetchTranslation } from '../services/anthropic'
import { insertWord } from '../services/storage'
import type {
  ImportanceKey,
  Lexicard,
} from '../types'
import { generateId } from '../utils'
import { DailyLimitNotice } from '../game/DailyLimitNotice'
import { useDailyLimits } from '../game/limits'
import { IconTile } from '../game/ui'
import { normalizeComparableText } from '../wordExtraction'
import { VaultImportanceTiles } from './VaultImportanceTiles'

type ExtractWordsToVaultModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: string
  translation?: string | null
  seedWords?: string[]
  targetLang: string
  nativeLang: string
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded?: () => Promise<unknown>
  updateCardsLocally?: boolean
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

export function ExtractWordsToVaultModal({
  open,
  onOpenChange,
  text,
  translation,
  seedWords,
  targetLang,
  nativeLang,
  cards,
  setCards,
  onWordAdded,
  updateCardsLocally = true,
}: ExtractWordsToVaultModalProps) {
  const { candidates, lowConfidence } = useWordExtractionCandidates({
    text,
    targetLang,
    cards,
    seedWords,
  })
  const [selectedTokens, setSelectedTokens] = useState<string[]>([])
  const [nativeMeaning, setNativeMeaning] = useState('')
  const [importance, setImportance] = useState<ImportanceKey | null>(null)
  const [loadingTranslation, setLoadingTranslation] = useState(false)
  const [translationError, setTranslationError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [recentlyAddedScopedTargets, setRecentlyAddedScopedTargets] = useState<
    Set<string>
  >(new Set())
  const translationRequestRef = useRef(0)

  const selectedWord = useMemo(() => selectedTokens.join(' ').trim(), [selectedTokens])

  const getScopedTargetKey = (target: string): string =>
    `${targetLang}::${nativeLang}::${normalizeComparableText(target)}`

  const isAlreadyInVault = (target: string): boolean =>
    hasDuplicateWord(cards, target, targetLang, nativeLang) ||
    recentlyAddedScopedTargets.has(getScopedTargetKey(target))

  const previewAlreadyExists = useMemo(
    () => Boolean(selectedWord) && isAlreadyInVault(selectedWord),
    [cards, nativeLang, recentlyAddedScopedTargets, selectedWord, targetLang],
  )

  useEffect(() => {
    if (!open) return

    setSelectedTokens([])
    setNativeMeaning('')
    setImportance(null)
    setTranslationError(null)
    setSaveError(null)
    setLoadingTranslation(false)
    setSaved(false)
    setSaving(false)
  }, [open])

  useEffect(() => {
    if (!open) return

    if (!selectedWord || previewAlreadyExists) {
      setLoadingTranslation(false)
      setTranslationError(null)
      return
    }

    translationRequestRef.current += 1
    const requestId = translationRequestRef.current
    const timer = window.setTimeout(() => {
      setLoadingTranslation(true)
      setTranslationError(null)

      void fetchTranslation(selectedWord, targetLang, nativeLang)
        .then((result) => {
          if (requestId !== translationRequestRef.current) return

          if (!result) {
            setTranslationError(t('No se pudo traducir automáticamente.'))
            return
          }

          setNativeMeaning(result)
        })
        .catch(() => {
          if (requestId !== translationRequestRef.current) return
          setTranslationError(t('No se pudo traducir automáticamente.'))
        })
        .finally(() => {
          if (requestId !== translationRequestRef.current) return
          setLoadingTranslation(false)
        })
    }, 1500)

    return () => {
      window.clearTimeout(timer)
    }
  }, [nativeLang, open, previewAlreadyExists, selectedWord, targetLang])

  // Límite diario de palabras (cuenta igual que añadir desde "Añadir palabra").
  const dailyLimits = useDailyLimits()
  const wordLimitReached = dailyLimits.isAtLimit('words') && !saved

  const canSave =
    Boolean(selectedWord) &&
    Boolean(nativeMeaning.trim()) &&
    Boolean(importance) &&
    !saving &&
    !previewAlreadyExists &&
    !wordLimitReached

  const handleToggleToken = (value: string): void => {
    setSelectedTokens((prev) => {
      if (prev.includes(value)) {
        return prev.filter((token) => token !== value)
      }
      return [...prev, value]
    })
    setSaveError(null)
  }

  const handleSave = async (): Promise<void> => {
    if (!canSave || !importance) return

    const trimmedTarget = selectedWord.trim()
    const trimmedNative = nativeMeaning.trim()
    if (!trimmedTarget || !trimmedNative) return

    if (isAlreadyInVault(trimmedTarget)) {
      const message = t('Esta palabra ya existe en tu baúl ICA.')
      setSaveError(message)
      toast.error(message)
      return
    }

    setSaving(true)
    setSaveError(null)

    const newCard: Lexicard = {
      id: generateId(),
      target: trimmedTarget,
      native: trimmedNative,
      targetLang,
      nativeLang,
      examplePhrase: text || null,
      exampleTranslation: translation || null,
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
      if (updateCardsLocally) {
        setCards((prev) => [...prev, newCard])
      }
      await insertWord(newCard)
      setRecentlyAddedScopedTargets((prev) => {
        const next = new Set(prev)
        next.add(getScopedTargetKey(trimmedTarget))
        return next
      })
      if (onWordAdded) {
        void onWordAdded().catch((error) => {
          console.error(error)
        })
      }
      toast.success(t('Palabra agregada correctamente al baúl ICA.'))
      setSaved(true)
      window.setTimeout(() => {
        onOpenChange(false)
      }, 350)
    } catch {
      if (updateCardsLocally) {
        setCards((prev) => prev.filter((card) => card.id !== newCard.id))
      }
      const message = t('No se pudo guardar la palabra en tu baúl ICA.')
      setSaveError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <div className='flex items-center gap-3'>
            <IconTile tone='i' size={44}>
              <PackagePlusIcon className='size-6' strokeWidth={2.4} aria-hidden='true' />
            </IconTile>
            <DialogTitle>{t('Extraer nuevas palabras')}</DialogTitle>
          </div>
          <DialogDescription>
            {t('Elige una palabra en {lang}, revisa su traducción y guarda su frecuencia en tu baúl ICA.', {
              lang: langName(targetLang),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-5'>
          <div>
            <Label className='ica-label block'>{t('Frase objetivo')}</Label>
            <p className='m-0 mt-1.5 rounded-2xl bg-muted px-4 py-3 text-base leading-snug font-extrabold'>
              {text || t('Sin frase disponible')}
            </p>
            {lowConfidence && (
              <p
                className='m-0 mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold'
                style={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }}
              >
                <TriangleAlertIcon className='size-4 shrink-0' strokeWidth={2.6} aria-hidden='true' />
                {t('Segmentación aproximada para este idioma. Revisa la selección antes de guardar.')}
              </p>
            )}
          </div>

          <div>
            <div className='flex items-center justify-between gap-2'>
              <Label className='ica-label'>{t('Palabras detectadas')}</Label>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => {
                  setSelectedTokens([])
                  setSaveError(null)
                }}
                disabled={selectedTokens.length === 0 || saving}
              >
                {t('Limpiar selección')}
              </Button>
            </div>
            <div className='mt-1.5 flex max-h-52 flex-wrap gap-2 overflow-y-auto p-0.5 pb-2.5'>
              {candidates.length > 0 ? (
                candidates.map((candidate) => {
                  const alreadyAdded = selectedTokens.includes(candidate.value)
                  return (
                    <button
                      key={candidate.value}
                      type='button'
                      aria-pressed={alreadyAdded}
                      onClick={() => handleToggleToken(candidate.value)}
                      className='ica-press inline-flex min-h-11 items-center gap-1.5 rounded-2xl border-2 bg-card px-3.5 text-[15px] font-extrabold dark:bg-transparent'
                      style={
                        alreadyAdded
                          ? {
                              background: 'var(--ica-i)',
                              borderColor: 'var(--ica-i-edge)',
                              color: '#fff',
                              boxShadow: '0 3px 0 var(--ica-i-edge)',
                            }
                          : { borderColor: 'var(--border)', boxShadow: '0 3px 0 var(--border)' }
                      }
                    >
                      <span>{candidate.value}</span>
                      {alreadyAdded && (
                        <CheckIcon className='size-4' strokeWidth={3.2} aria-hidden='true' />
                      )}
                    </button>
                  )
                })
              ) : (
                <p className='m-0 text-sm font-semibold text-muted-foreground'>
                  {t('No encontramos palabras para extraer.')}
                </p>
              )}
            </div>

            <div className='mt-3'>
              <Label className='ica-label block'>{t('Preview nueva palabra/frase')}</Label>
              <p
                className='m-0 mt-1.5 flex min-h-12 items-center rounded-2xl border-2 border-dashed px-4 py-2 text-lg leading-tight font-extrabold'
                style={
                  selectedWord
                    ? { borderColor: 'var(--ica-i)', background: 'var(--ica-i-soft)', color: 'var(--ica-i-ink)' }
                    : { borderColor: 'var(--border)' }
                }
              >
                {selectedWord || (
                  <span className='text-sm font-semibold text-muted-foreground'>{t('Sin selección')}</span>
                )}
              </p>
            </div>

            {previewAlreadyExists && !saving && !saved && (
              <p
                className='m-0 mt-2 rounded-xl px-3 py-2 text-xs font-bold'
                style={{ background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' }}
              >
                {t('Esta palabra/frase ya existe en tu Baúl ICA. Si quieres usarla, combínala en una frase diferente.')}
              </p>
            )}
          </div>

          <div>
            <Label className='mb-1.5 block text-xs font-bold text-muted-foreground'>
              {t('Traducción ({lang})', { lang: langName(nativeLang) })}
            </Label>
            <Input
              value={nativeMeaning}
              onChange={(event) => setNativeMeaning(event.target.value)}
              placeholder={
                selectedWord
                  ? t('Escribe la traducción...')
                  : t('Selecciona una palabra primero')
              }
              disabled={!selectedWord || saving}
            />
            {loadingTranslation && (
              <p className='m-0 mt-1.5 text-xs font-semibold text-muted-foreground'>
                {t('Traduciendo selección...')}
              </p>
            )}
            {!loadingTranslation && translationError && (
              <p className='m-0 mt-1.5 text-xs font-bold' style={{ color: 'var(--ica-gold-ink)' }}>
                {translationError}
              </p>
            )}
          </div>

          <div>
            <Label className='ica-label mb-2 block'>{t('Frecuencia de uso')}</Label>
            <VaultImportanceTiles value={importance} onChange={setImportance} disabled={saving} />
          </div>

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

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={handleCancel}
            disabled={saving}
          >
            {t('Cancelar')}
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
            {saving ? t('Guardando...') : saved ? t('Guardada') : t('Añadir al baúl ICA')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
