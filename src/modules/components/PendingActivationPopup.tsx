import { useEffect, useState } from 'react'
import { MicIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { t } from '@/i18n'
import { IconTile } from '../game/ui'
import type { PhraseGenerationEntry } from '../types'
import { ActivatePhraseInMasterNoteModal } from './ActivatePhraseInMasterNoteModal'

// «TE FALTA ESTA FRASE POR ACTIVAR» (Luis, 4 oct): al entrar en Activación, si la última frase
// creada HOY aún no está grabada, sale en una ventana. Solo la más reciente (aunque haya más),
// y solo hasta las 00:00: al día siguiente ya no sale (pickPendingActivationPhrase solo acepta
// frases de hoy, y aquí se cierra sola al llegar la medianoche si la pantalla sigue abierta).

function msUntilLocalMidnight(now = new Date()): number {
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return Math.max(1000, midnight.getTime() - now.getTime())
}

export function PendingActivationPopup({
  phrase,
  targetLang,
  nativeLang,
}: {
  phrase: PhraseGenerationEntry | null
  targetLang: string
  nativeLang: string
}) {
  // Una vez por visita a Activación y por frase.
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const [activateOpen, setActivateOpen] = useState(false)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    setExpired(false)
    if (!phrase) return
    const timer = window.setTimeout(() => setExpired(true), msUntilLocalMidnight())
    return () => window.clearTimeout(timer)
  }, [phrase])

  const open = Boolean(phrase && !expired && dismissedId !== phrase.id && !activateOpen)

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? null : setDismissedId(phrase?.id ?? null))}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader className='items-center text-center'>
            <IconTile tone='a' solid size={56}>
              <MicIcon className='size-7' strokeWidth={2.6} />
            </IconTile>
            <DialogTitle className='font-display text-xl font-black tracking-tight'>
              {t('Te falta esta frase por activar')}
            </DialogTitle>
            <DialogDescription className='text-sm font-semibold'>
              {t('La creaste hoy. Grábala con tu voz para completar el ciclo ICA.')}
            </DialogDescription>
          </DialogHeader>
          {phrase ? (
            <div className='rounded-2xl bg-muted/60 p-3 text-center'>
              <p className='m-0 text-lg leading-snug font-black'>«{phrase.generated_phrase}»</p>
              {phrase.translation ? (
                <p className='m-0 mt-0.5 text-sm font-semibold text-muted-foreground'>{phrase.translation}</p>
              ) : null}
            </div>
          ) : null}
          <div className='flex flex-col gap-2'>
            <Button type='button' variant='a' size='xl' className='w-full' onClick={() => setActivateOpen(true)}>
              <MicIcon strokeWidth={2.6} aria-hidden='true' />
              {t('Activar ahora')}
            </Button>
            <Button type='button' variant='outline' className='w-full' onClick={() => setDismissedId(phrase?.id ?? null)}>
              {t('Ahora no')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ActivatePhraseInMasterNoteModal
        open={activateOpen}
        phraseId={phrase?.id ?? null}
        targetLang={targetLang}
        nativeLang={nativeLang}
        onOpenChange={(next) => {
          setActivateOpen(next)
          if (!next) setDismissedId(phrase?.id ?? null)
        }}
      />
    </>
  )
}
