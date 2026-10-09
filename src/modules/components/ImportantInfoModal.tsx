import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import importantInfoMasterclassImage from '@/images/important-info-masterclass.png'
import { t } from '@/i18n'

const IMPORTANT_INFO_VERSION = 'masterclass_monday_v1'
const DISMISS_STORAGE_KEY = `important_info_calendar_notifications_modal_dismissed_${IMPORTANT_INFO_VERSION}`
const MASTERCLASS_SIGNUP_URL = 'https://www.skool.com/icademy/masterclass-incominnn-apuntate'

function getInitialOpenState(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(DISMISS_STORAGE_KEY) !== '1'
}

export function ImportantInfoModal() {
  const [open, setOpen] = useState(getInitialOpenState)
  const dismiss = (): void => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, '1')
    setOpen(false)
  }

  const handleSignup = (): void => {
    window.open(MASTERCLASS_SIGNUP_URL, '_blank', 'noopener,noreferrer')
    dismiss()
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) dismiss() }}>
      <DialogContent
        className='max-h-[90vh] overflow-y-auto p-0 sm:max-w-4xl'
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className='relative p-5 pb-4'>
          <DialogHeader>
            <DialogTitle>{t('Hey, recuerda la masterclass que voy a hacer el lunes.')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {t('Apúntate a la masterclass o confirma que ya estás apuntado.')}
            </DialogDescription>
          </DialogHeader>

          <img
            src={importantInfoMasterclassImage}
            alt={t('Anuncio de la masterclass online de fluidez con Luis')}
            className='mt-4 h-auto w-full rounded-lg border border-border/70'
          />

          <div className='mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2'>
            <Button
              type='button'
              variant='outline'
              onClick={dismiss}
            >
              {t('Ya estoy apuntado')}
            </Button>
            <Button
              type='button'
              onClick={handleSignup}
            >
              {t('Apuntarme')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
