import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from 'lucide-react'
import { t } from '@/i18n'
import { CreatingPhraseProgress } from './CreatingPhraseProgress'

/**
 * CREACIÓN A PANTALLA COMPLETA (Luis, 15 Oct): when you tap «Generar frase», a full-screen window
 * covers everything. First the mascot with «Creando tu frase…» and the bar; when the phrase
 * arrives, the phrase itself and, fixed at the bottom, «Activar frase». No scrolling to find the
 * next step. Closing it (X or Escape) leaves the phrase on the page, as before.
 */
export function CreationSheet({
  open,
  waiting,
  manual = false,
  onClose,
  children,
  footer,
}: {
  open: boolean
  /** Still waiting for the phrase: show the mascot and the bar instead of `children`. */
  waiting: boolean
  manual?: boolean
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      role='dialog'
      aria-modal='true'
      aria-label={manual ? t('Tu frase') : t('Creando tu frase…')}
      className='fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] animate-in fade-in-0'
    >
      <div className='flex justify-end px-3 pt-3'>
        <button
          type='button'
          onClick={onClose}
          aria-label={t('Cerrar')}
          className='ica-press flex size-11 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground'
        >
          <XIcon className='size-5' strokeWidth={2.8} aria-hidden='true' />
        </button>
      </div>

      <div className='flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4'>
        <div className='mx-auto my-auto flex w-full max-w-lg flex-col gap-4 py-2'>
          {waiting ? (
            <div className='flex flex-col items-center gap-5 text-center'>
              <img
                src='/guia-ica.png'
                alt=''
                aria-hidden='true'
                draggable={false}
                className='ica-bob size-36 select-none object-contain'
              />
              <CreatingPhraseProgress manual={manual} className='w-full max-w-xs' />
              {!manual ? (
                <p className='m-0 max-w-xs text-sm font-bold text-muted-foreground'>
                  {t('La IA está juntando tus palabras ICA en una frase para ti.')}
                </p>
              ) : null}
            </div>
          ) : (
            <div className='ica-pop'>{children}</div>
          )}
        </div>
      </div>

      {!waiting && footer ? (
        <div className='border-t-2 border-border bg-card px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] dark:bg-background'>
          <div className='mx-auto w-full max-w-lg'>{footer}</div>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
