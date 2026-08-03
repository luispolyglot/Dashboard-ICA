import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import { IMPORTANCE_LEVELS } from '../constants'
import { recordWordAddedEvent } from '../services/gamification'
import { insertWord } from '../services/storage'
import type { PregunticaWordSuggestion } from '../services/preguntica'
import type { AppConfig, ImportanceKey, Lexicard } from '../types'
import { generateId } from '../utils'
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

type AddIcaSuggestionModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  suggestion: PregunticaWordSuggestion | null
  config: AppConfig
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  onWordAdded: () => Promise<unknown>
  onAdded?: (word: string) => void
}

function normalizeComparableText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

export function AddIcaSuggestionModal({
  open,
  onOpenChange,
  suggestion,
  config,
  cards,
  setCards,
  onWordAdded,
  onAdded,
}: AddIcaSuggestionModalProps) {
  const [target, setTarget] = useState('')
  const [native, setNative] = useState('')
  const [importance, setImportance] = useState<ImportanceKey | null>('frequent')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTarget(suggestion?.word?.trim() || '')
    setNative(suggestion?.translation?.trim() || '')
    setImportance('frequent')
    setSaving(false)
  }, [open, suggestion])

  const trimmedTarget = target.trim()
  const trimmedNative = native.trim()

  const duplicateWord = useMemo(
    () => cards.find((card) => {
      return normalizeComparableText(card.target) === normalizeComparableText(trimmedTarget)
        && (card.targetLang || '') === config.targetLang
        && (card.nativeLang || '') === config.nativeLang
    }),
    [cards, config.nativeLang, config.targetLang, trimmedTarget],
  )
  const showDuplicateWarning = Boolean(duplicateWord) && !saving && trimmedTarget.length > 0

  const canSave = trimmedTarget && trimmedNative && importance && !saving && !duplicateWord

  async function handleSave() {
    if (!canSave || !importance) return
    setSaving(true)

    const newCard: Lexicard = {
      id: generateId(),
      target: trimmedTarget,
      native: trimmedNative,
      targetLang: config.targetLang,
      nativeLang: config.nativeLang,
      examplePhrase: null,
      exampleTranslation: null,
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
      await insertWord(newCard)
      setCards((prev) => [...prev, newCard])

      void onWordAdded().catch((error) => {
        console.error(error)
      })

      void recordWordAddedEvent().catch((error) => {
        console.error(error)
      })

      onAdded?.(trimmedTarget)
      toast.success(`"${trimmedTarget}" añadida al Baúl ICA`)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo añadir la palabra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir sugerencia al Baúl ICA</DialogTitle>
          <DialogDescription>
            Ajusta los campos si lo necesitas y guarda la palabra sugerida.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <Label>{config.targetLang} - idioma objetivo</Label>
            <Input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              disabled={saving}
              placeholder={`Escribe en ${config.targetLang}...`}
            />
          </div>

          <div className='space-y-1.5'>
            <Label>{config.nativeLang} - idioma materno</Label>
            <Input
              value={native}
              onChange={(event) => setNative(event.target.value)}
              disabled={saving}
              placeholder={`Escribe en ${config.nativeLang}...`}
            />
          </div>

          <div className='space-y-2'>
            <Label>Frecuencia de uso</Label>
            <div className='flex flex-wrap gap-2'>
              {IMPORTANCE_LEVELS.map((level) => {
                const selected = importance === level.key
                return (
                  <Button
                    key={level.key}
                    type='button'
                    onClick={() => !saving && setImportance(level.key)}
                    disabled={saving}
                    variant={selected ? 'default' : 'outline'}
                    className={`min-w-22.5 h-auto flex-1 py-2.5 ${selected ? IMPORTANCE_TONE[level.key] : ''}`}
                  >
                    <span className={`mr-1 h-1.5 w-1.5 rounded-full ${IMPORTANCE_DOT[level.key]}`} />
                    <div className='text-xs font-semibold'>{level.label}</div>
                  </Button>
                )
              })}
            </div>
          </div>

          {showDuplicateWarning && (
            <p className='text-xs text-red-500'>Esta palabra ya existe en tu Baúl ICA.</p>
          )}
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type='button' disabled={!canSave} onClick={handleSave}>
            {saving ? 'Guardando...' : 'Guardar palabra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
