import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { t } from '@/i18n'
import { BookGlyph, FichaIcon } from '../game/icons'
import { monthLabel } from '../game/monthlyRecap'
import { REVIEW_TOTAL_QUESTIONS } from '../game/monthlyReview/rules'
import { Pill } from '../game/ui'
import { useMonthlyReviewStatus } from '../hooks/useMonthlyReviewStatus'
import { DASHBOARD_ROUTES } from '../routes/paths'

const SHOWN_PREFIX = 'ica-monthly-review-nudge-v1:'

/** Before asking the server: only around the days of the Repaso (the server decides the exact days). */
function nearReviewDays(date = new Date()): boolean {
  const day = date.getDate()
  return day >= 20 && day <= 29
}

/**
 * REPASO DEL MES (Luis, 9 Oct): when the Repaso is open and still not done, a window stops the screen
 * when the student comes in: «haz tu Repaso». Once a day until it is done. It waits if another
 * window is already open (the Test ICA, the welcome guide…) and tries again the next time.
 */
export function MonthlyReviewAvailableModal({ targetLang, nativeLang }: { targetLang?: string; nativeLang?: string }) {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const { status } = useMonthlyReviewStatus({
    targetLang: targetLang ?? '',
    nativeLang: nativeLang ?? '',
    enabled: Boolean(user?.id) && nearReviewDays(),
    withHistory: false,
  })
  const onReviewPage = location.pathname === DASHBOARD_ROUTES.monthlyReview
  const pending = Boolean(status && status.windowOpen && status.eligible && !status.result)
  const shownKey = user?.id && status ? `${SHOWN_PREFIX}${user.id}:${status.today}` : null

  useEffect(() => {
    if (!pending || !shownKey || onReviewPage) return
    try {
      if (window.localStorage.getItem(shownKey)) return
    } catch {
      return
    }
    const timer = window.setTimeout(() => {
      // Another window is on screen: not on top of it; it comes back the next time the app opens.
      if (document.querySelector('[role="dialog"]')) return
      try {
        window.localStorage.setItem(shownKey, '1')
      } catch {
        // Without storage it could come back today; nothing breaks.
      }
      setOpen(true)
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [pending, shownKey, onReviewPage])

  if (!status || !pending) return null
  const month = monthLabel(status.monthStart)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className='gap-5 sm:max-w-md'>
        <div className='-mx-5 -mt-5 flex flex-col items-center gap-2 rounded-t-3xl px-5 pt-7 pb-5 text-center' style={{ background: 'var(--ica-i-soft)' }}>
          <span className='ica-bob'>
            <BookGlyph size={72} />
          </span>
          <Pill tone='ok' solid>
            {t('Ya disponible')}
          </Pill>
        </div>
        <DialogHeader className='items-center text-center'>
          <DialogTitle className='pr-0 text-2xl text-balance'>{t('Tu Repaso de {month} está listo', { month })}</DialogTitle>
          <DialogDescription className='text-balance'>
            {t('¿Cuántas de tus palabras ICA de {month} recuerdas? {n} preguntas, unos 4 minutos y sin reloj. Puedes hacerlo hasta el día {close}.', {
              month,
              n: REVIEW_TOTAL_QUESTIONS,
              close: status.closeDay,
            })}
          </DialogDescription>
        </DialogHeader>
        <div
          className='flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3'
          style={{ background: 'var(--ica-gold-soft)', borderColor: 'color-mix(in oklab, var(--ica-gold) 45%, transparent)' }}
        >
          <FichaIcon size={34} />
          <p className='m-0 text-sm font-bold' style={{ color: 'var(--ica-gold-ink)' }}>
            {t('Ganas tantas ICA Coins como palabras recuerdes de cada 10.')}
          </p>
        </div>
        <div className='flex flex-col gap-2'>
          <Button type='button' size='xl' variant='i' className='w-full text-lg font-extrabold' asChild>
            <Link to={DASHBOARD_ROUTES.monthlyReview} onClick={() => setOpen(false)}>
              {t('Hacer mi Repaso')}
            </Link>
          </Button>
          <Button type='button' variant='ghost' size='lg' className='w-full text-muted-foreground' onClick={() => setOpen(false)}>
            {t('Más tarde')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
