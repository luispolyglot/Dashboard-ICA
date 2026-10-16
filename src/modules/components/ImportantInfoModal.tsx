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
/**
 * Last day the notice is shown (Luis, 16 Oct): the day of the event, as YYYY-MM-DD. From the next
 * day, in each student's own time zone, it never appears again, without having to remove it by
 * hand. The masterclass was on Monday 12 Oct. For a new notice: change the version, the texts,
 * the image and this date (for an event on the 19th, '2026-10-19': on the 20th it is gone).
 */
export const IMPORTANT_INFO_LAST_DAY = '2026-10-12'

/** Today in the device's time zone, as YYYY-MM-DD. */
function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function isImportantInfoOver(now: Date = new Date(), lastDay: string = IMPORTANT_INFO_LAST_DAY): boolean {
  return localDay(now) > lastDay
}

function getInitialOpenState(): boolean {
  if (typeof window === 'undefined') return false
  if (isImportantInfoOver()) return false
  try {
    return window.localStorage.getItem(DISMISS_STORAGE_KEY) !== '1'
  } catch {
    return true
  }
}

export function ImportantInfoModal() {
  const [open, setOpen] = useState(getInitialOpenState)
  const dismiss = (): void => {
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, '1')
    } catch {
      /* without storage it may show again until the event is over */
    }
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
