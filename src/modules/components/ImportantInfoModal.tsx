import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
const IMPORTANT_INFO_VERSION = 'nm_video_monthly_score_v1'
const DISMISS_STORAGE_KEY = `important_info_calendar_notifications_modal_dismissed_${IMPORTANT_INFO_VERSION}`
const DISMISS_DELAY_SECONDS = 10
const IMPORTANT_INFO_VIDEO_URL =
  'https://www.loom.com/embed/5857a0cf8d7c4263b86aa89e6e603a3b'

type ConfirmAction = 'close_once' | 'dismiss_forever' | null

function getInitialOpenState(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(DISMISS_STORAGE_KEY) !== '1'
}

export function ImportantInfoModal() {
  const [open, setOpen] = useState(getInitialOpenState)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [secondsLeft, setSecondsLeft] = useState(DISMISS_DELAY_SECONDS)

  useEffect(() => {
    if (!open) return

    setSecondsLeft(DISMISS_DELAY_SECONDS)
    const intervalId = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [open])

  const handleEscapeAction = (): void => {
    setConfirmAction('close_once')
  }

  const handleTemporaryClose = (): void => {
    setOpen(false)
    setConfirmAction(null)
  }

  const handleKeepOpen = (): void => {
    setConfirmAction(null)
  }

  const handleAskDismissForever = (): void => {
    if (secondsLeft > 0) return
    setConfirmAction('dismiss_forever')
  }

  const handleConfirmYes = (): void => {
    if (confirmAction === 'dismiss_forever') {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, '1')
      setOpen(false)
      setConfirmAction(null)
      return
    }

    handleTemporaryClose()
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={() => null}>
      <DialogContent
        showCloseButton={false}
        className='sm:max-w-3xl p-0 overflow-hidden'
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          handleEscapeAction()
        }}
      >
        <div className='relative p-5 pb-4'>
          <DialogHeader>
            <DialogTitle>INFORMACIÓN IMPORTANTE</DialogTitle>
            <DialogDescription>
              Actualización: escuchar las NM ahora cuenta para tu puntaje
              mensual.
            </DialogDescription>
          </DialogHeader>

          <div className='mt-4 overflow-hidden rounded-lg border border-border/70'>
            <iframe
              src={IMPORTANT_INFO_VIDEO_URL}
              title='Información importante en vídeo'
              className='h-65 w-full sm:h-105'
              allow='autoplay; fullscreen; picture-in-picture'
              allowFullScreen
            />
          </div>

          <div className='mt-4'>
            {!confirmAction ? (
              <Button
                type='button'
                onClick={handleAskDismissForever}
                disabled={secondsLeft > 0}
                className='w-full'
              >
                {secondsLeft > 0
                  ? `No volver a mostrar (${secondsLeft})`
                  : 'No volver a mostrar'}
              </Button>
            ) : (
              <div className='space-y-2'>
                <p className='text-sm font-semibold'>
                  ¿Estás seguro/a de que has visto el vídeo hasta el final?
                </p>
                <div className='grid grid-cols-2 gap-2'>
                  <Button
                    type='button'
                    variant='destructive'
                    onClick={handleConfirmYes}
                  >
                    SÍ
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={handleKeepOpen}
                  >
                    NO
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
