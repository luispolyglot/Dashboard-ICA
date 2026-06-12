import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import importantInfoNmImage from '@/images/important-info-nm.png'

type ImportantInfoMode = 'video' | 'image'

const IMPORTANT_INFO_MODE: ImportantInfoMode = 'image'
const IMPORTANT_INFO_VERSION = 'nm_image_v1'
const DISMISS_STORAGE_KEY =
  `important_info_calendar_notifications_modal_dismissed_${IMPORTANT_INFO_VERSION}`
const VIDEO_DISMISS_DELAY_SECONDS = 10
const IMAGE_DISMISS_DELAY_SECONDS = 5
const DISMISS_DELAY_SECONDS =
  IMPORTANT_INFO_MODE === 'image'
    ? IMAGE_DISMISS_DELAY_SECONDS
    : VIDEO_DISMISS_DELAY_SECONDS
const IMPORTANT_INFO_VIDEO_URL =
  'https://www.loom.com/embed/af1fedb829c54d2a8e6b5a4b412b3e14'
const IMPORTANT_INFO_IMAGE_ALT = 'Informacion importante sobre Notas Maestras'

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
            <DialogTitle>INFORMACION IMPORTANTE</DialogTitle>
            <DialogDescription>
              {IMPORTANT_INFO_MODE === 'video'
                ? 'Mira este video para conocer las novedades importantes.'
                : 'Revisa esta imagen para conocer las novedades importantes.'}
            </DialogDescription>
          </DialogHeader>

          <div className='mt-4 overflow-hidden rounded-lg border border-border/70'>
            {IMPORTANT_INFO_MODE === 'video' ? (
              <iframe
                src={IMPORTANT_INFO_VIDEO_URL}
                title='Informacion importante en video'
                className='h-65 w-full sm:h-105'
                allow='autoplay; fullscreen; picture-in-picture'
                allowFullScreen
              />
            ) : (
              <img
                src={importantInfoNmImage}
                alt={IMPORTANT_INFO_IMAGE_ALT}
                className='h-auto w-full'
              />
            )}
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
                  {IMPORTANT_INFO_MODE === 'video'
                    ? '¿Estás seguro/a que has visto el video hasta el final?'
                    : '¿Estas seguro/a que revisaste toda la informacion?'}
                </p>
                <div className='grid grid-cols-2 gap-2'>
                  <Button
                    type='button'
                    variant='destructive'
                    onClick={handleConfirmYes}
                  >
                    SI
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
