import { useState } from 'react'
import { BarChart3Icon, InfoIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { MetaTrackerStartLevel } from '../../types'
import { IconTile } from '../../game/ui'
import { getMetaTrackerLevelColor } from './colors'
import { computeLevelPosition, getLevelThresholds } from './leveling'
import { langName, t, uiLocale } from '@/i18n'

type MetaTrackerSetupModalProps = {
  targetLang: string
  saving: boolean
  onClose: () => void
  onSave: (payload: {
    startLevel: MetaTrackerStartLevel
    priorIcaWords: number
  }) => Promise<void>
}

const OPTIONS: Array<{ key: MetaTrackerStartLevel; label: string }> = [
  { key: '0', label: 'Desde cero' },
  { key: 'A1', label: 'A1' },
  { key: 'A1+', label: 'A1+' },
  { key: 'A2', label: 'A2' },
  { key: 'A2+', label: 'A2+' },
  { key: 'B1', label: 'B1' },
  { key: 'B1+', label: 'B1+' },
  { key: 'B2', label: 'B2' },
  { key: 'B2+', label: 'B2+' },
  { key: 'C1', label: 'C1' },
]

/**
 * Situar tu nivel real (MetaTracker): eliges directamente tu nivel actual en el idioma
 * y ves dónde quedas en la barra. Se guarda una sola vez.
 */
export function MetaTrackerSetupModal({ targetLang, saving, onClose, onSave }: MetaTrackerSetupModalProps) {
  const [startLevel, setStartLevel] = useState<MetaTrackerStartLevel | null>(null)

  const thresholds = getLevelThresholds(targetLang)
  const baseWords = !startLevel || startLevel === '0' ? 0 : thresholds[startLevel] || 0
  const preview = computeLevelPosition(baseWords, thresholds)
  const previewColor = getMetaTrackerLevelColor(preview.currentLevelKey)

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader className='items-center text-center'>
          <IconTile tone='primary' size={56} solid>
            <BarChart3Icon className='size-7' strokeWidth={2.6} />
          </IconTile>
          <DialogTitle className='pr-0 text-2xl'>{t('Tu nivel actual')}</DialogTitle>
          <DialogDescription className='text-sm font-semibold'>
            {t('¿Qué nivel tienes ahora en {lang}?', { lang: langName(targetLang) })}
          </DialogDescription>
        </DialogHeader>

        {/* Los niveles como botones grandes de su color */}
        <div className='grid grid-cols-3 gap-2'>
          {OPTIONS.map((option) => {
            const selected = startLevel === option.key
            const color = option.key === '0' ? 'var(--muted-foreground)' : getMetaTrackerLevelColor(option.key)
            return (
              <button
                key={option.key}
                type='button'
                onClick={() => setStartLevel(option.key)}
                aria-pressed={selected}
                className={cn(
                  'ica-press flex h-12 items-center justify-center rounded-2xl border-2 text-base font-black transition-colors',
                  option.key === '0' && 'col-span-3 text-sm',
                )}
                style={
                  selected
                    ? { background: color, borderColor: color, color: '#fff', boxShadow: `0 4px 0 color-mix(in oklab, ${color} 70%, black)` }
                    : { borderColor: 'var(--border)', color, boxShadow: '0 3px 0 var(--border)' }
                }
              >
                {t(option.label)}
              </button>
            )
          })}
        </div>

        {/* Dónde quedas en la barra */}
        {startLevel ? (
          <div className='ica-pop rounded-2xl bg-muted/70 p-3'>
            <div className='mb-2 flex items-center justify-between gap-2 text-sm font-extrabold'>
              <span style={{ color: previewColor }}>{preview.currentLevelKey}</span>
              <span className='text-xs font-bold text-muted-foreground tabular-nums'>
                {preview.total.toLocaleString(uiLocale())} {t('palabras')}
              </span>
            </div>
            <span className='relative block h-3 overflow-hidden rounded-full bg-card'>
              <span
                className='absolute inset-y-0 left-0 rounded-full transition-[width] duration-500'
                style={{ width: `${Math.max(4, preview.pctOverall * 100)}%`, background: previewColor }}
              />
            </span>
            {startLevel !== '0' ? (
              <p className='m-0 mt-2.5 flex items-start gap-2 text-xs leading-relaxed font-semibold text-muted-foreground'>
                <SparklesIcon className='mt-0.5 size-3.5 shrink-0' strokeWidth={2.6} style={{ color: previewColor }} aria-hidden='true' />
                <span>
                  {t('¿Por qué {n} palabras? Convertimos tu nivel en las palabras ICA que ya tendrías si hubieras aplicado ICA desde el principio. Así tu barra empieza donde estás de verdad.', {
                    n: preview.total.toLocaleString(uiLocale()),
                  })}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}

        <p className='m-0 flex items-start gap-2 rounded-2xl bg-[var(--ica-gold-soft)] p-3 text-xs leading-relaxed font-semibold text-[var(--ica-gold-ink)]'>
          <InfoIcon className='mt-0.5 size-4 shrink-0' strokeWidth={2.6} aria-hidden='true' />
          {t('Se guarda una sola vez. Los niveles salen de otros alumnos que han aplicado ICA: son acertados, pero no exactos.')}
        </p>

        <Button
          type='button'
          size='xl'
          className='w-full'
          disabled={!startLevel || saving}
          onClick={() => startLevel && void onSave({ startLevel, priorIcaWords: 0 })}
        >
          {saving ? t('Guardando...') : t('Guardar mi nivel')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
