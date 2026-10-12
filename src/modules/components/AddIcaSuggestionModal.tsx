import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import { IMPORTANCE_LEVELS } from '../constants'
import { recordWordAddedEvent } from '../services/gamification'
import { insertWord } from '../services/storage'
import type { PregunticaWordSuggestion } from '../services/preguntica'
import type { AppConfig, ImportanceKey, Lexicard } from '../types'
import { generateId } from '../utils'
import { DailyLimitNotice } from '../game/DailyLimitNotice'
import { useDailyLimits } from '../game/limits'
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
import { cn } from '@/lib/utils'
import { t, langName } from '@/i18n'
import { PhaseLetter, tone, type Tone } from '../game/ui'

// Color de cada frecuencia (tonos del modo juego).
const IMPORTANCE_TONE: Record<ImportanceKey, Tone> = {
  vital: 'i',
  frequent: 'ok',
  occasional: 'gold',
  rare: 'fire',
  irrelevant: 'bad',
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
  title?: string
  description?: string
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
  title = t('Añadir sugerencia al Baúl ICA'),
  description = t('Ajusta los campos si lo necesitas y guarda la palabra sugerida.'),
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

  // Límite diario de palabras (también cuenta para las sugerencias de PreguntICA).
  const dailyLimits = useDailyLimits()
  const wordLimitReached = dailyLimits.isAtLimit('words')

  const canSave =
    trimmedTarget && trimmedNative && importance && !saving && !duplicateWord && !wordLimitReached

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
      toast.success(t('"{word}" añadida al Baúl ICA', { word: trimmedTarget }))
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('No se pudo añadir la palabra'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className='flex items-center gap-3'>
            <PhaseLetter letter='I' size={40} />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <Label className='font-extrabold'>{t('{lang} - idioma objetivo', { lang: langName(config.targetLang) })}</Label>
            <Input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              disabled={saving}
              placeholder={t('Escribe en {lang}...', { lang: langName(config.targetLang) })}
              className='h-12 text-base font-bold'
            />
          </div>

          <div className='space-y-1.5'>
            <Label className='font-extrabold'>{t('{lang} - idioma materno', { lang: langName(config.nativeLang) })}</Label>
            <Input
              value={native}
              onChange={(event) => setNative(event.target.value)}
              disabled={saving}
              placeholder={t('Escribe en {lang}...', { lang: langName(config.nativeLang) })}
              className='h-12 text-base font-bold'
            />
          </div>

          <div className='space-y-2'>
            <Label className='font-extrabold'>{t('Frecuencia de uso')}</Label>
            <div role='radiogroup' aria-label={t('Frecuencia de uso')} className='flex flex-wrap gap-2'>
              {IMPORTANCE_LEVELS.map((level) => {
                const selected = importance === level.key
                const colors = tone(IMPORTANCE_TONE[level.key])
                return (
                  <button
                    key={level.key}
                    type='button'
                    role='radio'
                    aria-checked={selected}
                    onClick={() => !saving && setImportance(level.key)}
                    disabled={saving}
                    className={cn(
                      'flex h-11 min-w-22.5 flex-1 items-center justify-center gap-2 rounded-2xl border-2 px-3 text-xs font-extrabold transition-transform active:translate-y-[3px] disabled:opacity-50',
                      !selected && 'bg-card text-muted-foreground dark:bg-transparent',
                    )}
                    style={
                      selected
                        ? { background: colors.soft, borderColor: colors.solid, color: colors.ink, boxShadow: `0 3px 0 ${colors.solid}` }
                        : { borderColor: 'var(--border)', boxShadow: '0 3px 0 var(--border)' }
                    }
                  >
                    <span className='size-2.5 shrink-0 rounded-full' style={{ background: colors.solid }} aria-hidden='true' />
                    {t(level.label)}
                  </button>
                )
              })}
            </div>
          </div>

          {showDuplicateWarning && (
            <p
              className='m-0 rounded-2xl px-3 py-2 text-xs font-bold'
              style={{ background: 'var(--ica-bad-soft)', color: 'var(--ica-bad-ink)' }}
            >
              {t('Esta palabra ya existe en tu Baúl ICA.')}
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
            size='lg'
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {t('Cancelar')}
          </Button>
          <Button type='button' variant='i' size='lg' disabled={!canSave} onClick={handleSave}>
            {saving ? t('Guardando...') : t('Guardar palabra')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
