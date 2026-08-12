import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { CheckIcon } from 'lucide-react'
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
import { useWordExtractionCandidates } from '../hooks/useWordExtractionCandidates'
import { fetchTranslation } from '../services/anthropic'
import { insertWord } from '../services/storage'
import type {
  CEFRLevel,
  ImportanceKey,
  Lexicard,
} from '../types'
import { generateId } from '../utils'
import { normalizeComparableText } from '../wordExtraction'

type ExtractWordsToVaultModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: string
  translation?: string | null
  seedWords?: string[]
  targetLang: string
  nativeLang: string
  level: CEFRLevel
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded?: () => Promise<unknown>
  updateCardsLocally?: boolean
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
  level,
  cards,
  setCards,
  onWordAdded,
  updateCardsLocally = true,
}: ExtractWordsToVaultModalProps) {
  void level

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
            setTranslationError('No se pudo traducir automáticamente.')
            return
          }

          setNativeMeaning(result)
        })
        .catch(() => {
          if (requestId !== translationRequestRef.current) return
          setTranslationError('No se pudo traducir automáticamente.')
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

  const canSave =
    Boolean(selectedWord) &&
    Boolean(nativeMeaning.trim()) &&
    Boolean(importance) &&
    !saving &&
    !previewAlreadyExists

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
      const message = 'Esta palabra ya existe en tu baúl ICA.'
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
      toast.success('Palabra agregada correctamente al baúl ICA.')
      setSaved(true)
      window.setTimeout(() => {
        onOpenChange(false)
      }, 350)
    } catch {
      if (updateCardsLocally) {
        setCards((prev) => prev.filter((card) => card.id !== newCard.id))
      }
      const message = 'No se pudo guardar la palabra en tu baúl ICA.'
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
          <DialogTitle>Extraer nuevas palabras</DialogTitle>
          <DialogDescription>
            Elige una palabra en {targetLang}, revisa su traducción y guarda su
            frecuencia en tu baúl ICA.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div>
            <Label className='text-xs uppercase tracking-wider text-muted-foreground'>
              Frase objetivo
            </Label>
            <p className='mt-1 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm'>
              {text || 'Sin frase disponible'}
            </p>
            {lowConfidence && (
              <p className='mt-2 text-xs text-amber-600 dark:text-amber-300'>
                Segmentación aproximada para este idioma. Revisa la selección
                antes de guardar.
              </p>
            )}
          </div>

          <div>
            <Label className='text-xs uppercase tracking-wider text-muted-foreground'>
              Palabras detectadas
            </Label>
            <div className='mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border border-border/60 bg-muted/10 p-2'>
              {candidates.length > 0 ? (
                candidates.map((candidate) => {
                  const alreadyAdded = selectedTokens.includes(candidate.value)
                  return (
                    <Button
                      key={candidate.value}
                      type='button'
                      variant={alreadyAdded ? 'default' : 'outline'}
                      size='sm'
                      onClick={() => handleToggleToken(candidate.value)}
                      className='gap-1.5'
                    >
                      <span>{candidate.value}</span>
                      {alreadyAdded && (
                        <CheckIcon className='size-3' />
                      )}
                    </Button>
                  )
                })
              ) : (
                <p className='text-xs text-muted-foreground'>
                  No encontramos palabras para extraer.
                </p>
              )}
            </div>

            <div className='mt-2 flex items-center gap-2'>
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
                Limpiar selección
              </Button>
            </div>

            <div className='mt-2'>
              <Label className='text-xs uppercase tracking-wider text-muted-foreground'>
                Preview nueva palabra/frase
              </Label>
              <p className='mt-1 min-h-9 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm'>
                {selectedWord || 'Sin selección'}
              </p>
            </div>

            {previewAlreadyExists && !saving && !saved && (
              <p className='mt-2 text-xs text-amber-600 dark:text-amber-300'>
                Esta palabra/frase ya existe en tu Baúl ICA. Si quieres usarla,
                combínala en una frase diferente.
              </p>
            )}
          </div>

          <div>
            <Label className='mb-1 block text-xs text-muted-foreground'>
              Traducción ({nativeLang})
            </Label>
            <Input
              value={nativeMeaning}
              onChange={(event) => setNativeMeaning(event.target.value)}
              placeholder={
                selectedWord
                  ? 'Escribe la traducción...'
                  : 'Selecciona una palabra primero'
              }
              disabled={!selectedWord || saving}
            />
            {loadingTranslation && (
              <p className='mt-1 text-xs text-muted-foreground'>
                Traduciendo selección...
              </p>
            )}
            {!loadingTranslation && translationError && (
              <p className='mt-1 text-xs text-amber-600 dark:text-amber-300'>
                {translationError}
              </p>
            )}
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
                    disabled={saving}
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

          {saveError && (
            <p className='text-xs text-red-600 dark:text-red-300'>
              {saveError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={handleCancel}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type='button' onClick={() => void handleSave()} disabled={!canSave}>
            {saving ? 'Guardando...' : saved ? '✓ Guardada' : 'Añadir al baúl ICA'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
