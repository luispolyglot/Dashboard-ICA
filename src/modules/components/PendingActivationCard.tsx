import { useState } from 'react'
import { MicIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Panel, tone } from '../game/ui'
import type { PhraseGenerationEntry } from '../types'
import { ActivatePhraseInMasterNoteModal } from './ActivatePhraseInMasterNoteModal'

// AVISO «TIENES UNA FRASE POR ACTIVAR»: la última frase creada que aún no se grabó.
// Un toque y vas directo a grabarla (si hay que elegir nota maestra, se pregunta antes).

const HIDDEN_PREFIX = 'icademy:pending-activation-hidden:'

function readHidden(phraseId: string): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_PREFIX + phraseId) === '1'
  } catch {
    return false
  }
}

export function PendingActivationCard({
  phrase,
  targetLang,
  nativeLang,
  className,
  dismissible = false,
}: {
  phrase: PhraseGenerationEntry
  targetLang: string
  nativeLang: string
  className?: string
  /** Shows an X; closing hides the reminder for this phrase (Luis, 6 Oct: in Creación). */
  dismissible?: boolean
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [hidden, setHidden] = useState(() => dismissible && readHidden(phrase.id))
  const a = tone('a')

  if (hidden) return null

  const hide = () => {
    try {
      window.localStorage.setItem(HIDDEN_PREFIX + phrase.id, '1')
    } catch {
      // Without storage it only hides for this visit.
    }
    setHidden(true)
  }

  return (
    <Panel tone='a' className={cn('relative', className)}>
      {dismissible ? (
        <button
          type='button'
          onClick={hide}
          aria-label={t('Ocultar este aviso')}
          className='absolute top-2 right-2 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
        >
          <XIcon className='size-4' strokeWidth={3} aria-hidden='true' />
        </button>
      ) : null}
      <p className='m-0 flex items-center gap-2 pr-8 text-xs font-extrabold tracking-[0.08em] uppercase' style={{ color: a.ink }}>
        <span className='relative flex size-2.5' aria-hidden='true'>
          <span className='absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none' style={{ background: a.solid }} />
          <span className='relative inline-flex size-2.5 rounded-full' style={{ background: a.solid }} />
        </span>
        {t('Tienes una frase por activar')}
      </p>
      <p className='m-0 mt-2 text-lg leading-snug font-black'>«{phrase.generated_phrase}»</p>
      {phrase.translation ? (
        <p className='m-0 mt-0.5 text-sm font-semibold text-muted-foreground'>{phrase.translation}</p>
      ) : null}
      <Button type='button' variant='a' size='xl' className='mt-4 w-full' onClick={() => setModalOpen(true)}>
        <MicIcon strokeWidth={2.6} aria-hidden='true' />
        {t('Activar ahora')}
      </Button>
      <ActivatePhraseInMasterNoteModal
        open={modalOpen}
        phraseId={phrase.id}
        targetLang={targetLang}
        nativeLang={nativeLang}
        onOpenChange={setModalOpen}
      />
    </Panel>
  )
}
